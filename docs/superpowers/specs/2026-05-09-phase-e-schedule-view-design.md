# Phase E — Schedule View + Session Detail + Volume Intelligence

## Context

The training calendar and WeekStrip already display planned sessions from `planned_sessions` by querying across all active blocks. The data layer works. What's missing is the intelligence layer: sessions show a label and a modality dot, but no distance, pace, or duration. The volume plan is static (straight from the template) with no awareness of what's been missed. MOVE THIS WEEK picks the next calendar day regardless of whether that day already has a session. Race events in `user_events` are invisible in the UI.

This spec wires the intelligence layer into the existing views without changing their structure.

---

## Scope

Five deliverables:

1. **`volumePlan.ts`** — pace resolution + weekly volume redistribution + per-session detail computation
2. **DB migration** — `target_finish_time` on `user_events` + unique constraint on `planned_sessions`
3. **`SessionDetailModal`** — enhanced day-tap modal replacing `SessionActionModal` in the calendar
4. **`MonthCalendar` race markers** — `user_events` surfaced as milestone flags
5. **Smart scheduling fix** — free-day query in `handleMoveThisWeek`

---

## Deliverable 1: `volumePlan.ts`

### File

`src/lib/volumePlan.ts`

---

### 1a. Pace Resolution — `getGoalPace`

```typescript
export interface GoalPace {
  seconds_per_km: number;
  source: 'event_target' | 'split_calibrated' | 'baseline';
}

export async function getGoalPace(
  userId:        string,
  blockId:       string,
  phase:         CyclePhase | null,
): Promise<GoalPace>
```

Checks in priority order:

**1. Event target finish time**

If the block has an `event_id`, query `user_events.target_finish_time` (e.g. `"4:15:00"`). If set, derive race pace:

```
finish_seconds = hours×3600 + minutes×60 + seconds
race_distance_km = RACE_DISTANCES[plan_template.distance_goal]  // see below
goal_pace = finish_seconds / race_distance_km
```

```typescript
const RACE_DISTANCES: Record<string, number> = {
  '5k':           5.0,
  '10k':          10.0,
  'half_marathon': 21.0975,
  'marathon':      42.195,
  'general':       null,   // no distance target — skip this source
};
```

If `distance_goal` is `'general'` or `RACE_DISTANCES` returns null, skip to source 2.

**2. Split-calibrated refinement**

Query `run_details` joined through `activities → planned_sessions` where `block_id = blockId` and `activities.planned_session_id IS NOT NULL` and `planned_sessions.status = 'completed'`. Minimum 3 rows required.

For each completed session:
- Get `avg_pace_seconds_per_km` from `run_details`
- Get `session_label` from `planned_sessions`
- Normalise to threshold-pace equivalent: `threshold_estimate = actual_pace / TYPE_INVERSE_MODIFIER[session_label]`

```typescript
const TYPE_INVERSE_MODIFIER: Record<string, number> = {
  interval:    0.92,
  tempo:       1.00,
  threshold:   1.00,
  race:        1.00,
  moderate:    1.05,
  progression: 1.05,
  long:        1.15,
  easy:        1.20,
  recovery:    1.20,
  base:        1.20,
};
```

Average the threshold estimates. If the result differs from `user_profiles.baseline_pace_seconds_per_km` by more than 5%, use the refined value. Source = `'split_calibrated'`.

**3. Baseline fallback**

Query `user_profiles.baseline_pace_seconds_per_km` for the user. Source = `'baseline'`.

---

### 1b. Session Pace Target — `getSessionPaceTarget`

```typescript
export function getSessionPaceTarget(
  goalPace:     number,        // seconds per km
  sessionLabel: string,
  phase:        CyclePhase | null,
): number                      // seconds per km
```

```typescript
const TYPE_MODIFIER: Record<string, number> = {
  interval:    0.92,
  tempo:       1.00,
  threshold:   1.00,
  race:        1.00,
  moderate:    1.05,
  progression: 1.05,
  long:        1.15,
  easy:        1.20,
  recovery:    1.20,
  base:        1.20,
};

const PHASE_MODIFIER: Record<string, number> = {
  ovulatory:  0.97,
  follicular: 0.98,
  luteal:     1.03,
  menstrual:  1.05,
};
```

`pace_target = goalPace × (TYPE_MODIFIER[sessionLabel] ?? 1.0) × (PHASE_MODIFIER[phase ?? ''] ?? 1.0)`

---

### 1c. Weekly Volume Plan — `getWeeklyVolumePlan`

```typescript
export interface WeekVolumePlan {
  week_number:   number;
  original_km:   number;
  adjusted_km:   number;
  phase:         CyclePhase | null;
  is_current:    boolean;
  is_past:       boolean;
}

export interface VolumePlanResult {
  weeks:          WeekVolumePlan[];
  total_km:       number;
  completed_km:   number;
  remaining_km:   number;
  deficit_message: string | null;   // null = on track; string = motivational coaching message
}

export async function getWeeklyVolumePlan(
  userId:      string,
  blockId:     string,
  cycleStore:  { periodStart: Date | null; cycleLength: number },
): Promise<VolumePlanResult>
```

**Algorithm:**

1. Fetch the block: `training_blocks` → `plan_templates.sessions_json` (weekly km + sessions)
2. `total_km` = sum of `sessions_json[].km`
3. `completed_km` = sum of `activities.distance_meters / 1000` for activities whose `planned_session_id` links to a `planned_sessions` row where `block_id = blockId` and `status = 'completed'`
4. `remaining_km` = total_km − completed_km
5. Determine current week index from `block.starts_on`
6. Past weeks = weeks before current — use their original km (already done, cannot change)
7. Remaining weeks = current week onward
8. For each remaining week, compute cycle phase by projecting forward from `periodStart` using `cycleLength`
9. Compute raw weight per remaining week:

```
phase_weight = { follicular: 1.15, ovulatory: 1.10, luteal: 0.90, menstrual: 0.85, null: 1.0 }
front_load   = 0.92 ^ week_index_in_remaining   // 0-indexed; week 0 = 1.0, week 1 = 0.92, …
raw_weight   = phase_weight × front_load
```

10. Normalise: `adjusted_km[w] = remaining_km × raw_weight[w] / Σ(raw_weights)`
11. Safety cap: `adjusted_km[w]` must not exceed `1.30 × original_km[w]`. Cap excess and redistribute it forward to the next uncapped week(s). Taper weeks (where `original_km` drops below preceding week) are protected — capped at their original value.
12. If after redistribution any remaining km cannot be safely placed, compute `deficit_km` = total_km − completed_km − Σ(adjusted_km for remaining weeks). If `deficit_km > 0`:

**Deficit message** (motivational, not alarming):

> "Whilst you've missed some sessions, your goal is still within reach. Hit the remaining sessions and aim for a revised pace of **{revised_pace}/km** on race day."

`revised_pace` = computed from achievable volume vs race distance. If block has no race distance, omit the pace and end with "…hit the remaining sessions to give yourself the best chance."

---

### 1d. Day Session Detail — `getDaySessionDetail`

```typescript
export interface RunSessionDetail {
  kind:              'run';
  planned_session_id: string;
  session_label:     string;
  distance_km:       number;
  pace_target_secs:  number;     // seconds per km
  estimated_minutes: number;
  status:            string;
  actual_pace_secs:  number | null;   // from run_details if completed
  actual_distance_km: number | null;
}

export interface StrengthSessionDetail {
  kind:              'strength';
  planned_session_id: string;
  session_label:     string;
  estimated_minutes: number;
  status:            string;
}

export type SessionDetail = RunSessionDetail | StrengthSessionDetail;

export interface DayDetail {
  date:     string;
  sessions: SessionDetail[];
  phase:    CyclePhase | null;
  phase_guidance: string;
  volume_plan: VolumePlanResult;  // for surfacing deficit message if present
}

export async function getDaySessionDetail(
  userId:     string,
  dateISO:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null },
): Promise<DayDetail>
```

**Steps:**

1. Query `planned_sessions` for `user_id = userId`, `scheduled_date = dateISO`, `status != 'moved'`
2. Group by `block_id` — each block is processed independently
3. For each run-modality block:
   a. Call `getGoalPace(userId, blockId, phase)`
   b. Call `getWeeklyVolumePlan(userId, blockId, cycleStore)`
   c. Get `adjusted_km` for this session's `week_number`
   d. Get all active run sessions in this week for this block (status = `planned` or `completed`)
   e. Distribute `adjusted_km` across active sessions by type weight:
      - If a `long` session exists in the week: long = 40%, others split remainder proportionally by `TYPE_MODIFIER` inverse (harder sessions get less distance)
      - If no `long`: distribute proportionally by inverse intensity
   f. For completed sessions: fetch actual pace + distance from `run_details`
   g. `pace_target_secs` = `getSessionPaceTarget(goal_pace, session_label, phase)`
   h. `estimated_minutes` = `distance_km / (pace_target_secs / 60)`

4. For strength sessions:
   ```typescript
   const STRENGTH_DURATION: Record<string, number> = {
     lower: 45, upper: 40, general: 35,
   };
   ```
   `estimated_minutes = STRENGTH_DURATION[session_label] ?? 40`

5. `phase_guidance` = existing `PHASE_LOAD[phase].note` string (from `nutritionTargets.ts` or equivalent)

---

## Deliverable 2: DB Migration

### File

`supabase/migrations/011_phase_e_schedule.sql`

```sql
-- 1. Target finish time for race events (optional, set by user)
alter table public.user_events
  add column if not exists target_finish_time text;
-- format: 'HH:MM:SS', e.g. '4:15:00'. Nullable — no constraint, freeform entry validated in app.

-- 2. Prevent duplicate planned sessions (same user, date, modality, label, active status)
create unique index if not exists planned_sessions_no_clash_idx
  on public.planned_sessions (user_id, scheduled_date, modality, session_label)
  where status in ('planned', 'completed');
-- Allows upper + lower strength on same day (different labels).
-- Prevents duplicate tempo run on same day at the DB level.

notify pgrst, 'reload schema';
```

---

## Deliverable 3: `SessionDetailModal`

### File

`src/components/ui/SessionDetailModal.tsx`

Replaces `SessionActionModal` in `training.tsx`. Called when a day is tapped in `MonthCalendar`.

### Props

```typescript
interface Props {
  visible:   boolean;
  date:      string;
  userId:    string;
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null };
  onClose:   () => void;
  onMutate:  () => void;   // triggers calendar reload after drop/move/catch-up
}
```

### Layout

```
┌─ WEDNESDAY 14 MAY ─────────────────┐
│  FOLLICULAR · High adaptation       │  ← phase banner (colors.pulse text, muted bg)
├────────────────────────────────────┤
│  Tempo Run                          │  ← session_label, capitalised
│  8.2km · 5:23/km · ~44 min         │  ← distance · pace · duration (mono, muted)
│  [DROP]  [MOVE THIS WEEK]  [DONE]  │  ← only for 'planned' status
├────────────────────────────────────┤
│  Upper Gym                          │
│  ~40 min                            │
│  [DROP]  [MOVE THIS WEEK]  [DONE]  │
└────────────────────────────────────┘
```

**Status variants:**
- `planned`: full detail + action buttons (DROP / MOVE THIS WEEK / CATCH-UP)
- `completed`: checkmark icon + actual pace and distance (from `run_details`) instead of targets. No action buttons.
- `dropped`: greyed label + `DROPPED` mono tag. No action buttons.

**Deficit message:** If `volume_plan.deficit_message` is non-null, render it below the last session card in `colors.dawn` (orange), body 13pt. This is the motivational coaching message.

**Loading state:** `getDaySessionDetail` is called on `visible = true`. Show a skeleton/ActivityIndicator while loading. This avoids blocking the calendar tap.

**Pace formatting helper:**

```typescript
function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}
```

### Action wiring

DROP → `dropSession(plannedSessionId)` → `onMutate()`

MOVE THIS WEEK → smart free-day logic (see Deliverable 5) → `moveSession(plannedSessionId, freeDate, userId)` → `onMutate()`

CATCH-UP → `moveSession(plannedSessionId, shiftDate(date, 7), userId)` → `onMutate()`

If MOVE THIS WEEK finds no free day: show inline message *"No free day this week — use Catch-Up to reschedule next week."* and hide the MOVE THIS WEEK button.

---

## Deliverable 4: MonthCalendar Race Markers

### File

`src/components/ui/MonthCalendar.tsx`

### Changes

In `load()`, add a second query alongside the existing `planned_sessions` fetch:

```typescript
const { data: events } = await supabase
  .from('user_events')
  .select('id, event_date, name, priority, target_finish_time')
  .eq('user_id', userId)
  .gte('event_date', toISO(year, month, 1))
  .lte('event_date', toISO(year, month, daysInMonth(year, month)));
```

Build an `eventMap: Record<string, UserEvent[]>` keyed by date.

### Cell rendering

In each day cell, after the dot row, if `eventMap[iso]` is non-empty, render a SF Symbol below:

```tsx
<SymbolView
  name="flag.fill"
  size={8}
  tintColor={eventMap[iso][0].priority === 'high' ? colors.heat : colors.muted}
/>
```

### Race date tap

When a day has events but no planned sessions, `onDayPress` is still fired. The `SessionDetailModal` handles this gracefully — it calls `getDaySessionDetail` which returns an empty `sessions[]` but with the date. Add a separate `onEventPress?(date: string, events: UserEvent[])` prop to `MonthCalendar` for future expansion; for now, the existing `onDayPress` shows the `SessionDetailModal` which can display event info at the top.

Alternatively: if the tapped day has zero sessions but has events, show a lightweight event info card within `SessionDetailModal` — event name, distance goal, target finish time (if set), days until race. No action buttons.

---

## Deliverable 5: Smart Scheduling Fix

### File

`src/components/ui/SessionActionModal.tsx`

### `handleMoveThisWeek` — current behaviour

Tries each remaining day in the same Mon–Sun window and calls `moveSession`. Because there is no unique constraint (until migration 011), `moveSession` always succeeds on the first candidate — which is tomorrow, regardless of clashes.

### Fixed behaviour

```typescript
async function handleMoveThisWeek(s: CalendarSession) {
  const monday   = mondayOfISO(date);
  const jsDay    = new Date(`${date}T00:00:00`).getDay();
  const dayIdx   = jsDay === 0 ? 6 : jsDay - 1;

  // Query occupied dates for same modality + label in this week
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const { data: occupied } = await supabase
    .from('planned_sessions')
    .select('scheduled_date')
    .eq('user_id', userId)
    .eq('modality', s.modality)
    .eq('session_label', s.session_label)
    .in('status', ['planned', 'completed'])
    .in('scheduled_date', weekDates);

  const occupiedSet = new Set((occupied ?? []).map((r) => r.scheduled_date));
  occupiedSet.add(date); // current date is vacating, but treat as occupied to avoid same-day re-insert

  const freeDay = weekDates.slice(dayIdx + 1).find((d) => !occupiedSet.has(d));

  if (!freeDay) {
    setNoFreeDay(true); // shows inline message + hides MOVE THIS WEEK button
    return;
  }

  setBusy(true);
  try {
    await moveSession(s.id, freeDay, userId);
    onMutate();
  } catch (e: any) {
    Alert.alert('Could not move session', e.message);
  } finally {
    setBusy(false);
  }
}
```

Add `noFreeDay` state: when true, replace the MOVE THIS WEEK button with the message *"No free day this week — use Catch-Up to reschedule next week."*

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/volumePlan.ts` | `getGoalPace`, `getSessionPaceTarget`, `getWeeklyVolumePlan`, `getDaySessionDetail` |
| Create | `supabase/migrations/011_phase_e_schedule.sql` | `target_finish_time` column + unique constraint |
| Create | `src/components/ui/SessionDetailModal.tsx` | Enhanced day modal — computed detail + phase banner + deficit message + actions |
| Modify | `src/components/ui/MonthCalendar.tsx` | Race event query + flag markers + `onEventPress` prop |
| Modify | `src/components/ui/SessionActionModal.tsx` | Free-day query in `handleMoveThisWeek`, `noFreeDay` state |
| Modify | `app/(app)/(tabs)/training.tsx` | Use `SessionDetailModal` instead of `SessionActionModal`; pass `cycleStore` |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Block has no linked template | `getWeeklyVolumePlan` returns empty weeks, `getDaySessionDetail` omits distance/pace for run sessions |
| Block has no `event_id` | `getGoalPace` skips source 1, falls through to splits or baseline |
| `target_finish_time` set but `distance_goal = 'general'` | Skip event-target source — no race distance to derive pace from |
| Fewer than 3 completed run sessions | Split calibration skipped, baseline used |
| Redistribution deficit too large to absorb | Deficit message surfaced; adjusted weeks hit their 1.30× caps; remaining deficit acknowledged in coaching message |
| Taper week | Protected from redistribution — capped at original km |
| Day has events but no sessions | `SessionDetailModal` shows event info card (name, target finish time, days until race), no action buttons |
| Strength session with unrecognised label | `estimated_minutes = 40` (default) |
| `planned_sessions` unique constraint violation on MOVE THIS WEEK | Caught by `moveSession` error; `handleMoveThisWeek` free-day query prevents reaching this in normal flow |
| Multiple blocks on same day (run + strength) | Each block processed independently in `getDaySessionDetail`; all sessions shown in single modal |

---

## Spec Self-Review

**Placeholder scan:** None. All sections specify exact types, queries, algorithms, and SQL.

**Internal consistency:**
- `TYPE_MODIFIER` in `getSessionPaceTarget` and `TYPE_INVERSE_MODIFIER` in split calibration are inverses of each other ✓
- `getDaySessionDetail` calls `getWeeklyVolumePlan` internally — `VolumePlanResult` is in scope ✓
- `SessionDetailModal` takes `cycleStore` prop matching `getDaySessionDetail` signature ✓
- `training.tsx` passes `cycleStore` (already has `useCycleStore` destructure) ✓
- Migration 011 unique constraint uses `session_label` — matches `handleMoveThisWeek` query which also filters by `session_label` ✓
- Deficit message tone is motivational throughout — no failure framing ✓

**Scope check:** One spec, tightly coupled deliverables — all depend on `volumePlan.ts` as the data source. Shippable as a unit.

**Phase E extension points:**
- `getWeeklyVolumePlan` signature is stable — Phase E sub-project 2 (plan stacking) will extend it by accepting multiple blocks and applying `computeBlockLoad` to scale the run block's `remaining_km` before redistribution
- `getDaySessionDetail` returns `volume_plan` in full — future screens (e.g. a weekly summary) can consume it without changes to the utility
