# Phase I — Active Workout Engine

**Status:** spec
**Date:** 2026-05-15
**Decomposition:** 4 sub-projects (Ia, Ib, Ic, Id). Run plotter explicitly out of scope.

---

## Brief

Replace the always-routes-to-GPS Play FAB with an intelligent entry point that reads today's planned workout(s) and drives the user through them. The workout itself — structure, intervals, exercise list, sets/reps targets — is owned by the *plan*, not by the live screen. The live screens are thin readers/recorders.

This shifts the architecture so that:
- Insights' 14-day lookahead can render real workout content, not just labels
- Moving a session ("long run Sunday → Saturday because parents are over") carries the full workout with it
- Substitution becomes "swap one planned workout for another", which writes back to the plan and stays visible everywhere
- Strength and run live screens both render off the same plan-owned data model — extensible to cycling/swimming later

## One-line brief

> The plan is the source of truth for what the workout is. Play is the source of truth for whether it got done.

---

## Architecture principle

**Plan-owned, surface-rendered.** Every workout — its structure (warmup, intervals, cooldown for runs; exercise list with target sets/reps for strength) — lives on the `planned_session` row. Every surface (dashboard hero, calendar modal, Insights lookahead, Play live screen, pre-workout preview) reads from the same shape. Mutations (move, swap, drop, complete) write through `planned_sessions` and are reflected everywhere on next read.

Cycle modulation continues to apply at read time (already proven in `getTodaysSessions` and `SessionDetailModal`), but now applies *per step* of a structured workout rather than only to the headline pace.

---

## Sub-projects

### Ia — Play CTA routing intelligence

Centre FAB stops always going to `/run`. New behaviour:

| Today's plan | FAB destination |
|---|---|
| 1 planned session | Route directly to that session's pre-workout preview screen |
| 2+ planned sessions | Picker sheet listing each, plus "Quick start something else" |
| Rest day (0 planned) | Picker sheet: "Quick run", "Quick strength", "Log past activity" |
| Today's session already completed | Same as rest day, but with a "Session done — extra workout?" header |

The picker sheet is also reachable from a "Change workout" affordance on the dashboard hero (see Id).

No workout content is generated here. All content comes from `planned_sessions`. The pre-workout preview is the shared landing screen that then drives into the live tracker.

**Files:**
- `mobile/src/components/layout/AppTabBar.tsx` — replace direct `/run` route with router function
- `mobile/src/lib/playRouting.ts` (new) — `getPlayDestination(userId): Promise<PlayDestination>` returning either a planned-session id + modality, or a "picker" signal
- `mobile/app/(app)/play.tsx` (new) — picker sheet route
- `mobile/app/(app)/workout/[plannedSessionId].tsx` (new) — pre-workout preview, the shared landing screen

### Ib — Structured runs on the plan

**Schema.** Add `run_structure JSONB` to `planned_sessions`. JSONB chosen over sidecar table because every read site (5+ surfaces) already loads `planned_sessions`; an extra join would touch every surface and JSONB is cheap to evolve.

```ts
// mobile/src/lib/workoutStructure.ts (new)
export type RunStepKind = 'warmup' | 'work' | 'rest' | 'cooldown' | 'repeat';

export interface RunStepTarget {
  distance_m?:        number;   // step ends at this distance
  duration_s?:        number;   // OR step ends at this duration
  pace_secs_per_km?:  number;   // target pace; null = "whatever feels easy"
  pace_band?:         'easy' | 'steady' | 'tempo' | 'threshold' | 'vo2' | 'recovery';
}

export interface RunStep {
  id:            string;       // stable uuid for splits binding
  kind:          RunStepKind;
  label?:        string;       // e.g. "warmup", "interval", "float"
  target:        RunStepTarget;
  repeat_count?: number;       // only when kind === 'repeat'
  sub_steps?:    RunStep[];    // only when kind === 'repeat'
}

export interface RunWorkoutStructure {
  version:       1;
  steps:         RunStep[];
  workout_type:  'easy' | 'long' | 'tempo' | 'threshold' | 'intervals' | 'progression' | 'race' | 'recovery' | 'run_walk' | 'negative_split';
  total_distance_m: number;   // sum across steps; used for the headline distance card
}
```

A 4 × 800m interval session at threshold pace becomes:

```json
{
  "version": 1,
  "workout_type": "intervals",
  "total_distance_m": 6800,
  "steps": [
    { "kind": "warmup",   "target": { "distance_m": 1500, "pace_band": "easy" } },
    { "kind": "repeat", "repeat_count": 4, "sub_steps": [
      { "kind": "work", "label": "800m @ threshold", "target": { "distance_m": 800, "pace_band": "threshold" } },
      { "kind": "rest", "label": "200m float",       "target": { "distance_m": 200, "pace_band": "recovery" } }
    ]},
    { "kind": "cooldown", "target": { "distance_m": 1300, "pace_band": "easy" } }
  ]
}
```

Run-walk and negative-split workouts use the same primitives.

**Generation.** Extend `scheduleGenerator` to produce `run_structure` at session creation time. A new `generateRunStructure(sessionLabel, baselinePace, weekNumber, blockDistanceTarget): RunWorkoutStructure` function lives in `mobile/src/lib/runWorkoutGenerator.ts`. Phase-aware pace targets are computed at *read* time (cycle modulation per step), not baked in.

**Backfill.** For existing planned sessions without structure, the read path calls the generator lazily and persists the result back. Idempotent.

**Pre-workout preview screen** (`app/(app)/workout/[plannedSessionId].tsx`):
- Header: workout type, total distance, estimated duration
- Steps list with targets (e.g. "Warmup · 1.5km @ easy", "4 × 800m @ 4:15/km · 200m float")
- "WHY THIS PACE" cycle card (existing pattern from `SessionDetailModal`) applied per step
- Big START button → drops into the run tracker in "structured mode"

**Live execution** (`app/(app)/run.tsx` enhanced):
- New `mode: 'free' | 'structured'` state. Structured mode receives the run structure as a route param.
- Step indicator at top: "STEP 2 OF 9 · 800M @ 4:15/KM"
- Step progress ring (distance or duration based on step target)
- Audible cue + haptic at step transitions
- Splits bind to `step_id` instead of just km; written to `run_details.splits_json` with shape `{ step_id, kind, target, actual_pace_secs, actual_distance_m, actual_duration_s }`

**Cycle modulation per step.** The existing `modulateForCycle` operates on a single pace target. New helper `modulateRunStructure(structure, phase, cycleProfile)` maps over each step with a pace target and returns a structure with adjusted paces + a single aggregated `reason` string for the WHY card.

**Files:**
- `mobile/supabase/migrations/015_run_structure.sql` — add JSONB column
- `mobile/src/lib/workoutStructure.ts` — types + helpers
- `mobile/src/lib/runWorkoutGenerator.ts` — pure generator
- `mobile/src/lib/cycleModulation.ts` — extend with `modulateRunStructure`
- `mobile/src/lib/scheduleGenerator.ts` — write structure on session creation
- `mobile/src/lib/volumePlan.ts` — surface `run_structure` on `RunSessionDetail`
- `mobile/src/lib/todaysSession.ts` — surface `run_structure` for the hero/picker
- `mobile/app/(app)/workout/[plannedSessionId].tsx` — pre-workout preview
- `mobile/app/(app)/run.tsx` — structured mode
- `mobile/src/components/ui/RunStepProgress.tsx` (new) — step indicator + progress ring

### Ic — Structured gym sessions on the plan

**Schema.** Add `strength_structure JSONB` to `planned_sessions`. Same JSONB-over-sidecar reasoning as Ib.

```ts
export interface StrengthSetTarget {
  reps:        number;        // target rep count
  weight_kg?:  number;        // explicit weight target; absent = RPE-driven
  rpe?:        number;        // target RPE 1–10
}

export interface PlannedExercise {
  id:              string;    // stable uuid
  name:            string;    // from EXERCISE_LIBRARY
  primary_muscles: string[];
  target_sets:     StrengthSetTarget[];
  rest_seconds:    number;
  notes?:          string;    // e.g. "tempo 3-1-1"
}

export interface StrengthWorkoutStructure {
  version:      1;
  session_type: 'lower' | 'upper' | 'general';
  exercises:    PlannedExercise[];
  estimated_minutes: number;
}
```

**Generation.** New `mobile/src/lib/strengthWorkoutGenerator.ts` produces structure given `session_type`, current cycle phase, and recent strength history. Picks 5–6 exercises from `EXERCISE_LIBRARY` with:
- Compound primary (deadlift / squat / bench / OHP) first when phase is follicular/ovulatory
- Single-joint accessories when phase is luteal/menstrual, RPE-driven rather than %-driven
- Avoids repeating the same primary muscle two strength sessions in a row (read last `strength_details` row to inform)

**Pre-workout preview screen** — same `app/(app)/workout/[plannedSessionId].tsx` route, branching by modality:
- Exercise list with muscle-region badges
- Target sets/reps/weight or RPE per exercise
- Estimated duration
- Big START button → strength live screen

**Live screen** (`app/(app)/workout/strength-live.tsx` new):
- One exercise per page (horizontal pager) — current exercise card with muscle-region visual
- For visualisation: SF Symbol per movement (`figure.strengthtraining.traditional`, `figure.strengthtraining.functional`, etc.) plus a static body-region badge tinted to muscle group (no SVG dependency for v1)
- Set-by-set logging: prefilled with target reps/weight; user adjusts then taps a big "Done set" button
- Rest timer auto-starts on set save; circular countdown matches `rest_seconds` from the target
- RPE prompt appears on the final set of each exercise
- "Skip exercise" affordance; "Add a set" affordance for AMRAP-style additions

**Persistence.** Logged actuals write to existing `strength_details` (`exercises_json`). No change to that schema. The link between planned exercise and logged exercise is by name match — we keep the planned `id` in a sidecar `planned_exercise_id` field on each logged exercise so future analytics can compare planned vs actual cleanly.

**Files:**
- `mobile/supabase/migrations/016_strength_structure.sql` — JSONB column
- `mobile/src/lib/strengthWorkoutGenerator.ts` — pure generator
- `mobile/src/lib/scheduleGenerator.ts` — write strength structure on session creation
- `mobile/app/(app)/workout/strength-live.tsx` — live screen
- `mobile/src/components/ui/ExerciseCard.tsx` (new) — per-exercise live card
- `mobile/src/components/ui/RestTimer.tsx` (new) — auto-start countdown
- `mobile/src/components/ui/MuscleRegionBadge.tsx` (new) — static body-region badge

### Id — Move / swap on planned workouts

**Move** (already works): `moveSession` in `scheduleGenerator.ts` already carries the full row to its new date. Verify the JSONB columns travel intact (they should — it's a date update, not a row rebuild). One test added.

**Swap modality.** New `swapPlannedSession(sessionId, newModality, newLabel?): Promise<void>`. Mechanism:
- Mark the original `planned_session` as `dropped` with a sentinel reason ("swapped")
- Insert a new `planned_session` for the same date with the new modality and a generated structure
- Carry over the `block_id` so volume accounting stays correct (the new strength session counts as the dropped run's slot, just a different modality)

**Swap variant within modality.** Same path: drop original, insert new with the new `session_label`. Generator produces fresh structure.

**Surfaces.**
- Pre-workout preview screen: "Change workout" button → opens a swap sheet listing modalities + variants
- Dashboard hero: long-press on a planned session → swap sheet
- `SessionDetailModal`: existing action row gains a "SWAP" button alongside DROP / MOVE / CATCH-UP

**Files:**
- `mobile/src/lib/scheduleGenerator.ts` — `swapPlannedSession`
- `mobile/src/components/ui/SwapWorkoutSheet.tsx` (new)
- `mobile/src/components/ui/SessionDetailModal.tsx` — add SWAP action
- `mobile/src/components/ui/TodaysSessionHero.tsx` — long-press handler
- `__tests__/lib/scheduleGenerator.test.ts` — move preserves JSONB; swap drops + inserts; volume accounting preserved

---

## Out of scope (explicit)

- **Run plotter.** Pre-run route planning (BRouter, saved routes, map UI) is its own project. Phase I leaves a clear seam: the pre-workout preview screen has an "Add route" affordance that's stubbed until the plotter ships. No data model decisions in Phase I will block it.
- **Cycling / swimming structured workouts.** The schema is built generically (steps + targets), but the generators and live screens for these modalities are post-launch. Phase I delivers run + strength only.
- **Wearable interactivity.** No Apple Watch app changes. Live screens are iPhone-only for Phase I.

---

## Knock-on changes outside the four sub-projects

- **Insights 14-day lookahead** (`app/(app)/insights.tsx`): the upcoming sessions list renders the workout title now becomes a one-line summary of structure (e.g. "4 × 800m + 1.5km warmup/cooldown"). Pure additive read.
- **MonthCalendar**: long-press on a session opens `SessionDetailModal` which already exists — gets the SWAP action added.
- **Notifications**: training reminder copy can include the workout summary. `notifications.ts` enhanced; no new permission surface.

---

## Build order

1. **Ib schema + generator + read paths** (no UI yet) — get structured runs onto every existing surface as text, prove the data model
2. **Ic schema + generator + read paths** — same for strength
3. **Pre-workout preview screen** — shared landing surface, reads from either modality
4. **Ia — Play routing** — wire FAB to use the preview screen
5. **Ib live execution** — structured-mode enhancements to `run.tsx`
6. **Ic live screen** — new `strength-live.tsx`
7. **Id — swap** — last, depends on generators being stable

Each step is releasable on its own. The user gets visible progress at step 1 (Insights lookahead becomes richer) without anything else having shipped.

---

## Open question carried into writing-plans

How aggressive should the live cue language be? "5 seconds to next interval — pick it up" vs more cycle-aware "Floating into your work step — fast and light." Default to the cycle-narrative tone consistent with the rest of the app, but worth a brief explicit decision when we get to live screen copy.
