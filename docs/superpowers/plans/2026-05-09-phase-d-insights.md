# Phase D Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Insights screen and dashboard cards to Haiku-generated narratives cached in Supabase, with event-driven invalidation so insights stay coherent with the user's current plan and body state automatically.

**Architecture:** A Postgres-triggered lazy cache (`insights_cache`) holds Haiku-generated `training_text`, `nutrition_text`, and `overall_text` per user and insight type ('dashboard' | 'weekly'). Data-change triggers expire the cache; the Edge Function `generate-insights` is called on screen focus only when stale. The dashboard replaces static `PHASE_META` strings with cached Haiku text (falling back to static on miss). The Insights screen gains a Recovery section (symptom trend) and an Upcoming section (14-day session + event lookahead) with an Add Event flow.

**Tech Stack:** Supabase MCP (migration + edge function deploy), React Native, Expo Router, existing `VirraCard`/`VirraModal`/`VirraButton`/`VirraText`, Anthropic Haiku API (prompt caching), Zustand (`useAuthStore`, `useCycleStore`).

**Spec:** `docs/superpowers/specs/2026-05-09-phase-d-insights-design.md`

---

## Context

The existing codebase has a partial insights implementation using a **different schema**:
- `insight_cache` table (no 's') with `period_key` / `narrative` fields — **not the spec schema**
- `generate-insight` Edge Function (singular) with client-side metric pre-computation — **different architecture**
- `insights.tsx` calls the old function and references `insight_cache`
- `insightMetrics.ts` already computes streak, km, consistency, phase-pace

The plan builds the spec architecture alongside the old one, then migrates the screen. The old `generate-insight` function is left untouched.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/009_insights_cache.sql` | `insights_cache` + `user_events` tables + RLS + 5 cache-expiry triggers |
| Create | `supabase/functions/generate-insights/index.ts` | Edge Function: aggregate data server-side, call Haiku, write `insights_cache` |
| Modify | `src/lib/insightMetrics.ts` | Add `trainingAdherencePct`, `nutritionCompliancePct`, `symptomTrend` to `InsightMetrics` |
| Modify | `app/(app)/(tabs)/index.tsx` | Replace static `PHASE_META.training/nutrition` with Haiku cache; loading skeleton |
| Modify | `app/(app)/insights.tsx` | Wire `overall_text` from `insights_cache`; add Recovery + Upcoming sections; remove pull-to-refresh; add footer timestamp |
| Create | `src/components/ui/AddEventModal.tsx` | Name + date form; saves to `user_events`; used in Insights Upcoming section |

---

## Task 1: DB Migration — `insights_cache`, `user_events`, and Triggers

**Files:**
- Create: `supabase/migrations/009_insights_cache.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/009_insights_cache.sql`:

```sql
-- ─── insights_cache ────────────────────────────────────────────────────────
create table public.insights_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  insight_type    text not null check (insight_type in ('dashboard', 'weekly')),
  phase           text not null,
  training_text   text not null,
  nutrition_text  text not null,
  overall_text    text,
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  input_tokens    integer,
  output_tokens   integer,
  unique (user_id, insight_type)
);

alter table public.insights_cache enable row level security;

create policy "Users read own insights"
  on public.insights_cache for select using (auth.uid() = user_id);

-- The edge function writes via service role — no INSERT/UPDATE policy needed for anon/user.

-- ─── user_events ───────────────────────────────────────────────────────────
create table public.user_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  event_date  date not null,
  notes       text,
  created_at  timestamptz default now()
);

alter table public.user_events enable row level security;

create policy "Users manage own events"
  on public.user_events for all using (auth.uid() = user_id);

-- ─── Cache invalidation ────────────────────────────────────────────────────
-- Triggers expire insights_cache when underlying data changes.
-- Haiku is only called the next time the user opens the dashboard or Insights screen.

create or replace function expire_insights_cache()
returns trigger language plpgsql security definer as $$
begin
  update public.insights_cache
  set expires_at = now()
  where user_id = coalesce(new.user_id, old.user_id);
  return null;
end;
$$;

create trigger trg_insights_expire_activities
  after insert on public.activities
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_planned_sessions
  after update of status on public.planned_sessions
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_symptom_logs
  after insert on public.symptom_logs
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_user_events
  after insert or update or delete on public.user_events
  for each row execute function expire_insights_cache();

create trigger trg_insights_expire_training_blocks
  after insert on public.training_blocks
  for each row execute function expire_insights_cache();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `009_insights_cache` and the SQL above.

Verify with `mcp__supabase__execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('insights_cache','user_events')
order by table_name;
```
Expected: 2 rows — `insights_cache`, `user_events`.

Also verify triggers:
```sql
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name like 'trg_insights_%'
order by event_object_table;
```
Expected: 5 rows across `activities`, `planned_sessions`, `symptom_logs`, `training_blocks`, `user_events`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_insights_cache.sql
git commit -m "feat: insights_cache + user_events tables + cache-expiry triggers"
```

---

## Task 2: Edge Function `generate-insights`

**Files:**
- Create: `supabase/functions/generate-insights/index.ts`

This function aggregates data server-side, calls Haiku with prompt caching, and writes the result to `insights_cache`. The app only calls this on screen focus when the cache is stale.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/generate-insights/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type InsightType = "dashboard" | "weekly";
type CyclePhase  = "menstrual" | "follicular" | "ovulatory" | "luteal";

const VALID_PHASES  = new Set<string>(["menstrual","follicular","ovulatory","luteal"]);
const JSON_HEADERS  = { "Content-Type": "application/json" };
const SYSTEM_PROMPT = `You are Virra's training intelligence. You write short, direct, motivating insight for women runners. Two sentences maximum per section. Never use diet culture language. Speak to the runner directly. Current phase context will follow.`;

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

  // Recent activity summary
  const activities  = activitiesRes.data ?? [];
  const last7Acts   = activities.filter((a: any) => a.started_at >= `${past7ISO}T00:00:00Z`);
  const weeklyKm    = Math.round(
    last7Acts.reduce((s: number, a: any) => s + (a.distance_meters ?? 0) / 1000, 0) * 10
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
    weekly_km:           weeklyKm,
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
    // Not enough signal — fall back to phase-only text, don't call Haiku
    const phaseDefaults: Record<string, { training: string; nutrition: string }> = {
      menstrual:  { training: "Rest and restore — gentle movement only today.", nutrition: "Iron-rich foods support your recovery this phase." },
      follicular: { training: "Energy is rising. This is a great time to build intensity.", nutrition: "Lean protein and complex carbs fuel adaptation." },
      ovulatory:  { training: "Your peak performance window. Push hard today.", nutrition: "High-carb fuelling matches your body's readiness." },
      luteal:     { training: "Moderate effort. Honour fatigue signals — they are real.", nutrition: "Carbs curb cravings and support mood this phase." },
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
```

- [ ] **Step 2: Deploy via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with:
- `name`: `generate-insights`
- `files`: the file above at path `supabase/functions/generate-insights/index.ts`

Verify with `mcp__supabase__list_edge_functions` — `generate-insights` should appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-insights/index.ts
git commit -m "feat: generate-insights Edge Function — server-side aggregation, Haiku call, insights_cache write"
```

---

## Task 3: Extend `insightMetrics.ts`

**Files:**
- Modify: `src/lib/insightMetrics.ts`

Add three new fields to `InsightMetrics`: `trainingAdherencePct` (null if no planned sessions), `nutritionCompliancePct` (null if no nutrition logs), `symptomTrend` (null if no symptom logs). These power the enhanced Insights screen sections.

- [ ] **Step 1: Add new fields to `InsightMetrics` interface**

In `src/lib/insightMetrics.ts`, replace:
```typescript
export interface InsightMetrics {
  streakDays:         number;
  weeklyKm:           number;
  monthlyKm:          number;
  totalKm:            number;
  consistencyPct:     number;
  phasePaces:         PhasePace[];
  activitiesThisWeek: number;
}
```
with:
```typescript
export interface SymptomTrend {
  energy: number;
  mood:   number;
  sleep:  number;
}

export interface InsightMetrics {
  streakDays:              number;
  weeklyKm:                number;
  monthlyKm:               number;
  totalKm:                 number;
  consistencyPct:          number;
  phasePaces:              PhasePace[];
  activitiesThisWeek:      number;
  trainingAdherencePct:    number | null;
  nutritionCompliancePct:  number | null;
  symptomTrend:            SymptomTrend | null;
}
```

- [ ] **Step 2: Extend `computeInsightMetrics` to fetch additional data**

At the top of `computeInsightMetrics`, define the 28-day window variable alongside the others:

Locate `const window28 = new Date(now.getTime() - 28 * 86400000);` and add after it:
```typescript
const window7    = new Date(now.getTime() - 7 * 86400000);
const window7ISO = window7.toISOString().split('T')[0];
const window28ISO = window28.toISOString().split('T')[0];
const todayISO   = now.toISOString().split('T')[0];
```

- [ ] **Step 3: Add three new queries to the `Promise.all`**

Replace the existing `Promise.all` call (which has 5 queries) with a 8-query version by adding:

```typescript
    supabase
      .from('planned_sessions')
      .select('status')
      .eq('user_id', userId)
      .gte('scheduled_date', window28ISO)
      .lte('scheduled_date', todayISO)
      .neq('status', 'moved'),

    supabase
      .from('nutrition_logs')
      .select('recorded_on, targets_json, food_entries(calories)')
      .eq('user_id', userId)
      .gte('recorded_on', window7ISO)
      .order('recorded_on'),

    supabase
      .from('symptom_logs')
      .select('energy, mood, sleep_quality')
      .eq('user_id', userId)
      .order('recorded_on', { ascending: false })
      .limit(7),
```

Update the destructure line:
```typescript
const [weekRes, monthRes, totalRes, window28Res, paceRes,
       sessionsWindowRes, nutritionLogsRes, symptomLogsRes] = await Promise.all([
```

Add error guards:
```typescript
  if (sessionsWindowRes.error)  throw sessionsWindowRes.error;
  if (nutritionLogsRes.error)   throw nutritionLogsRes.error;
  if (symptomLogsRes.error)     throw symptomLogsRes.error;
```

- [ ] **Step 4: Compute the new metrics**

After the existing `consistencyPct` computation, add:

```typescript
  // Training adherence
  const sessionWindow = sessionsWindowRes.data ?? [];
  const completedSessions = sessionWindow.filter((s: any) => s.status === 'completed').length;
  const droppedSessions   = sessionWindow.filter((s: any) => s.status === 'dropped').length;
  const trainingAdherencePct = completedSessions + droppedSessions > 0
    ? Math.round((completedSessions / (completedSessions + droppedSessions)) * 100)
    : null;

  // Nutrition compliance — days where actual calories within 10% of target
  const nutritionLogs = nutritionLogsRes.data ?? [];
  let compliantDays = 0;
  let loggedDays    = 0;
  for (const log of nutritionLogs as any[]) {
    const targetCal: number = (log.targets_json as any)?.calories ?? 0;
    if (!targetCal) continue;
    const actualCal = (log.food_entries as any[])
      .reduce((s: number, e: any) => s + (e.calories ?? 0), 0);
    if (actualCal > 0) {
      loggedDays++;
      if (Math.abs(actualCal - targetCal) / targetCal <= 0.10) compliantDays++;
    }
  }
  const nutritionCompliancePct = loggedDays > 0
    ? Math.round((compliantDays / loggedDays) * 100)
    : null;

  // Symptom trend — 7-entry average
  const symptomRows = symptomLogsRes.data ?? [];
  let symptomTrend: SymptomTrend | null = null;
  if (symptomRows.length > 0) {
    const avg = (key: string) =>
      Math.round(
        (symptomRows as any[]).reduce((s: number, r: any) => s + (r[key] ?? 0), 0) /
          symptomRows.length * 10
      ) / 10;
    symptomTrend = { energy: avg('energy'), mood: avg('mood'), sleep: avg('sleep_quality') };
  }
```

- [ ] **Step 5: Add new fields to the return value**

In the `return { ... }` block at the end of `computeInsightMetrics`, append:
```typescript
    trainingAdherencePct,
    nutritionCompliancePct,
    symptomTrend,
```

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/insightMetrics.ts
git commit -m "feat: add trainingAdherencePct, nutritionCompliancePct, symptomTrend to InsightMetrics"
```

---

## Task 4: Dashboard — Wire Haiku Insight Cards

**Files:**
- Modify: `app/(app)/(tabs)/index.tsx`

Replace the static `PHASE_META.training` and `PHASE_META.nutrition` strings in the two `GuidanceCard` calls with Haiku-cached text. Show skeleton while loading; fall back to `PHASE_META` on miss or offline.

- [ ] **Step 1: Add insight state and fetch logic**

In `DashboardScreen()`, after the existing state declarations (`useState(0)`, `useState(0)`), add:

```typescript
const [insightTexts,   setInsightTexts]   = useState<{ training: string; nutrition: string } | null>(null);
const [insightLoading, setInsightLoading] = useState(false);
```

Then add a `loadInsight` function inside `DashboardScreen()`, before the `useEffect`:

```typescript
const loadInsight = useCallback(async () => {
  if (!session || !cycleInfo) return;
  setInsightLoading(true);
  try {
    const { data: cached } = await supabase
      .from('insights_cache')
      .select('training_text, nutrition_text, expires_at')
      .eq('user_id', session.user.id)
      .eq('insight_type', 'dashboard')
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      setInsightTexts({ training: cached.training_text, nutrition: cached.nutrition_text });
      setInsightLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke('generate-insights', {
      body: {
        insight_type:  'dashboard',
        phase:         cycleInfo.phase,
        day_of_cycle:  cycleInfo.dayOfCycle,
      },
    });
    if (!error && data?.training_text && data?.nutrition_text) {
      setInsightTexts({ training: data.training_text, nutrition: data.nutrition_text });
    }
  } catch {
    // Silently fall back to PHASE_META
  } finally {
    setInsightLoading(false);
  }
}, [session, cycleInfo]);
```

Add `useCallback` to the import at line 1 (it already imports from React — add `useCallback` to the destructure).

Add `supabase` import after the existing imports:
```typescript
import { supabase } from '@/lib/supabase';
```

- [ ] **Step 2: Call `loadInsight` on mount and app focus**

Inside the existing `useEffect` (which already calls `load()` and subscribes to AppState), add `loadInsight()` call alongside `load()`:

Replace the existing `useEffect` body:
```typescript
  useEffect(() => {
    function loadAll() {
      getDailyStats().then(({ steps, exerciseMins }) => {
        setSteps(steps);
        setExerciseMins(exerciseMins);
      });
      loadInsight();
    }

    loadAll();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadAll();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [loadInsight]);
```

- [ ] **Step 3: Update `GuidanceCard` to show Haiku text with loading state**

Replace the two `GuidanceCard` calls (currently lines 188–189):
```tsx
<GuidanceCard title="Training"  body={meta.training}  accentColor={meta.color} />
<GuidanceCard title="Nutrition" body={meta.nutrition} accentColor={meta.color} />
```

with:
```tsx
<GuidanceCard
  title="Training"
  body={insightTexts?.training ?? meta.training}
  accentColor={meta.color}
  loading={insightLoading && !insightTexts}
/>
<GuidanceCard
  title="Nutrition"
  body={insightTexts?.nutrition ?? meta.nutrition}
  accentColor={meta.color}
  loading={insightLoading && !insightTexts}
/>
```

- [ ] **Step 4: Add `loading` prop to `GuidanceCard`**

Replace the existing `GuidanceCard` definition:
```typescript
function GuidanceCard({ title, body, accentColor }: { title: string; body: string; accentColor: string }) {
  return (
    <VirraCard style={guide.card}>
      <VirraText variant="mono" size={10} color={accentColor} style={guide.label}>{title.toUpperCase()}</VirraText>
      <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>{body}</VirraText>
    </VirraCard>
  );
}
```

with:
```typescript
function GuidanceCard({ title, body, accentColor, loading }: {
  title: string; body: string; accentColor: string; loading?: boolean;
}) {
  return (
    <VirraCard style={guide.card}>
      <VirraText variant="mono" size={10} color={accentColor} style={guide.label}>{title.toUpperCase()}</VirraText>
      {loading ? (
        <View style={guide.skeleton} />
      ) : (
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)" style={guide.body}>{body}</VirraText>
      )}
    </VirraCard>
  );
}
```

Add to `guide` styles:
```typescript
  skeleton: { height: 42, borderRadius: 4, backgroundColor: colors.border },
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/(tabs)/index.tsx"
git commit -m "feat: dashboard training + nutrition cards pull from Haiku insights_cache"
```

---

## Task 5: Insights Screen — Wire Cache, Recovery, Upcoming Sections

**Files:**
- Modify: `app/(app)/insights.tsx`

Replace the old `insight_cache` / `generate-insight` calls with the new architecture, add the Recovery section (symptom trend dots), add the Upcoming section (planned sessions + user events for next 14 days), remove pull-to-refresh, add "Updated X ago" footer, and expose a `+` button for the Add Event flow.

- [ ] **Step 1: Replace imports and state**

Replace the existing import block and state section with:

```typescript
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { computeInsightMetrics, formatPaceMmSs, type InsightMetrics } from '@/lib/insightMetrics';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { AddEventModal } from '@/components/ui/AddEventModal';
```

Inside `InsightsScreen()`, replace the existing state block with:

```typescript
  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [metrics,          setMetrics]          = useState<InsightMetrics | null>(null);
  const [overallText,      setOverallText]      = useState<string | null>(null);
  const [trainingText,     setTrainingText]     = useState<string | null>(null);
  const [nutritionText,    setNutritionText]    = useState<string | null>(null);
  const [generatedAt,      setGeneratedAt]      = useState<string | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [upcomingEvents,   setUpcomingEvents]   = useState<any[]>([]);
  const [loadingMetrics,   setLoadingMetrics]   = useState(true);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [showAddEvent,     setShowAddEvent]     = useState(false);
```

- [ ] **Step 2: Replace `load` function**

Replace the existing `load` function and `useFocusEffect` with:

```typescript
  const load = useCallback(async () => {
    if (!session) return;
    setLoadingMetrics(true);

    const today     = new Date().toLocaleDateString('en-CA');
    const future14  = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA');

    const [metricsResult, cacheResult, sessionsResult, eventsResult] = await Promise.all([
      computeInsightMetrics(session.user.id).catch(() => null),

      supabase
        .from('insights_cache')
        .select('training_text, nutrition_text, overall_text, generated_at, expires_at')
        .eq('user_id', session.user.id)
        .eq('insight_type', 'weekly')
        .maybeSingle(),

      supabase
        .from('planned_sessions')
        .select('scheduled_date, modality, session_label, status')
        .eq('user_id', session.user.id)
        .gte('scheduled_date', today)
        .lte('scheduled_date', future14)
        .neq('status', 'moved')
        .order('scheduled_date'),

      supabase
        .from('user_events')
        .select('id, name, event_date')
        .eq('user_id', session.user.id)
        .gte('event_date', today)
        .lte('event_date', future14)
        .order('event_date'),
    ]);

    if (metricsResult) setMetrics(metricsResult);
    setUpcomingSessions(sessionsResult.data ?? []);
    setUpcomingEvents(eventsResult.data ?? []);
    setLoadingMetrics(false);

    const cached = cacheResult.data;
    if (cached && new Date(cached.expires_at) > new Date()) {
      setOverallText(cached.overall_text ?? null);
      setTrainingText(cached.training_text ?? null);
      setNutritionText(cached.nutrition_text ?? null);
      setGeneratedAt(cached.generated_at);
      return;
    }

    // Stale or missing — call Edge Function
    setLoadingNarrative(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: {
          insight_type:  'weekly',
          phase:         cycleInfo?.phase,
          day_of_cycle:  cycleInfo?.dayOfCycle,
        },
      });
      if (!error && data) {
        setOverallText(data.overall_text   ?? null);
        setTrainingText(data.training_text ?? null);
        setNutritionText(data.nutrition_text ?? null);
        setGeneratedAt(data.generated_at ?? new Date().toISOString());
      }
    } catch {
      // Retain stale content if present
    } finally {
      setLoadingNarrative(false);
    }
  }, [session, cycleInfo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
```

- [ ] **Step 3: Update the JSX — full screen replacement**

Replace everything from `return (` to the closing `);` with the updated screen:

```tsx
  const phaseColor = cycleInfo ? PHASE_COLOR[cycleInfo.phase] : colors.pulse;

  function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diffMs  = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        {cycleInfo && (
          <VirraText variant="mono" size={10} color={phaseColor}>
            {cycleInfo.phase.toUpperCase()} · DAY {cycleInfo.dayOfCycle}
          </VirraText>
        )}
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* THIS WEEK — Haiku narrative */}
        <VirraCard style={styles.narrativeCard}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>THIS WEEK</VirraText>
          {loadingNarrative ? (
            <View style={styles.skeleton} />
          ) : overallText ? (
            <VirraText variant="serif" size={16} color={colors.breath} style={styles.narrativeBody}>
              {overallText}
            </VirraText>
          ) : (
            <VirraText variant="body" size={13} color={colors.muted} style={{ lineHeight: 20 }}>
              {trainingText ?? 'Log activities to unlock your personal insight.'}
            </VirraText>
          )}
        </VirraCard>

        {/* Metric grid */}
        <VirraCard style={styles.metricsCard}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>YOUR NUMBERS</VirraText>
          <View style={styles.metricsGrid}>
            <MetricTile label="DAY STREAK"  value={loadingMetrics ? '—' : String(metrics?.streakDays ?? 0)} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS WEEK"   value={loadingMetrics ? '—' : `${metrics?.weeklyKm ?? 0} km`} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS MONTH"  value={loadingMetrics ? '—' : `${metrics?.monthlyKm ?? 0} km`} />
          </View>
          <View style={styles.metricDividerH} />
          <View style={styles.metricsGrid}>
            <MetricTile
              label="ADHERENCE"
              value={loadingMetrics ? '—' : metrics?.trainingAdherencePct != null ? `${metrics.trainingAdherencePct}%` : '—'}
              sub="LAST 28 DAYS"
            />
            <View style={styles.metricDividerV} />
            <MetricTile label="ALL TIME"    value={loadingMetrics ? '—' : `${metrics?.totalKm ?? 0} km`} />
            <View style={styles.metricDividerV} />
            <MetricTile
              label="NUTRITION"
              value={loadingMetrics ? '—' : metrics?.nutritionCompliancePct != null ? `${metrics.nutritionCompliancePct}%` : '—'}
              sub="COMPLIANCE"
            />
          </View>
        </VirraCard>

        {/* Training narrative */}
        {trainingText && (
          <VirraCard style={{ gap: spacing.xs }}>
            <VirraText variant="mono" size={9} color={phaseColor} style={styles.sectionLabel}>TRAINING</VirraText>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {trainingText}
            </VirraText>
          </VirraCard>
        )}

        {/* Nutrition narrative */}
        {nutritionText && (
          <VirraCard style={{ gap: spacing.xs }}>
            <VirraText variant="mono" size={9} color={phaseColor} style={styles.sectionLabel}>NUTRITION</VirraText>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {nutritionText}
            </VirraText>
          </VirraCard>
        )}

        {/* Phase-pace breakdown */}
        {metrics && metrics.phasePaces.length > 0 && (
          <VirraCard style={styles.paceCard}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              PACE BY PHASE
            </VirraText>
            {[...metrics.phasePaces]
              .sort((a, b) => a.avgPaceSecPerKm - b.avgPaceSecPerKm)
              .map((pp) => (
                <View key={pp.phase} style={styles.paceRow}>
                  <View style={[styles.phaseDot, { backgroundColor: PHASE_COLOR[pp.phase] ?? colors.muted }]} />
                  <VirraText variant="body" size={13} color={colors.breath} style={styles.pacePhaseLabel}>
                    {pp.phase.charAt(0).toUpperCase() + pp.phase.slice(1)}
                  </VirraText>
                  <VirraText variant="display" size={16} color={PHASE_COLOR[pp.phase] ?? colors.breath}>
                    {formatPaceMmSs(pp.avgPaceSecPerKm)}
                  </VirraText>
                  <VirraText variant="mono" size={8} color={colors.muted} style={styles.paceCount}>
                    {pp.activityCount} runs
                  </VirraText>
                </View>
              ))}
          </VirraCard>
        )}

        {/* Recovery — symptom trend */}
        {metrics?.symptomTrend && (
          <VirraCard style={{ gap: spacing.sm }}>
            <VirraText variant="mono" size={9} color={colors.breath} style={styles.sectionLabel}>RECOVERY</VirraText>
            {(['energy','mood','sleep'] as const).map((key) => {
              const label  = key === 'sleep' ? 'SLEEP' : key.toUpperCase();
              const value  = metrics.symptomTrend![key];
              const pct    = Math.min(value / 10, 1);
              const barColor = value >= 7 ? colors.pulse : value >= 4 ? colors.dawn : colors.heat;
              return (
                <View key={key} style={styles.symptomRow}>
                  <VirraText variant="mono" size={9} color={colors.muted} style={styles.symptomLabel}>{label}</VirraText>
                  <View style={styles.symptomBar}>
                    <View style={[styles.symptomFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
                  </View>
                  <VirraText variant="mono" size={10} color={barColor}>{value}</VirraText>
                </View>
              );
            })}
            <VirraText variant="mono" size={8} color={colors.muted} style={{ marginTop: 2 }}>7-DAY AVERAGE · 1–10 SCALE</VirraText>
          </VirraCard>
        )}

        {/* Upcoming — sessions + events */}
        <VirraCard style={{ gap: spacing.sm }}>
          <View style={styles.upcomingHeader}>
            <VirraText variant="mono" size={9} color={colors.muted} style={styles.sectionLabel}>UPCOMING 14 DAYS</VirraText>
            <Pressable
              onPress={() => setShowAddEvent(true)}
              style={styles.addEventBtn}
              accessibilityRole="button"
              accessibilityLabel="Add event"
            >
              <SymbolView name="plus" size={14} tintColor={colors.pulse} />
            </Pressable>
          </View>
          {upcomingSessions.length === 0 && upcomingEvents.length === 0 ? (
            <VirraText variant="mono" size={9} color={colors.muted}>No sessions or events planned.</VirraText>
          ) : (
            [...upcomingSessions.map((s: any) => ({ ...s, _type: 'session' as const })),
             ...upcomingEvents.map((e: any) => ({ ...e, _type: 'event' as const, scheduled_date: e.event_date }))]
              .sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1))
              .map((item, i) => (
                <View key={i} style={styles.upcomingRow}>
                  <SymbolView
                    name={item._type === 'event' ? 'calendar.badge.clock' : 'figure.run'}
                    size={12}
                    tintColor={item._type === 'event' ? colors.dawn : colors.pulse}
                  />
                  <VirraText variant="mono" size={9} color={colors.muted} style={{ minWidth: 52 }}>
                    {item.scheduled_date.slice(5)}
                  </VirraText>
                  <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1 }}>
                    {item._type === 'event'
                      ? item.name
                      : `${item.session_label.charAt(0).toUpperCase() + item.session_label.slice(1)} ${item.modality}`
                    }
                  </VirraText>
                </View>
              ))
          )}
        </VirraCard>

        {/* Footer */}
        {generatedAt && (
          <VirraText variant="mono" size={8} color="rgba(244,237,224,0.2)" style={styles.footer}>
            UPDATED {relativeTime(generatedAt).toUpperCase()}
          </VirraText>
        )}

      </ScrollView>

      {session && (
        <AddEventModal
          visible={showAddEvent}
          userId={session.user.id}
          onClose={() => setShowAddEvent(false)}
          onSaved={() => { setShowAddEvent(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
```

- [ ] **Step 4: Update styles**

Replace the existing `const styles = StyleSheet.create(...)` with:

```typescript
const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  backBtn:         { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:          { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  sectionLabel:    { letterSpacing: 1.5, marginBottom: spacing.xs },
  narrativeCard:   { gap: spacing.sm },
  narrativeBody:   { lineHeight: 26, fontStyle: 'italic' },
  skeleton:        { height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  metricsCard:     { gap: spacing.md },
  metricsGrid:     { flexDirection: 'row', alignItems: 'center' },
  metricDividerV:  { width: 1, height: 44, backgroundColor: colors.border },
  metricDividerH:  { height: 1, backgroundColor: colors.border },
  paceCard:        { gap: spacing.sm },
  paceRow:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  phaseDot:        { width: 8, height: 8, borderRadius: 4 },
  pacePhaseLabel:  { flex: 1 },
  paceCount:       { minWidth: 44, textAlign: 'right' },
  symptomRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  symptomLabel:    { width: 44, letterSpacing: 1 },
  symptomBar:      { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  symptomFill:     { height: '100%', borderRadius: 2 },
  upcomingHeader:  { flexDirection: 'row', alignItems: 'center' },
  addEventBtn:     { marginLeft: 'auto', padding: spacing.xs },
  upcomingRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  footer:          { textAlign: 'center', letterSpacing: 2 },
});
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: may show error on `AddEventModal` import until Task 6 creates the file. That's fine — resolve after Task 6.

- [ ] **Step 6: Commit (after Task 6 resolves the import)**

Hold commit until Task 6 is done.

---

## Task 6: `AddEventModal` Component

**Files:**
- Create: `src/components/ui/AddEventModal.tsx`

A simple modal — event name + date — that writes to `user_events`. Cache trigger fires automatically via the Postgres trigger created in Task 1.

- [ ] **Step 1: Write `AddEventModal.tsx`**

Create `src/components/ui/AddEventModal.tsx`:

```typescript
import React, { useState } from 'react';
import { View, TextInput, Alert, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';

interface Props {
  visible: boolean;
  userId:  string;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function AddEventModal({ visible, userId, onClose, onSaved }: Props) {
  const [name,    setName]    = useState('');
  const [date,    setDate]    = useState(todayISO);
  const [saving,  setSaving]  = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Event name is required'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Date must be YYYY-MM-DD format'); return; }
    setSaving(true);
    const { error } = await supabase.from('user_events').insert({
      user_id:    userId,
      name:       trimmed,
      event_date: date,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save event', error.message); return; }
    setName('');
    setDate(todayISO);
    onSaved();
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title="Add Event">
      <View style={modal.field}>
        <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>EVENT NAME</VirraText>
        <TextInput
          style={modal.input}
          value={name}
          onChangeText={setName}
          placeholder="Race, holiday, event…"
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="next"
        />
      </View>
      <View style={modal.field}>
        <VirraText variant="mono" size={9} color={colors.muted} style={modal.label}>DATE (YYYY-MM-DD)</VirraText>
        <TextInput
          style={modal.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-06-15"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
      </View>
      <VirraButton label={saving ? 'Saving…' : 'Save Event'} onPress={handleSave} disabled={saving} />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { letterSpacing: 1.5 },
  input: {
    backgroundColor: colors.mist,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.breath,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
```

- [ ] **Step 2: Full TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: all tests pass (no new test surface; this task is purely UI).

- [ ] **Step 4: Commit Tasks 5 + 6 together**

```bash
git add "app/(app)/insights.tsx" src/components/ui/AddEventModal.tsx
git commit -m "feat: Insights screen — Haiku narrative, Recovery section, Upcoming with user events, event-driven cache"
```

---

## Verification (end-to-end)

1. **DB check:** `select * from insights_cache;` — empty initially.
2. **Dashboard — first load:** Open dashboard with cycle data set. Training + Nutrition cards should show skeleton briefly, then Haiku text. `insights_cache` should have one row with `insight_type='dashboard'`.
3. **Dashboard — cache hit:** Background the app, reopen. Cards should load instantly from cache, no Haiku call.
4. **Trigger test:** Log a manual activity. `insights_cache.expires_at` for this user should be `now()` (past). Reopen dashboard → skeleton → new Haiku text.
5. **Insights screen:** Tap VIEW INSIGHTS →. Should show THIS WEEK narrative (overall_text), metric grid, training + nutrition narrative, Recovery bars (if symptom logs exist), Upcoming section.
6. **Add Event:** Tap `+` in Upcoming section. Fill in name + date. Save. Event appears in list. `insights_cache.expires_at` set to now (trigger fired).
7. **Offline fallback:** Airplane mode, clear cache row, open dashboard. Should fall back to PHASE_META text silently.

---

## Self-Review

**Spec coverage:**
- ✅ `insights_cache` table with exact spec schema (Task 1)
- ✅ `user_events` table (Task 1)
- ✅ 5 Postgres cache-expiry triggers on: `activities`, `planned_sessions`, `symptom_logs`, `user_events`, `training_blocks` (Task 1)
- ✅ No manual refresh button — event-driven only (Tasks 4 + 5)
- ✅ Lazy regeneration: trigger expires, app regenerates on next screen focus (Tasks 4 + 5)
- ✅ `generate-insights` Edge Function: server-side data aggregation + Haiku prompt caching (Task 2)
- ✅ `insight_type='dashboard'` → only `training_text` + `nutrition_text` (Task 2)
- ✅ `insight_type='weekly'` → `overall_text` + `training_text` + `nutrition_text` (Task 2)
- ✅ Insufficient-signal short-circuit: skips Haiku if no activities + no planned sessions (Task 2)
- ✅ Dashboard falls back to static `PHASE_META` on offline or cache miss (Task 4)
- ✅ On-device metrics: training adherence %, nutrition compliance %, symptom trend (Task 3)
- ✅ Insights screen: THIS WEEK narrative, metric grid with adherence + compliance, training/nutrition narrative, phase-pace, Recovery section, Upcoming section, footer timestamp (Task 5)
- ✅ Add Event flow: + button → `AddEventModal` → `user_events` insert → trigger invalidates cache (Tasks 5 + 6)
- ✅ `input_tokens` + `output_tokens` stored in `insights_cache` for cost tracking (Task 2)

**Placeholder scan:** None. All code blocks are complete.

**Type consistency:**
- `SymptomTrend` defined in `insightMetrics.ts`, referenced in `insights.tsx` ✅
- `InsightMetrics.trainingAdherencePct`, `nutritionCompliancePct`, `symptomTrend` match between Task 3 definition and Task 5 usage ✅
- `AddEventModal` props (`visible`, `userId`, `onClose`, `onSaved`) match Task 5 call site ✅
- `insights_cache` column names in Edge Function match migration exactly ✅
- `supabase.functions.invoke('generate-insights', ...)` matches deployed function name ✅
- `insight_type in ('dashboard', 'weekly')` CHECK constraint matches all call sites ✅
