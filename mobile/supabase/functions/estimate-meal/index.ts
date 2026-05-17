import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };

// The contract we hand Haiku. Caching this saves ~80% of input cost steady state.
//
// Tone constraints follow Virra's fuelling-language rule from CLAUDE.md —
// never moralise the food, never "treat/splurge/indulgent" framing.
// UK portion defaults reflect the primary user base.
const SYSTEM_PROMPT = `You are Virra's meal estimator. The user describes what they just ate in natural language; you return a structured nutrition estimate.

OUTPUT FORMAT — strict JSON only, no prose, no markdown fences, no commentary:
{
  "items": [
    {
      "food_name":   string,
      "quantity_g":  number,
      "calories":    number,
      "carbs_g":     number,
      "protein_g":   number,
      "fat_g":       number,
      "fibre_g":     number,
      "confidence":  number  // 0..1
    }
  ],
  "overall_confidence": number,  // 0..1
  "notes": string | null
}

RULES:
- Use UK portion conventions. Standard pub burger ~150g cooked weight, standard chips portion ~200g, pint of lager ~568ml, flat white ~200ml, slice of toast ~35g. Scale up/down when the description specifies size.
- Macro values are TOTAL for the specified portion (NOT per 100g). Calories in kcal.
- "confidence" per item: lower (0.3–0.5) for restaurant dishes with high prep variance, higher (0.7–0.9) for branded packaged foods or simple home cooking.
- "overall_confidence": holistic. If any single item is highly uncertain, drag the overall down.
- Never editorialise the food. Never use words like "high", "indulgent", "treat", "splurge", "healthy", "unhealthy". Just report what is in it.
- "notes" is for ambiguity the user should know about (e.g. "Estimate assumes pub-size portion — adjust grams if larger"). Otherwise null.
- If the description is empty or makes no sense as food, return {"items":[],"overall_confidence":0,"notes":"Couldn't parse this — try again with more detail"}.
- Always include fibre_g, even if 0.`;

function err(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });
}

interface EstimateItem {
  food_name:  string;
  quantity_g: number;
  calories:   number;
  carbs_g:    number;
  protein_g:  number;
  fat_g:      number;
  fibre_g:    number;
  confidence: number;
}

interface EstimateResponse {
  items:               EstimateItem[];
  overall_confidence:  number;
  notes:               string | null;
  error?:              "parse_failed";
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num(n: unknown, fallback = 0): number {
  const x = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return isFinite(x) ? Math.max(0, Math.round(x * 10) / 10) : fallback;
}

function sanitiseItems(raw: unknown): EstimateItem[] {
  if (!Array.isArray(raw)) return [];
  const out: EstimateItem[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.food_name === "string" ? o.food_name.trim() : "";
    if (!name) continue;
    out.push({
      food_name:  name,
      quantity_g: num(o.quantity_g),
      calories:   num(o.calories),
      carbs_g:    num(o.carbs_g),
      protein_g:  num(o.protein_g),
      fat_g:      num(o.fat_g),
      fibre_g:    num(o.fibre_g),
      confidence: clamp01(o.confidence),
    });
  }
  return out;
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

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
  if (authErr || !user) return err("Unauthorized", 401);

  // Service role for the rate-limit read — bypasses RLS so we can scan food_entries
  // joined through nutrition_logs without an explicit user_id column.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { description?: string };
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const description = (body.description ?? "").trim();
  if (!description) return err("Description required", 400);
  if (description.length > 500) return err("Description too long (max 500 chars)", 400);

  // --- Rate limit: 5 Haiku-sourced inserts per user per minute ---
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: recentHaikuRows } = await supabase
    .from("food_entries")
    .select("id, nutrition_logs!inner(user_id)")
    .eq("source", "haiku")
    .eq("nutrition_logs.user_id", user.id)
    .gte("created_at", oneMinuteAgo)
    .limit(10);
  if ((recentHaikuRows?.length ?? 0) >= 5) {
    return err("Too many estimates — wait a minute and try again.", 429);
  }

  // --- Haiku call ---
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return err("Estimation unavailable", 500);

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
      max_tokens: 800,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: description }],
    }),
  });

  if (!aiRes.ok) {
    console.error("Haiku estimate-meal error:", aiRes.status, await aiRes.text());
    return err("Estimation failed", 502);
  }

  let aiJson: { content?: Array<{ text?: string }> };
  try { aiJson = await aiRes.json(); }
  catch {
    return new Response(
      JSON.stringify({ items: [], overall_confidence: 0, notes: null, error: "parse_failed" } satisfies EstimateResponse),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  const rawText = aiJson.content?.[0]?.text?.trim() ?? "";
  const match   = rawText.match(/\{[\s\S]*\}/);

  if (!match) {
    return new Response(
      JSON.stringify({ items: [], overall_confidence: 0, notes: null, error: "parse_failed" } satisfies EstimateResponse),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(match[0]); }
  catch {
    console.error("estimate-meal JSON parse failed:", rawText);
    return new Response(
      JSON.stringify({ items: [], overall_confidence: 0, notes: null, error: "parse_failed" } satisfies EstimateResponse),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  const items = sanitiseItems(parsed.items);
  const overall = clamp01(parsed.overall_confidence);
  const notes = typeof parsed.notes === "string" && parsed.notes.trim() ? parsed.notes.trim() : null;

  const response: EstimateResponse = {
    items,
    overall_confidence: overall,
    notes,
  };

  return new Response(JSON.stringify(response), { headers: JSON_HEADERS });
});
