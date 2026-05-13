# Phase E Sub-Project 3b — Multi-Event Progressive Planning Design

> **Status:** Design spec, pending review.
> **For implementation:** Next step is writing-plans → implementation plan at `docs/superpowers/plans/`.

## One-line

A connecting `seasons` layer above `training_blocks` that chains multiple events into a single adaptive timeline, with phase-based periodisation modulated by the user's menstrual cycle — turning Virra from a single-race coach into a season-long companion that never has an "exit point."

## Strategic context

Discrete `training_blocks` are the *contract* product: clear start, clear end, deliverable for one race. They're correct for starter users and for users between events. But discrete plans churn naturally — a 10K plan that *ends* is a churn trigger.

Multi-event progressive planning is the *relationship* product: an active user never sees a "plan ended" screen, because the next race is always already on the horizon. This is Virra's retention layer.

The cycle dovetail is what makes it uniquely Virra: no competitor reads the runner's hormonal timeline alongside the event timeline. The same 5-week bridge between two marathons looks one way for a runner whose follicular peak falls mid-bridge and another way for a runner whose menstrual phase lands on race day.

## Guiding principles

1. **Blocks stay** — single-event users never see a season. Existing `training_blocks` UX is unchanged for them.
2. **System-driven** — user enters event dates only. The engine decides priority, phase boundaries, recovery durations, day placement. Every default is overridable, none are required.
3. **Cycle is foreground, not footnote** — the "why" of every modulated session is surfaced in-app, not buried in settings. Users see the engine thinking.
4. **Graceful degradation** — engine reads `cycle_profile` and works the same way for natural / irregular / hormonal / peri / menopausal users, with different inputs producing different (or absent) modulation.

## Architecture

A `seasons` aggregate owns an ordered list of `user_events`. When a season is created or modified, `seasonEngine.buildChain()` produces a sequence of `training_blocks` (one per event) with named phases bridged by recovery + base + build + taper phases. The existing volume intelligence, plan stacking, and break handling all become *phase-aware* — every `planned_session` carries the phase it belongs to, and the engine modulates pace/intensity targets based on both the training phase and the user's cycle phase at session-execution time.

```
seasons
  └── user_events (ordered, prioritised A/B/C)
        └── training_blocks (one per event)
              └── phases (recovery, base, build, peak, taper, race)
                    └── planned_sessions (carries phase + cycle-modulated targets at read time)
```

## Phase taxonomy

Six canonical phases stored on `planned_sessions.phase`:

| Phase | Purpose | Volume curve | Intensity |
|---|---|---|---|
| `recovery` | Post-event rebuild | Low, rising | Easy only, walks allowed |
| `base` | General aerobic + structural | Rising | Easy + steady |
| `build` | Race-specific work | Peak-approaching | Threshold, intervals, race-pace |
| `peak` | Race simulation | High | Race-pace blocks, long race-effort |
| `taper` | Sharpen + freshen | Falling | Reduced volume, full speed quality |
| `race` | Event day | — | Event |

Bridge between events compresses these proportionally: a 5-week bridge between two marathons collapses to `recovery → base → build → taper`; a 19-week gap supports a full `recovery → base → build → peak → taper`.

## Cycle dovetail mechanism

Two engine behaviours combine:

### 1. Day-anchoring (scheduling)

When the engine places a *key session* (long run, threshold, intervals) within its target week, it ranks candidate days by cycle suitability and picks the best:

| Session type | Preferred cycle phase | Avoid |
|---|---|---|
| Long run | Follicular > ovulatory > luteal > menstrual | Heavy menstrual (D1–2) |
| Threshold / tempo | Follicular > ovulatory > luteal > menstrual | Late luteal, menstrual |
| Intervals | Ovulatory > follicular > luteal > menstrual | Menstrual |
| Easy aerobic | Any (no anchoring) | — |

Ties break on user habit (existing planned-session weekday patterns) and respect for non-conflicting existing sessions.

### 2. Intensity nudge (target modulation)

`getSessionPaceTarget` (already implemented per shipped Phase E sub-project 1) gets a `cycle_phase` axis. Modifier matrix:

| Session type | Menstrual | Follicular | Ovulatory | Luteal |
|---|---|---|---|---|
| Easy aerobic | -3% pace, no quality | baseline | baseline | -2% pace |
| Tempo / threshold | -8% intensity (or skip) | baseline | +3% (peak power) | -5 to -8% intensity |
| Intervals | skip or sub-easy | baseline | +3% (peak power) | -5 to -8% intensity |
| Long run | -5% pace, walks ok | baseline (anchor target) | baseline | -3% pace, fuel ↑ |
| Race day | — | optimal | optimal | "fuel caution" insight |

Targets are computed at read time (in `getDaySessionDetail`), not baked into `planned_sessions`. The stored plan is cycle-blind; the rendered plan is cycle-aware. This means the same `planned_sessions` row reads differently for a user with regular vs. irregular cycle data, and adjusts automatically if cycle data is updated.

### Adherence semantics

Adherence/match metrics (existing `insightMetrics.ts`) credit users against the *cycle-adjusted* target, not the stored target. A 4:48/km luteal tempo registers as "hit target" if the plan target was 4:35/km — because 4:48 in luteal is the same physiological work as 4:35 in follicular.

## Cycle profile handling

| Profile | Day-anchoring | Intensity nudge | Notes |
|---|---|---|---|
| `natural` | Full | Full matrix | Default behaviour |
| `irregular` | Best-guess from last-known + cycle_length avg | Conservative bands (±3% not ±8%) | Modal reason includes "estimated" |
| `hormonal` (contraception) | Off (no natural cycle) | Off | Engine respects symptom logs for ad-hoc adjustments only |
| `perimenopause` | Off | Off | Life-stage cues (sleep load, joint warmup) — Phase 2 |
| `menopause` | Off | Off | Engine falls back to standard `volumePlan` primitives |

## UI surfaces — exposing the "why"

The retention value depends on users *seeing* the cycle-aware coaching. Three primary surfaces:

### 1. SessionDetailModal (primary)

When the user opens a planned session that has been cycle-modulated, the modal renders:

```
TEMPO · 30 min                               [DONE | TO DO]
─────────────────────────────────────────────
Target:  4:48/km  (adjusted from 4:35)
Phase:   Build · Week 14 of 16

┌─────────────────────────────────────────┐
│ WHY THIS PACE                            │
│ Luteal phase — body temperature is up,  │
│ lactate threshold shifts. Hitting 4:48  │
│ today is the same physiological work    │
│ as 4:35 in your follicular. Pushing     │
│ harder is overreaching, not training.   │
└─────────────────────────────────────────┘
```

The "Why this pace" card only renders when `modulation_reason` is non-null. For cycle-blind sessions (easy aerobic in any phase, or all sessions for `hormonal`/`menopause` profiles), the modal looks identical to today.

### 2. MY SEASON timeline (Training tab)

A new section above the existing MonthCalendar surfaces the chain at-a-glance:

```
MY SEASON · 21 WEEKS · Brighton → Leeds
─────────────────────────────────────────────
Dec ─── Brighton ─── Bridge ─── Leeds
Base│Build│Peak│Tap│Rec│Bld│T│R
       ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░
            ↑ Week 11 · Build · Follicular

Next race: Brighton  ·  5 weeks · Apr 12
Then:      Leeds     ·  5 weeks after Brighton · May 17
```

Shows the full chain, current position, current training phase, current cycle phase, and next two race milestones. Single-event users never see this section — it only renders when `season_id` exists on the active blocks.

### 3. TodaysSessionHero badge (subtle)

The hero we shipped on 2026-05-13 (`TodaysSessionHero.tsx`) gets a small cycle-adjustment indicator on sessions that are modulated today:

```
TODAY · 1 SESSION
─────────────────────────────────────────────
🏃 Tempo                  ↓ 4:48/km   [TO DO]
   RUN · Adjusted from 4:35 — luteal
```

The full "why" lives in SessionDetailModal; the hero just signals that something has been adjusted.

## Data model

### New table

```sql
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,                  -- auto-generated, user-editable
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'active'
                check (status in ('active','completed','abandoned')),
  created_at  timestamptz default now()
);

create index seasons_user_active_idx on public.seasons (user_id, status);
alter table public.seasons enable row level security;
create policy "Users manage own seasons"
  on public.seasons for all using (auth.uid() = user_id);
```

### Existing table modifications

```sql
-- user_events: link to season + priority designation
alter table public.user_events
  add column season_id         uuid references public.seasons(id) on delete set null,
  add column sequence_position integer,
  add column priority          text check (priority in ('A','B','C'));

-- training_blocks: link to season
alter table public.training_blocks
  add column season_id uuid references public.seasons(id) on delete set null;

-- planned_sessions: carry phase
alter table public.planned_sessions
  add column phase text check (phase in ('recovery','base','build','peak','taper','race'));
```

Existing data: all current `user_events`, `training_blocks`, and `planned_sessions` have `season_id=NULL` / `phase=NULL`. The engine treats null as legacy single-event mode (current behaviour preserved exactly).

## Engine API (`src/lib/seasonEngine.ts`)

```typescript
export type BlockPhase = 'recovery' | 'base' | 'build' | 'peak' | 'taper' | 'race';
export type Priority = 'A' | 'B' | 'C';

export interface SeasonChainInput {
  user_id:        string;
  events:         UserEvent[];       // ordered by event_date asc
  cycle_profile:  CycleProfile;
  current_fitness: FitnessSnapshot;  // pace baseline, weekly volume
}

export interface PhaseSegment {
  phase:     BlockPhase;
  starts_on: string;   // ISO date
  ends_on:   string;
  weeks:     number;
}

export interface ChainBlock {
  event_id:        string;
  modality:        string;
  starts_on:       string;
  ends_on:         string;        // race date
  phase_segments:  PhaseSegment[];
  priority:        Priority;
}

/** Pure function — given events + context, return the block chain. */
export function buildSeasonChain(input: SeasonChainInput): ChainBlock[];

/** Persists chain: creates season, blocks, and regenerates planned_sessions. */
export async function applySeasonChain(
  userId:  string,
  chain:   ChainBlock[],
): Promise<{ season_id: string }>;

/** Run when an event is added/edited/removed. Reflows downstream. */
export async function recomputeSeasonForUser(userId: string): Promise<void>;
```

### Cycle modulation API (extends existing `volumePlan.ts`)

```typescript
export interface ModulationResult {
  adjusted_target:    SessionPaceTarget;
  reason:             string | null;   // null when no modulation applied
  source_cycle_phase: CyclePhase | null;
}

export function modulateForCycle(
  base_target:    SessionPaceTarget,
  session_type:   SessionType,
  cycle_phase:    CyclePhase | null,
  cycle_profile:  CycleProfile,
): ModulationResult;
```

`getDaySessionDetail` (already shipped) gets a new field `cycle_modulation: ModulationResult | null` so the modal can render the why-card conditionally.

## Worked scenarios

### Scenario A: Brighton + Leeds (back-to-back marathon)

Events: Brighton Apr 12, Leeds May 17 (35-day gap).

Engine reasoning:
- Two events same distance → both A priority by default
- Gap < standard marathon prep → back-to-back mode
- Block 1: 16-week standard marathon block to Brighton
- Bridge (5 weeks): `recovery (1w) → base (1w) → build (2w, peak long run anchored to follicular) → taper (1w) → race`

Cycle dovetail: assuming 28-day cycle with period Dec 15, the bridge weeks intersect with:
- Apr 13–19 Recovery — late luteal (natural alignment, body wants rest)
- Apr 20–26 Base — menstrual (engine delays re-engagement intensity to Day 5)
- Apr 27 – May 3 Build (long run week) — **follicular (engine anchors 32km race-pace long run to this week)**
- May 4 – 10 Build (tempo week) — **ovulatory (engine anchors final threshold to this week)**
- May 11 – 16 Taper — early luteal (lower intensity matches lower readiness)
- May 17 Race — mid-luteal → engine surfaces *fuel caution* insight at race week

### Scenario B: 10K → Half → Marathon (progressive ladder)

Events: 10K Apr 12, Half Jun 7, Marathon Oct 18.

Engine reasoning:
- 3 events of increasing distance → progressive ladder pattern
- Auto-priority: A for marathon (terminal/longest), B for stepping stones
- 10K block: 10wk standard build
- 10K → Half bridge (8wk): `recovery (1w) → half-specific build (6w) → taper (1w)` — uses 10K fitness as base
- Half → Marathon bridge (19wk): `recovery (2w) → base (5w) → build (8w) → peak (2w) → taper (2w)`

Total programme: ~36 weeks continuous. No exit point. Cycle dovetail anchors all key sessions to follicular/ovulatory weeks; modulates lutealtempo targets across the entire arc.

### Scenario C: Marathon + 5K tune-up conflict

Events: Marathon Oct 18, parkrun-PB attempt Oct 11.

Engine reasoning:
- 5K race-pace work conflicts fundamentally with marathon taper
- Engine auto-assigns 5K as priority C ("training run within taper")
- Surfaces warning: *"Your 5K falls in marathon taper week. We've kept it on the calendar as a sharpening effort, not a goal race. Tap to override."*
- User can override to A; engine then warns again about taper compromise

## MVP scope

| Milestone | Deliverable |
|---|---|
| **M1** | Migration 013: `seasons` table, FK columns on `user_events` / `training_blocks` / `planned_sessions`. RLS, indexes, partial unique constraint preserved. |
| **M2** | `seasonEngine.buildChain()` pure function + `applySeasonChain()` persistence. Auto-creates season when user has 2+ future events. |
| **M3** | Engine assigns `planned_sessions.phase` per generated session. `getDaySessionDetail` returns `phase` in result. |
| **M4** | Cycle dovetail: `modulateForCycle()` matrix; day-anchoring in `applySeasonChain`; `getDaySessionDetail` returns `cycle_modulation`; SessionDetailModal renders the why-card; TodaysSessionHero shows ↓/↑ badge for modulated sessions today. |
| **M5** | MY SEASON timeline component on Training tab — chain visualisation, current phase pill, weeks-to-next-event countdown. Only renders when a season exists. |

### Deferred to post-launch

- Conflict warnings UI (Scenario C warning surfaces) — engine emits warnings as data; no UI yet
- Editable season (priority override, manual phase shifts, recovery duration tuning)
- Perimenopause/menopause-specific coaching cues
- Cycle-data-quality warnings ("your last period was logged 60 days ago — accuracy degraded")
- Seasonal review/recap UX after a season completes
- Cross-season planning (e.g. "after Marathon, what's next?" prompt)

## Open questions

1. **Auto-creation trigger** — does the season auto-create on event #2, or prompt? Recommend auto-create with a one-time onboarding nudge ("Virra has linked your two events into a season — tap to view.") so the user understands what happened.
2. **Priority defaults** — for a ladder (10K → Half → Mara), the longest is A. For two events of the same distance, both A. For a 5K within marathon taper, conflict → C. These rules should live in `seasonEngine.assignPriorities()` and be revisitable.
3. **What if user adds an event in the past?** Engine ignores past events for chain generation but lets them exist as records (e.g. for season recap stats).

## Self-review

**Spec coverage:** Strategy ✓, architecture ✓, phase taxonomy ✓, cycle dovetail (both mechanisms) ✓, cycle profile handling ✓, UI surfaces (3 named) ✓, data model ✓, engine API ✓, three worked scenarios ✓, MVP milestones ✓, deferred items ✓, open questions surfaced.

**Placeholder scan:** No TBDs, no "implement later" notes, no vague "appropriate handling" phrases. All requirements concrete.

**Internal consistency:** Phase taxonomy used identically across all sections. Modifier matrix referenced consistently. UI surfaces map 1:1 to engine outputs. Schema FKs match referenced columns.

**Scope check:** Single coherent implementation plan (~5 milestones). Doesn't bundle Phase 2 work (perimenopause cues, cross-season). Right size for one plan document.

**Ambiguity check:** "Key session" is defined (long run / threshold / intervals — the anchor-eligible session types). "Cycle suitability" is defined by the rank tables. Priority defaults are stated. The "fuel caution" insight is noted but its content is left to the implementation plan (acceptable — it's a copy decision, not an architecture one).
