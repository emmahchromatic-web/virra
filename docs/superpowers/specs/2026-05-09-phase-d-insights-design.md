# Phase D Insights — Design Spec

## Context

The dashboard currently shows static `PHASE_META` one-liners per cycle phase (hardcoded training + nutrition guidance). The `VIEW INSIGHTS →` link is a dead end. Phase D completes the intelligence layer: the dashboard cards become Haiku-generated narratives, and the Insights screen gives users a full weekly view of their training, nutrition, and recovery signals.

---

## Scope

Three interconnected deliverables:

1. **On-device insight metrics** — computed locally from Supabase data, no AI required
2. **Haiku narrative insights** — Edge Function aggregates signals, calls Haiku, caches result
3. **Insights screen** — consumes both on-device metrics and Haiku narrative; dashboard cards link here

---

## Architecture

### Data flow

```
User data (activities, symptom_logs, nutrition_logs, planned_sessions, user_events)
    ↓ Postgres triggers (on INSERT/UPDATE of key tables)
    ↓ Mark insights_cache as stale (expires_at = now())
    ↓
App screen focus
    → Read insights_cache: stale or missing?
        YES → Call Edge Function `generate-insights`
                → Aggregate user data
                → Call Claude Haiku (with prompt caching)
                → Write result to insights_cache
                → Return to app
        NO  → Render cached content immediately
```

### Cache invalidation triggers

Postgres triggers set `expires_at = now()` on `insights_cache` for the user when:

| Table | Event | Reason |
|---|---|---|
| `activities` | INSERT | Adherence % changed |
| `planned_sessions` | UPDATE (status change) | Plan changed (drop / move / catch-up) |
| `symptom_logs` | INSERT | Recovery signal changed |
| `user_events` | INSERT / UPDATE / DELETE | Lookahead context changed |
| `training_blocks` | INSERT | New plan started — full context shift |

No manual refresh button. Insights are coherent with current plan and body state automatically.

### Regeneration strategy: lazy

Triggers only expire the cache. Haiku is called when the user opens the dashboard or Insights screen and the cache is stale. Inactive users (no logging) generate zero Haiku calls.

---

## New DB Objects

### `insights_cache` table

```sql
create table public.insights_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  insight_type    text not null check (insight_type in ('dashboard', 'weekly')),
  phase           text not null,
  training_text   text not null,
  nutrition_text  text not null,
  overall_text    text,           -- weekly insight only
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  input_tokens    integer,        -- track actuals from day one
  output_tokens   integer,
  unique (user_id, insight_type)
);

alter table public.insights_cache enable row level security;
create policy "Users read own insights"
  on public.insights_cache for select using (auth.uid() = user_id);
```

### `user_events` table

```sql
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
```

(Note: `training_blocks.event_id` already FK-references this table in the schema; this creates it.)

### Supabase Edge Function: `generate-insights`

Input: `{ user_id, insight_type: 'dashboard' | 'weekly' }`

Aggregates:
- Cycle phase + day in cycle (computed on-device, passed in)
- Last 14 days activities
- Next 14 days planned sessions
- Nutrition 7-day averages vs targets
- Symptom logs last 7 entries
- User events next 14 days

Calls Haiku with prompt caching on the system prompt prefix. Writes result to `insights_cache`.

---

## Haiku Prompt Design

### Dashboard prompt (returns `training_text` + `nutrition_text`)

System (cached):
> You are Virra's training intelligence. You write short, direct, motivating insight for women runners. Two sentences maximum per section. Never use diet culture language. Speak to the runner directly. Current phase context will follow.

User turn: structured JSON of aggregated data → phase, recent sessions, adherence %, symptom signals, upcoming sessions, any events in the next 14 days.

Output: JSON `{ training: "...", nutrition: "..." }` — ~80 tokens total.

### Weekly prompt (returns `overall_text` + `training_text` + `nutrition_text`)

Same system prompt. Richer data window (14-day history + 14-day lookahead). Allows a longer overall narrative (~100 words) plus section summaries.

Output: JSON `{ overall: "...", training: "...", nutrition: "..." }` — ~350 tokens total.

---

## On-Device Metrics (no AI)

Computed locally from Supabase queries, shown in the Insights screen structured sections. No cache needed — queried on screen mount.

| Metric | Source |
|---|---|
| Training adherence % | `planned_sessions` — completed / (completed + dropped) last 28 days |
| Sessions completed / planned | Same |
| Average weekly volume (km) | `activities` + `run_details` last 4 weeks |
| Nutrition compliance % | `nutrition_logs` — days where calories within 10% of target |
| Symptom trend | `symptom_logs` — energy/mood/sleep 7-day moving average |
| Phase-pace correlation | `activities` + `run_details` grouped by `phase_at_time` |

---

## Dashboard Changes

Replace static `PHASE_META.training` and `PHASE_META.nutrition` strings in `app/(app)/(tabs)/index.tsx`:

- On mount: read `insights_cache` for `insight_type = 'dashboard'`
- If stale/missing: call `generate-insights` Edge Function, show skeleton while loading, update in-place
- If offline or first load with no cache: fall back to current static `PHASE_META` text
- `VIEW INSIGHTS →` links to the new Insights screen

---

## Insights Screen

**Route:** `app/(app)/insights.tsx` (modal or full-screen tab — modal from dashboard link)

**Sections:**

1. **Header** — phase name + day in cycle (existing cycle indicator style)
2. **THIS WEEK** — Haiku `overall_text`, ~100 words, narrative paragraph
3. **Training** — adherence % ring or bar + recent session list (last 7 days) + upcoming 7-day strip
4. **Nutrition** — 7-day avg macros vs targets, phase target reminder
5. **Recovery** — symptom trend: energy / mood / sleep 7-day sparkline or dot indicators
6. **Upcoming** — next 14 days: planned sessions + user events in a simple list
7. **Footer** — "Updated [relative time]" — no refresh button

**Add event flow:** `+` button in the Upcoming section opens a simple modal: event name + date. Writes to `user_events`, trigger invalidates cache.

---

## Fallback Behaviour

| Scenario | Behaviour |
|---|---|
| No Supabase data yet (new user) | Static `PHASE_META` text on dashboard; Insights screen shows empty states per section |
| Haiku API error | Retain last cached content; log error silently |
| Offline | Serve cached content; no regeneration attempt |
| Cache expired but no activity data | Skip Haiku call; show static text (not enough signal to generate meaningful insight) |

---

## Cost Model

At 1,000 users/month (200 highly active, 400 moderate, 400 inactive):

| Model | Est. monthly cost |
|---|---|
| Claude 3 Haiku | ~$5 |
| Claude Haiku 4.5 | ~$16 |
| Haiku 4.5 + prompt caching | ~$11 |

Track `input_tokens` + `output_tokens` in `insights_cache` to validate against actuals from launch.

---

## Spec Self-Review

**Placeholder scan:** None. All sections are fully specified.

**Internal consistency:**
- Trigger list matches the tables described in the architecture section ✓
- `user_events` table created here; `training_blocks.event_id` FK already references it ✓
- Dashboard fallback uses existing `PHASE_META` — no new static content needed ✓
- `insight_type` CHECK constraint matches all call sites ✓

**Scope check:** Three deliverables (on-device metrics, Haiku Edge Function, Insights screen) are tightly coupled and should ship together. Correct to keep in one plan.

**Ambiguity resolved:**
- No on-demand refresh button — event-driven only
- Lazy regeneration (trigger expires, app regenerates on next screen focus)
- Dashboard cards fall back to static `PHASE_META` when offline or no cache
- `overall_text` is `weekly` insight type only; `dashboard` only has `training_text` + `nutrition_text`
