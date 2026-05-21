# This Week's Training widget — design

**Date:** 2026-05-21
**Status:** Approved, awaiting implementation plan
**Surface:** Dashboard (`app/(app)/(tabs)/index.tsx`)
**Component(s):** `src/components/ui/WeekStrip.tsx` (existing) + new `DayCell.tsx`, `EmptyWeekStrip.tsx`, `dayState.ts`

---

## Vision

A day-by-day grid on the dashboard giving the user a weekly overview of their programmed training. Selectable to take the user to the full Training tab where they can restructure their week to suit their own needs.

## Why this work

The current `WeekStrip` (shipped in Phase D) already renders a Mon–Sun day grid with colour-coded modality icons and refreshes on focus. It falls short of the agreed acceptance criteria on five points:

1. Completed sessions render as a bordered circle + small check icon, not a filled circle.
2. Missed sessions render as a bordered circle + minus icon, not a slim grey bar.
3. The widget is not pressable — there is no path from Dashboard to the Training tab via this surface.
4. There is no empty state when the user has no active training programme.
5. Multi-session days display the primary modality icon plus tiny dots beneath; the agreed treatment is a vertical half-circle split that gives equal weight to both sessions.

This spec refactors the rendering rules to match the agreed visual system, adds tap-through to the Training tab, adds an empty state, and splits the component for testability.

## Acceptance criteria

- Widget displays as a day-by-day grid showing Mon through Sun.
- Each day shows the session type(s) programmed for that day using colour-coded indicators.
- Completed sessions display as filled circles in the modality colour, no icon overlay.
- Missed sessions display as a bordered circle with a thin grey horizontal bar centred inside.
- Rest days display as an empty cell.
- Tapping anywhere on the widget navigates to the Training tab (`/(app)/(tabs)/training`).
- Widget reflects any changes made on the Training tab in real time (re-fetch on focus).
- If the user has no active training programme, the widget shows an empty Mon–Sun strip plus a caption "No active plan — tap to pick one"; tap still routes to the Training tab.

## Component structure

```
WeekStrip.tsx           orchestrator — data fetch + Pressable wrapper + load-tier label
├── DayCell.tsx         pure renderer for one day given DayState + isToday + dayLetter
├── EmptyWeekStrip.tsx  renders 7 empty cells + "No active plan" caption
└── dayState.ts         pure deriveDayState() — testable rules
```

### `WeekStrip.tsx`

- Fetches `planned_sessions` for this week (Monday–Sunday) plus active `training_blocks`.
- Derives a `DayState` for each of the 7 days.
- Wraps everything in a single `Pressable` that calls `router.push('/(app)/(tabs)/training')`.
- Renders `<DayCell>` × 7. Shows the today-load-tier label beneath today's column (existing behaviour).
- If no active `training_blocks` row for the user, renders `<EmptyWeekStrip>` inside the same Pressable.
- Continues to re-fetch via `useFocusEffect`.

### `DayCell.tsx`

Pure component. Given:
- `dayState: DayState`
- `isToday: boolean`
- `dayLetter: 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S'`

Renders:
- Day letter (breath colour if `isToday`, muted otherwise).
- The circle treatment for the state (see table below).

No data dependencies. No navigation. Easy to snapshot-test or visually QA in isolation.

### `EmptyWeekStrip.tsx`

Renders the same 7-column row using `<DayCell>` with `state: 'rest'` for every day, plus a centred caption beneath: "No active plan — tap to pick one". Lives inside the parent's Pressable so the entire card is one tap target.

### `dayState.ts`

```ts
export type DayState =
  | { kind: 'rest' }
  | { kind: 'planned', modality: Modality }                   // 1 session, future/today, not done
  | { kind: 'planned_multi', a: Modality, b: Modality }       // 2+ sessions, none done
  | { kind: 'completed', modality: Modality }                 // 1 session, done
  | { kind: 'completed_multi', a: Modality, b: Modality }     // 2+ sessions, all done
  | { kind: 'missed' }                                        // past day, ≥1 session, none done
  | { kind: 'mixed', completed: Modality };                   // past day, ≥1 done + ≥1 missed

export function deriveDayState(
  sessions: PlannedSession[],
  isPast: boolean
): DayState;
```

Rules (encoded as a pure function so they can be unit-tested). Let `total` = number of sessions on the day, `done` = number with `status = 'completed'`, `isPast` = `scheduled_date < today`:

| total | done       | isPast | Result                         |
|-------|------------|--------|--------------------------------|
| 0     | —          | —      | `rest`                         |
| 1     | 1          | any    | `completed(modality)`          |
| 1     | 0          | true   | `missed`                       |
| 1     | 0          | false  | `planned(modality)`            |
| 2+    | all        | any    | `completed_multi(a, b)`        |
| 2+    | 0          | true   | `missed`                       |
| 2+    | 0          | false  | `planned_multi(a, b)`          |
| 2+    | 0 < done < total | any | `mixed(top completed modality)` |

`a` and `b` are the first two sessions by modality priority order: `run > strength > swim > yoga > other`. Any 3rd+ session in a multi-session day is dropped from the visual at this surface — the full picture lives one tap away on the Training tab.

**State is determined from the full session list, not the top-2 subset.** If a day has 3 sessions and any of them is missed while at least one is completed, the state is `mixed`, regardless of whether the missed session lands in the top-2 modality slice. This keeps the rule simple and avoids hiding partial completion behind a "looks done" half-circle pair.

"Today" is treated as not-past for `isPast`. A completed-today session shows as `completed` (the `done = total` rule matches regardless of `isPast`). A not-yet-done session scheduled for today renders as `planned`, never `missed`.

## Visual rules

All circles are 32px diameter (unchanged from current).

| State | Render |
|---|---|
| `rest` | empty slot, no circle drawn |
| `planned(modality)` | bordered circle (`colors.border`, 1px) + modality icon centred, tinted in modality colour |
| `planned_multi(a, b)` | bordered circle (`colors.border`, 1px) containing two modality icons (11px) side by side, each tinted in its own modality colour. No fill. The outline-and-icons treatment is consistent with single-session `planned`; the presence of two icons (rather than one) discriminates planned-multi from planned. Completed-multi remains the filled treatment. |
| `completed(modality)` | filled circle in modality colour, no icon, no border |
| `completed_multi(a, b)` | two half-circles side by side, both filled in their modality colours, no icons |
| `missed` | bordered circle + thin horizontal bar centred inside (10w × 2h, `colors.muted`, 1px rounded ends) |
| `mixed(completed)` | left half-circle filled in `completed` modality colour; right half-circle bordered, no fill, with the same thin grey bar centred |

### Today's treatment

Today is **not** visually distinguished by the circle. The discriminator is:

- The day letter (`M`/`T`/…) renders in `colors.breath` when `isToday`, `colors.muted` otherwise.
- Today's load-tier label (`HARD` / `MOD` / `EASY` / `REST`) renders beneath today's column.

A `today + planned` cell looks identical to a `Wednesday + planned` cell in the circle itself; the surrounding chrome carries the "this is today" signal. This was the explicit user choice; the alternatives (ring around today, pulse bar beneath the letter) were rejected. Acknowledged consequence: today-as-rest-day has no circle to mark it; the breath-coloured day letter is the only today marker.

### Modality colour map (unchanged)

```
run      colors.pulse    (lime)
strength colors.dawn     (orange)
swim     colors.breath   (cream)
yoga     colors.breath   (cream)
other    colors.muted    (grey)
```

### Modality icon map (unchanged, used only for single-session planned)

```
run      figure.run
strength dumbbell
swim     figure.pool.swim
yoga     figure.mind.and.body
other    figure.mixed.cardio
```

## Tap behaviour

- The entire `VirraCard` containing the THIS WEEK label, day strip, and any caption is a single `Pressable`.
- On press: `router.push('/(app)/(tabs)/training')`.
- Accessibility: `accessibilityRole="button"`, `accessibilityLabel="This week's training — open Training tab"`.
- Per-day taps are NOT in scope. The Training tab is the editing surface.

## Empty state detection

"No active training programme" is determined by checking `training_blocks`:

```sql
select id from training_blocks
where user_id = ?
  and starts_on <= today
  and ends_on   >= today
limit 1
```

If no row → render `<EmptyWeekStrip>`. If a row exists but the week has zero `planned_sessions` (e.g. rest week within a plan), still render the day strip — those zero days become `rest` cells, not the empty state. This avoids the empty-state CTA appearing during legitimate recovery weeks.

## Real-time sync

Already wired: `useFocusEffect` triggers re-fetch when the Dashboard regains focus. Any restructuring on the Training tab is reflected on return. No additional state subscription needed for this work.

## Data flow

```
Focus →
  fetch planned_sessions (mon..sun) +
  fetch active training_blocks +
  fetch today's daily training context (for load tier label)
→ for each day:
    deriveDayState(sessionsForDay, isPast)
→ DayCell × 7 + load-tier label
→ if no active block: EmptyWeekStrip
```

## Testing

Unit tests on `dayState.ts` (pure function — high leverage):

- 0 sessions → `rest`
- 1 planned future → `planned`
- 1 planned today → `planned` (not `missed`)
- 1 completed today → `completed`
- 1 planned past → `missed`
- 1 completed past → `completed`
- 2 planned future → `planned_multi`
- 2 completed past → `completed_multi`
- 2 past, 1 done + 1 missed → `mixed`
- 2 past, both missed → `missed`
- 3 planned future, all different modalities → `planned_multi(top 2 by priority)`
- Modality priority: a day with strength + run returns `a = run, b = strength` regardless of insertion order

`DayCell` and `EmptyWeekStrip` get manual visual QA on device — no snapshot tests; they are presentational.

## Out of scope

- Per-day tap to restructure inline on the dashboard. Restructuring happens on the Training tab.
- Showing more than 2 sessions per day visually.
- Animations on state transition (planned → completed) — defer.
- The "select a programme" picker UI itself — the empty state routes to the Training tab where plan selection already lives.
- Phase F (Plan Editability) work — independent.

## Files changed / added

```
mobile/src/components/ui/WeekStrip.tsx          modified
mobile/src/components/ui/DayCell.tsx            new
mobile/src/components/ui/EmptyWeekStrip.tsx     new
mobile/src/lib/dayState.ts                      new
mobile/src/lib/__tests__/dayState.test.ts       new
```

`mobile/app/(app)/(tabs)/index.tsx` is unchanged — `<WeekStrip>` already mounts there.
