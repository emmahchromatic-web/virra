import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type InsightType = "dashboard" | "weekly";
type CyclePhase  = "menstrual" | "follicular" | "ovulatory" | "luteal";

const VALID_PHASES  = new Set<string>(["menstrual","follicular","ovulatory","luteal"]);
const JSON_HEADERS  = { "Content-Type": "application/json" };
const SYSTEM_PROMPT = `You are Virra's training intelligence. You write short, direct, motivating insight for women runners. Two sentences maximum per section. Never use diet culture language. Speak to the runner directly. Never use em-dashes; use full stops, commas or colons instead. Current phase context will follow.`;

function err(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });
}

function addDays(d: Date, n: number): string {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r.toISOString().split("T")[0];
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
  if (!authHeader) return err("Unauthorized", 401);

  // Anon client to authenticate the user
  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
  if (authErr || !user) return err("Unauthorized", 401);

  // Service role client for DB writes (insights_cache has no user insert policy)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { insight_type: InsightType; phase?: string; day_of_cycle?: number };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const { insight_type, phase, day_of_cycle } = body;
  if (insight_type !== "dashboard" && insight_type !== "weekly") {
    return err("Invalid insight_type", 400);
  }
  const safePhase = phase && VALID_PHASES.has(phase) ? (phase as CyclePhase) : null;

  // --- Cache check ---
  const { data: cached } = await supabase
    .from("insights_cache")
    .select("training_text, nutrition_text, overall_text, generated_at, expires_at")
    .eq("user_id", user.id)
    .eq("insight_type", insight_type)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return new Response(
      JSON.stringify({
        training_text:  cached.training_text,
        nutrition_text: cached.nutrition_text,
        overall_text:   cached.overall_text ?? null,
        generated_at:   cached.generated_at,
        cached:         true,
      }),
      { headers: JSON_HEADERS },
    );
  }

  // --- Aggregate data ---
  const today       = new Date();
  const todayISO    = today.toISOString().split("T")[0];
  const past14ISO   = addDays(today, -14);
  const past7ISO    = addDays(today, -7);
  const past28ISO   = addDays(today, -28);
  const future14ISO = addDays(today, 14);

  const [activitiesRes, plannedFutureRes, sessionsWindowRes,
         nutritionRes, symptomsRes, eventsRes] = await Promise.all([
    supabase
      .from("activities")
      .select("started_at, activity_type, distance_meters")
      .eq("user_id", user.id)
      .gte("started_at", `${past14ISO}T00:00:00Z`)
      .order("started_at", { ascending: false }),

    supabase
      .from("planned_sessions")
      .select("scheduled_date, modality, session_label, status")
      .eq("user_id", user.id)
      .gte("scheduled_date", todayISO)
      .lte("scheduled_date", future14ISO)
      .neq("status", "moved")
      .order("scheduled_date"),

    supabase
      .from("planned_sessions")
      .select("status")
      .eq("user_id", user.id)
      .gte("scheduled_date", past28ISO)
      .lte("scheduled_date", todayISO)
      .neq("status", "moved"),

    supabase
      .from("nutrition_logs")
      .select("recorded_on, targets_json, food_entries(calories)")
      .eq("user_id", user.id)
      .gte("recorded_on", past7ISO)
      .order("recorded_on", { ascending: false }),

    supabase
      .from("symptom_logs")
      .select("recorded_on, energy, mood, sleep_quality")
      .eq("user_id", user.id)
      .order("recorded_on", { ascending: false })
      .limit(7),

    supabase
      .from("user_events")
      .select("name, event_date")
      .eq("user_id", user.id)
      .gte("event_date", todayISO)
      .lte("event_date", future14ISO)
      .order("event_date"),
  ]);

  // Adherence
  const sessionWindow  = sessionsWindowRes.data ?? [];
  const completed      = sessionWindow.filter((s: any) => s.status === "completed").length;
  const dropped        = sessionWindow.filter((s: any) => s.status === "dropped").length;
  const adherencePct   = completed + dropped > 0
    ? Math.round((completed / (completed + dropped)) * 100)
    : null;

  // Recent activity summary.
  //
  // Card 216 fixed this exact bug in the CLIENT metric tiles and never touched
  // this copy of it. Without the activity_type filter every imported walk, hike
  // and ride carrying a distance lands in the runner's mileage, so the written
  // insight quoted roughly three times the tile beside it (37 km against 12.9).
  //
  // The window is deliberately named for what it is. This runs server-side with
  // no knowledge of the user's timezone, so it cannot reproduce the tiles' local
  // Monday-start week; calling a rolling 7 days "this week" is what invited the
  // comparison in the first place.
  const activities  = activitiesRes.data ?? [];
  const last7Runs   = activities.filter(
    (a: any) => a.activity_type === "run" && a.started_at >= `${past7ISO}T00:00:00Z`,
  );
  const runKmLast7  = Math.round(
    last7Runs.reduce((s: number, a: any) => s + (a.distance_meters ?? 0) / 1000, 0) * 10
  ) / 10;

  // Symptom average
  const symptoms   = symptomsRes.data ?? [];
  const avgEnergy  = symptoms.length > 0
    ? Math.round(symptoms.reduce((s: number, r: any) => s + (r.energy ?? 0), 0) / symptoms.length * 10) / 10
    : null;
  const avgMood    = symptoms.length > 0
    ? Math.round(symptoms.reduce((s: number, r: any) => s + (r.mood ?? 0), 0) / symptoms.length * 10) / 10
    : null;

  const dataContext = {
    phase:               safePhase,
    day_of_cycle:        day_of_cycle ?? null,
    adherence_pct:       adherencePct,
    // Key name matters: dataContext is JSON-stringified straight into the
    // prompt, so this is how the model will describe the number.
    run_km_last_7_days:  runKmLast7,
    activities_14d:      activities.length,
    upcoming_sessions:   (plannedFutureRes.data ?? []).map((s: any) => ({
      date:     s.scheduled_date,
      type:     s.session_label,
      modality: s.modality,
    })),
    upcoming_events:     (eventsRes.data ?? []).map((e: any) => ({ name: e.name, date: e.event_date })),
    avg_energy_7d:       avgEnergy,
    avg_mood_7d:         avgMood,
    nutrition_logs_7d:   (nutritionRes.data ?? []).length,
  };

  // --- Call Haiku ---
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return err("Insight generation unavailable", 500);

  const isInsufficient = activities.length === 0 && (plannedFutureRes.data ?? []).length === 0;
  if (isInsufficient) {
    // Not enough signal, so fall back to phase-only text and don't call Haiku
    const phaseDefaults: Record<string, { training: string; nutrition: string }> = {
      menstrual:  { training: "Rest and restore. Gentle movement only today.", nutrition: "Iron-rich foods support your recovery this phase." },
      follicular: { training: "Energy is rising. This is a great time to build intensity.", nutrition: "Lean protein and complex carbs fuel adaptation." },
      ovulatory:  { training: "Your peak performance window. Push hard today.", nutrition: "High-carb fuelling matches your body's readiness." },
      luteal:     { training: "Moderate effort. Your fatigue signals are real, so honour them.", nutrition: "Carbs curb cravings and support mood this phase." },
    };
    const defaults = phaseDefaults[safePhase ?? "follicular"];
    return new Response(
      JSON.stringify({ training_text: defaults.training, nutrition_text: defaults.nutrition, overall_text: null, cached: false }),
      { headers: JSON_HEADERS },
    );
  }

  const userPrompt = insight_type === "dashboard"
    ? `Phase data: ${JSON.stringify(dataContext)}\n\nReturn ONLY valid JSON with no markdown: {"training":"<2 sentences>","nutrition":"<2 sentences>"}`
    : `Data: ${JSON.stringify(dataContext)}\n\nReturn ONLY valid JSON with no markdown: {"overall":"<3-4 sentence weekly overview>","training":"<2 sentences>","nutrition":"<2 sentences>"}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta":    "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: insight_type === "dashboard" ? 200 : 500,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    console.error("Haiku error:", aiRes.status, await aiRes.text());
    return err("Insight generation failed", 502);
  }

  let aiJson: any;
  try {
    aiJson = await aiRes.json();
  } catch {
    return err("Insight generation failed", 502);
  }

  const inputTokens  = aiJson.usage?.input_tokens  ?? 0;
  const outputTokens = aiJson.usage?.output_tokens ?? 0;
  const rawText      = aiJson.content?.[0]?.text?.trim() ?? "";

  let parsed: { training?: string; nutrition?: string; overall?: string } = {};
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    console.error("JSON parse failed:", rawText);
    return err("Insight generation failed", 502);
  }

  const trainingText  = parsed.training?.trim()  ?? "";
  const nutritionText = parsed.nutrition?.trim()  ?? "";
  const overallText   = parsed.overall?.trim()    ?? null;

  if (!trainingText || !nutritionText) return err("Insight generation failed", 502);

  const generatedAt = today.toISOString();
  const expiresAt   = addDays(today, 1) + "T00:00:00Z"; // expires tomorrow at midnight

  const { error: upsertErr } = await supabase.from("insights_cache").upsert(
    {
      user_id:        user.id,
      insight_type,
      phase:          safePhase ?? "follicular",
      training_text:  trainingText,
      nutrition_text: nutritionText,
      overall_text:   overallText,
      generated_at:   generatedAt,
      expires_at:     expiresAt,
      input_tokens:   inputTokens,
      output_tokens:  outputTokens,
    },
    { onConflict: "user_id,insight_type" },
  );
  if (upsertErr) console.error("Cache upsert failed:", upsertErr.message);

  return new Response(
    JSON.stringify({
      training_text:  trainingText,
      nutrition_text: nutritionText,
      overall_text:   overallText,
      generated_at:   generatedAt,
      cached:         false,
    }),
    { headers: JSON_HEADERS },
  );
});
