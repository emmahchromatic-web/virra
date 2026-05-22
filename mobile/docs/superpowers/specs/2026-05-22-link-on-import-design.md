# Link-on-Import — Design Spec

**Date:** 2026-05-22
**Status:** Approved (pending spec review)
**Author:** Paul + Claude

---

## Problem

HealthKit-imported workouts never mark their planned sessions complete. The only
code paths that set a session to `completed` are:

1. `linkActivityToSession` — fires **only** from the manual-activity logging screen.
2. `reconcileMoveToActivity` — fired only on a session move (removed 2026-05-22; it
   silently auto-completed sessions during drags and was a footgun).
3. Read-time derivation in `todaysSession.ts` — **today only**, display only, never persisted.

`healthKitImport.ts` upserts activities and stops — it links nothing. So every workout
that arrives via Apple Watch / HealthKit (the primary activity source per the
HealthKit-first principle) leaves its planned session as `planned`, i.e. showing as
*missed*. A real account audit on 2026-05-22 showed **every** past planned session back
to 11 May sitting `planned`/unlinked, while runs (8, 18 May) and strength (14, 19, 20 May)
sat orphaned in `activities`.

This breaks adherence %, MonthCalendar past-day state, volume-plan completion counts, and
the core promise that the app reflects what the user actually did.

## Goal

When an activity exists for a day that has a matching planned session, mark that session
`completed` and link it — automatically, on import, and on an ongoing current-week sweep —
**gated by a quality threshold** so trivial/spurious activities don't complete real sessions.

## Non-goals / explicit constraints

- **Never drop or downgrade unmatched activities.** They persist as standalone logged
  activities. Rationale: they carry real training value (a 22km hike has material positive
  effect), and a future *substitution* layer will map activities as substitutes for planned
  sessions (cross-modality). Preserving them is load-bearing for that future work.
- **Additive only.** Reconciliation only ever turns `planned → completed`. It never
  un-completes, never deletes, never reverts. (Reversal/correction is a separate concern.)
- **No cross-modality matching in v1.** Strict same-modality. Substitution mapping
  (hike→long run, cross-train→strength) is a future extension; the matcher's signature is
  the seam for it.
- **No import-pipeline hygiene changes.** `other`-type junk (sleep/mindfulness samples
  imported as multi-hour activities) is left stored as-is; it is simply excluded from linking.

## Decisions (captured from brainstorm)

| # | Decision |
|---|---|
| 1 | Completion is **threshold-gated**, not "any match". |
| 2 | Distance-based modalities (run, swim) gate on **≥90% of target distance**; non-distance (strength, yoga) gate on **≥90% of target duration**. `other` is excluded entirely (see #5). Tight gate, no loose variant. |
| 3 | When a day has multiple unlinked same-modality sessions that clear the gate, **closest target wins** (`min |target − actual|`). |
| 4 | **Full historical pull on install** + **rolling current-week re-sweep** every import. |
| 5 | `activity_type = 'other'` is **excluded from linking** entirely (still stored). |

---

## Architecture (Approach A: dedicated reconciler module)

Two units with a clean boundary:

### Unit 1 — the matcher (pure, no DB)

```ts
// src/lib/sessionMatcher.ts
interface MatchActivity {
  activity_type:   Modality;
  duration_seconds: number;
  distance_meters:  number | null;
}
interface MatchCandidate {
  id:            string;
  modality:      Modality;
  session_label: string;
  target_value:  number | null;   // metres (distance modality) or seconds (duration modality)
  metric:        'distance' | 'duration';
}

function matchActivityToSession(
  activity:   MatchActivity,
  candidates: MatchCandidate[],   // already same-day, same-modality, unlinked, status='planned'
  opts?: { gateFraction?: number } // default 0.90 (param exists for test injection)
): string | null;
```

Logic:
1. Drop candidates with `target_value == null` (no resolvable target → never auto-matched).
2. Measured value = `distance_meters` for a distance candidate, `duration_seconds` for a
   duration candidate.
3. Gate: keep candidates where `measured >= gateFraction * target_value`.
4. Among survivors, return the one with `min |target_value − measured|`. Tie-break:
   earliest `created_at` (caller passes candidates pre-sorted by `created_at`).
5. No survivors → `null`.

**Target resolution** (caller builds `MatchCandidate.target_value`/`metric` before calling):

| Modality | metric | target source |
|---|---|---|
| `run` | distance | `run_structure.total_distance_m` (stored on the row) |
| `swim` | distance | none stored today → `null` (not matchable in v1) |
| `strength` | duration | `STRENGTH_DURATION[session_label] * 60` (existing constant, default 40 min) |
| `yoga` | duration | `DURATION_TARGET.yoga * 60` (new default, ~30 min) |
| `other` | — | excluded before reaching the matcher |

Run target uses the **stored structure distance**, which can differ slightly from the
cycle-modulated target shown in the UI. Deliberate approximation — avoids recomputing the
whole volume plan on every import.

### Unit 2 — the reconciler (DB-facing)

```ts
// src/lib/sessionReconciler.ts
async function reconcileSessions(userId: string, fromISO: string, toISO: string): Promise<number>;
```

1. Load unlinked activities in `[from,to]`: `planned_session_id IS NULL`,
   `activity_type != 'other'`, ordered by `started_at`. Fields: id, started_at,
   activity_type, duration_seconds, distance_meters.
2. Load matchable planned sessions in `[from,to]`: `status='planned'`, ordered by
   `created_at`; include `run_structure` for run targets.
3. Index sessions by `(local_date, modality)`. Greedy single pass over activities in time
   order: derive the activity's **local calendar date**, build the candidate list from
   sessions still unlinked *this pass*, build `target_value`/`metric` per the table, call
   `matchActivityToSession(activity, candidates, { gateFraction: 0.9 })`. On a hit:
   `_commitLink(sessionId, activityId)` and mark both consumed in-memory.
4. Return number of links made.

Idempotent: only links `unlinked activity → planned session`. Re-running never double-links
(consumed sessions are `completed`; consumed activities have `planned_session_id`).

One activity → at most one session; one session → at most one activity.

### Date handling

Match on the activity's **local** calendar date (consistent with how `scheduled_date` is
written across the app), not a naive UTC day window. The removed `reconcileMoveToActivity`
used `T00:00:00Z..T23:59:59Z`, which misfiles late-evening workouts across the UTC boundary;
this design fixes that.

---

## Triggers

Inside `importNewWorkouts`, **after** the upsert loop completes:

- **First install** — reuse the existing first-run detection (anchor/REIMPORT flag). Run
  `reconcileSessions(userId, oneYearAgo, today)` once → historical backfill matching the
  1-year import window.
- **Every run thereafter** — `reconcileSessions(userId, mondayOfThisWeek, sundayOfThisWeek)`.
  Rides the HKObserver/foreground import cycle, so late-arriving and out-of-order activities
  (activity-before-session *and* session-before-activity) are swept up iteratively.

A dedicated `hk_backfill_done_v1` AsyncStorage flag guards the one-time full backfill
(independent of the existing anchor flags, so it can be reasoned about and reset alone).

---

## Manual-log path refactor

`linkActivityToSession` (called from `manual-activity.tsx`) is refactored to build candidates
and delegate to `matchActivityToSession`, so there is one matching implementation.

The **90% gate applies to manual logging too** (same `gateFraction: 0.9` as import) — one
consistent rule for what counts as completing a session, regardless of source. Manual logs
also gain closest-target disambiguation, an improvement over today's `created_at`-only pick.
Consequence to note: a deliberately logged short workout (e.g. a 20-min run against a 10km
target) will record the activity but **not** auto-complete the session; the user can adjust
in-app. This is the intended behaviour.

---

## Edge cases

- **No target** (swim today, any session missing structure) → not matched, left `planned`.
- **Already-completed session** → excluded from candidates (not re-evaluated).
- **More activities than sessions** → extras stay unlinked (correct).
- **More sessions than activities** → extras stay `planned` (correct — not done).
- **Activity exceeds every target** → still matches the closest (you did *more*, session done).
- **`other` activities** → never enter the candidate or activity sets.
- **Re-runs** → idempotent; safe on every import.

## Testing

**Matcher (pure unit tests):**
- Gate pass/fail at the 90% boundary for distance and duration modalities.
- Closest-target selection (50-min workout on upper-40/lower-45 day → lower).
- Tie-break by created_at.
- `null` target candidate skipped.
- Below-gate activity matches nothing (e.g. 20-min run vs 10km target), for both paths.

**Reconciler (mocked supabase):**
- Out-of-order arrival (activity imported before its session exists, linked on next sweep).
- Multi-session same-modality day: two activities → two distinct sessions, no double-link.
- `other` activities ignored.
- Idempotency: second run makes 0 new links.
- Backfill range vs current-week range.

---

## Files touched

- **new** `src/lib/sessionMatcher.ts` — pure matcher + target table + `DURATION_TARGET`.
- **new** `src/lib/sessionReconciler.ts` — `reconcileSessions`.
- `src/lib/healthKitImport.ts` — call reconciler after upsert; `hk_backfill_done_v1` flag.
- `src/lib/scheduleGenerator.ts` — `linkActivityToSession` delegates to the matcher; keep
  `_commitLink`.
- **new** `__tests__/lib/sessionMatcher.test.ts`, `__tests__/lib/sessionReconciler.test.ts`.

## Future extensions (out of scope, seams preserved)

- **Substitution mapping** — widen the candidate set across modalities with a quality/
  equivalence function (22km hike → long run, cross-train → strength). The matcher signature
  is the insertion point.
- **Swim targets** — add a swim structure/target so swim becomes matchable.
- **Reversal/correction UX** — let the user unlink or re-assign a wrongly matched session
  (e.g. wrong upper/lower guess).
- **Import hygiene** — stop storing non-workout `other` HealthKit samples.
