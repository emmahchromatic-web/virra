import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PeriodType   = "weekly" | "monthly";
type CyclePhase   = "menstrual" | "follicular" | "ovulatory" | "luteal";

interface PhasePacePayload {
  phase:           string;
  avgPaceSecPerKm: number;
  activityCount:   number;
}

interface MetricsPayload {
  streakDays:         unknown;
  weeklyKm:           unknown;
  monthlyKm:          unknown;
  totalKm:            unknown;
  consistencyPct:     unknown;
  activitiesThisWeek: unknown;
  phasePaces:         unknown;
}

interface RequestPayload {
  period_type:        PeriodType;
  period_key:         string;
  metrics:            MetricsPayload;
  phase?:             CyclePhase;
  day_of_cycle?:      number;
  days_since_signup?: number;
}

const VALID_PHASES   = new Set<string>(["menstrual", "follicular", "ovulatory", "luteal"]);
const WEEK_KEY_RE    = /^\d{4}-W\d{2}$/;
const MONTH_KEY_RE   = /^\d{4}-\d{2}$/;

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function safePhasePaces(raw: unknown): PhasePacePayload[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is PhasePacePayload =>
      p !== null &&
      typeof p === "object" &&
      VALID_PHASES.has(String(p.phase)) &&
      Number.isFinite(Number(p.avgPaceSecPerKm)) &&
      Number(p.avgPaceSecPerKm) > 0 &&
      Number(p.avgPaceSecPerKm) < 1800
    )
    .map((p) => ({
      phase:           String(p.phase),
      avgPaceSecPerKm: Math.round(Number(p.avgPaceSecPerKm)),
      activityCount:   Math.max(0, Math.round(Number(p.activityCount))),
    }));
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function errResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errResponse("Unauthorized", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return errResponse("Unauthorized", 401);

  let body: RequestPayload;
  try {
    body = await req.json() as RequestPayload;
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { period_type, period_key, metrics, phase, day_of_cycle, days_since_signup } = body;

  // Validate inputs before touching DB
  if (period_type !== "weekly" && period_type !== "monthly") {
    return errResponse("Invalid period_type", 400);
  }
  const keyPattern = period_type === "weekly" ? WEEK_KEY_RE : MONTH_KEY_RE;
  if (!keyPattern.test(period_key)) {
    return errResponse("Invalid period_key format", 400);
  }
  const safePhase = phase && VALID_PHASES.has(phase) ? phase : null;

  // Check cache
  const { data: cached } = await supabase
    .from("insight_cache")
    .select("narrative, generated_at")
    .eq("user_id", user.id)
    .eq("period_type", period_type)
    .eq("period_key", period_key)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime();
    if (age < CACHE_MAX_AGE_MS) {
      return new Response(JSON.stringify({ narrative: cached.narrative, cached: true }), {
        headers: JSON_HEADERS,
      });
    }
  }

  // Sanitise all metric fields: coerce to numbers to prevent prompt injection
  const streakDays         = safeNum(metrics.streakDays);
  const weeklyKm           = safeNum(metrics.weeklyKm);
  const monthlyKm          = safeNum(metrics.monthlyKm);
  const totalKm            = safeNum(metrics.totalKm);
  const consistencyPct     = Math.min(100, safeNum(metrics.consistencyPct));
  const activitiesThisWeek = safeNum(metrics.activitiesThisWeek);
  const phasePaces         = safePhasePaces(metrics.phasePaces);

  const safeDaysSince = Math.max(0, Math.round(safeNum(days_since_signup, 0)));
  const isNewUser     = safeDaysSince < 14 && safeNum(metrics.totalKm) < 5;

  const periodLabel = period_type === "weekly" ? "this week" : "this month";

  const phasePaceLines = phasePaces.length > 0
    ? phasePaces
        .map((p) =>
          `  - ${p.phase}: ${Math.floor(p.avgPaceSecPerKm / 60)}:${String(Math.floor(p.avgPaceSecPerKm % 60)).padStart(2, "0")}/km (${p.activityCount} runs)`
        )
        .join("\n")
    : "  - No data yet";

  const prompt = isNewUser
    ? `You are a supportive running coach for a women's fitness app called Virra. A new user signed up ${safeDaysSince === 0 ? 'today' : `${safeDaysSince} day${safeDaysSince === 1 ? '' : 's'} ago`}. Their current cycle phase is ${safePhase ?? 'unknown'}${day_of_cycle ? ` (day ${Math.max(1, Math.min(40, Math.round(Number(day_of_cycle) || 1)))})` : ''}.

Write a 2–3 sentence welcome message that:
1. Acknowledges this is the start of their journey with Virra
2. Gives one phase-aware tip they can use right now, today, based on where they are in their cycle
3. Sets a warm expectation for what insights will show as they log more runs

Tone: warm, direct, expert, like a coach who's glad you showed up. Never salesy.
Punctuation: never use em-dashes. Use full stops, commas or colons instead.
Do not use emojis or bullet points. Plain prose only.`
    : `You are a supportive running coach for a women's fitness app called Virra. The user's current cycle phase is ${safePhase ?? "unknown"}${day_of_cycle ? ` (day ${Math.max(1, Math.min(40, Math.round(Number(day_of_cycle) || 1)))})` : ""}.

${period_type === "weekly" ? "Weekly" : "Monthly"} summary:
- Streak: ${streakDays} consecutive active days
- Distance ${periodLabel}: ${period_type === "weekly" ? weeklyKm : monthlyKm} km
- Total distance ever: ${totalKm} km
- Consistency (last 28 days): ${consistencyPct}%
- Activities this week: ${activitiesThisWeek}
- Average pace by cycle phase:
${phasePaceLines}

Write a 2-3 sentence narrative insight that:
1. Celebrates one specific thing from the data
2. Gives one phase-aware recommendation for the coming ${period_type === "weekly" ? "week" : "month"}
3. Uses fuelling and performance language only, never calorie restriction, never diet culture
4. Speaks directly to the runner in second person ("you", not "she")
Tone: warm, direct, expert. Like a coach who knows her data.
Do not use emojis or bullet points. Plain prose only.`;

  // Call Haiku
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return errResponse("Insight generation unavailable", 500);

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    console.error("Haiku API error:", aiRes.status, await aiRes.text());
    return errResponse("Insight generation failed", 502);
  }

  let aiJson: { content?: { text?: string }[] };
  try {
    aiJson = await aiRes.json();
  } catch {
    return errResponse("Insight generation failed", 502);
  }

  const narrative = aiJson.content?.[0]?.text?.trim() ?? "";
  if (!narrative) return errResponse("Insight generation failed", 502);

  // Upsert cache: log but don't fail the request on cache write errors
  const { error: upsertErr } = await supabase.from("insight_cache").upsert(
    {
      user_id:      user.id,
      period_type,
      period_key,
      narrative,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_type,period_key" },
  );
  if (upsertErr) console.error("Cache upsert failed:", upsertErr.message);

  return new Response(JSON.stringify({ narrative, cached: false }), {
    headers: JSON_HEADERS,
  });
});
