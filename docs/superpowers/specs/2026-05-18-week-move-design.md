# Week Move — Drag-to-Reorder Sessions Design

**Date:** 2026-05-18
**Status:** Approved, ready for implementation plan

## Purpose

Replace the current hidden "move forward one day" behaviour behind `MOVE THIS WEEK` with a full-week, drag-and-reorder UI. The current implementation has three real bugs:

1. **Forward-only.** `weekDates.slice(dayIdx + 1)` (`SessionDetailModal:145`) searches only days after today. The user can't move backwards.
2. **Cross-modality blind.** The "occupied" check filters by `modality + session_label`, so a gym session moves silently on top of a run that's already on the target day.
3. **No swap.** The user wants to put gym on Wednesday and bring Wednesday's run to today; current UI has no path for that.

The new design surfaces the full week, lets the user drag any planned session to any day, and disambiguates collisions explicitly.

## Out of scope

- Drag across weeks. Catch-up to next week stays a single explicit button.
- Drag into empty days outside the current Monday-to-Sunday window.
- Reordering within a single day (visual order within a day is not a user-facing concept).
- Multi-select drag.
- Editing session content from this screen (duration, pace, exercises). The Move screen is layout-only; edit lives in `SessionDetailModal`.

## Activation

The existing `MOVE THIS WEEK` button inside `SessionDetailModal` and `SessionActionModal` opens the new full-screen modal. The inline forward-only logic in both modals is deleted entirely — replaced by `router.push('/(app)/week-move?session=<id>&date=<iso>')`.

## Route

New file: `mobile/app/(app)/week-move.tsx`. Sub-menu screen pattern from `CLAUDE.md`:

- `SafeAreaView edges={['top']}`
- Header row: `chevron.left` (back, no save needed — every action commits live) ← centred `Move This Week` (display 24, pulse) → spacer
- Below header: the Mon-Sun stack and the two quick-action buttons

## Layout

### Day rows (Mon-Sun)

Seven vertically-stacked rows, each row is one day. Each row shows:

- **Day kicker** (mono 11, muted, letter-spaced): `MON 19 · TODAY` or `WED 21` (date number + weekday, with `· TODAY` suffix for today's date)
- **Session cards** stacked horizontally inside the row, scrollable horizontally if more than two fit
- **Empty state per row** when no sessions: a dashed-outline placeholder reading `EMPTY` in mono 10 muted, full-width inside the row

Each session card shows:
- Modality colour (left edge band, 4pt wide): `run` pulse, `strength` dawn, `swim`/`yoga` breath, `other` muted
- Session label (body 14, breath): `5k easy`, `Lower body`, etc.
- Modality icon (SF Symbol) + duration: `figure.run · 30 min`
- Card height: ~64pt fixed so all days have predictable row heights
- Card width: ~140pt, with horizontal gap between cards in the same row

The **session that opened the screen** is visually distinguished — pulse border, 2pt — so the user remembers which one they came in to move (they can still drag any session).

### Quick actions

Below the seven day rows, a two-button row:

| Button | Width | Behaviour |
|---|---|---|
| `CATCH UP NEXT WEEK` | flex 1 | Moves the focused session +7 days (calls `moveSession(id, date+7)`). Returns to the previous screen. |
| `DROP` | flex 1 | Marks the focused session as dropped (calls `dropSession`). Returns to the previous screen. |

Both buttons act on the **focused session** (the one that opened the screen). Not on whatever the user has been dragging — focus stays put.

## Drag interaction

Built on `react-native-gesture-handler` (already a dep) + RN's built-in `Animated.Value` for the lift/translate. No `react-native-reanimated` needed.

### Gesture states

1. **Idle.** All cards static.
2. **Long-press (400ms).** The pressed card scales to 1.05, shadow appears, haptic feedback (`expo-haptics` if available, else silent). Card enters "grabbed" state.
3. **Pan.** Card follows the finger via `transform: translate(x, y)`. As the finger moves over different day rows, that row gets a pulse highlight border (2pt, pulse colour). The original card position shows a dashed outline placeholder.
4. **Release.** Compute the drop target row from the finger's absolute Y. Trigger the drop semantics (below). Card animates to its final position over 200ms; original placeholder disappears.

### Hit-test math

Each day row reports its absolute Y bounds on layout (`onLayout` → `measureInWindow`) into a ref-held `rowBounds: { [dayISO]: { top, bottom } }`. On pan release, find the row whose `top ≤ fingerY ≤ bottom`. If none (pan ended outside any row), snap back to original position (no commit).

### Drop semantics

- **Same source row.** Snap back. No commit.
- **Target row has 0 sessions.** Single `moveSession(id, targetDate)`. Silent.
- **Target row has 1 session.** Swap: `moveSession(droppedId, targetDate)` then `moveSession(existingId, sourceDate)`. Silent.
- **Target row has 2+ sessions.** Open a bottom sheet — `What do you want to do?` — listing options:
  - `Swap with [Modality · Label]` (one row per existing session on the target day, with modality colour swatch)
  - `Add alongside [Tuesday]` (a single row at the bottom; commits a `moveSession` without swap)
  - `Cancel` (snaps the card back)
- **Target row is in the past** (any date before today): allowed. The user may want to backfill a session they actually did. No special treatment.

### Swap implementation

Sequential with rollback:

```ts
async function swapSessions(aId: string, bId: string, aDate: string, bDate: string, userId: string) {
  await moveSession(aId, bDate, userId);
  try {
    await moveSession(bId, aDate, userId);
  } catch (e) {
    // Best-effort rollback: try to move A back to its original date.
    try { await moveSession(aId, aDate, userId); } catch { /* logged, surfaced as alert */ }
    throw e;
  }
}
```

Lives in `mobile/src/lib/scheduleGenerator.ts` alongside `moveSession`. Tested with mocked Supabase.

## Overload guard

After every commit, recompute session counts per day for the current week. If any day's count > 2 after the commit, set a `hasOverload` flag. On back-press (header chevron):

- `hasOverload === false` → close immediately
- `hasOverload === true` → present an `Alert.alert` with:
  - Title: `Heavy day ahead`
  - Body: `Tuesday has 3 sessions. Keep this layout?`
  - Actions: `Keep` (close screen), `Keep editing` (stay open)

The guard does NOT block individual drops — overload is the user's choice. It just confirms on close.

The two sessions/day threshold is the warning line. Hard-coded constant `MAX_SESSIONS_BEFORE_WARN = 2` in the screen file; if multiple days are overloaded, the alert names the first one (`Tuesday and 1 other day have 3+ sessions. Keep this layout?`).

## Accessibility fallback

VoiceOver users can't drag. Each session card exposes an `onAccessibilityAction` for `activate` that opens the existing tap-to-pick flow:

- Card focused → double-tap → bottom sheet appears with seven day buttons
- Each button labelled `Mon 19, empty` / `Tue 20, Run 5k easy` / etc.
- Tap a day → if empty, move; if occupied, the same swap/add sheet from the drag path

So the gesture model is the primary path; tap-to-pick is the keyboard/VoiceOver equivalent.

## Data flow

1. Screen mounts → query `planned_sessions` for the user, `scheduled_date IN (mon..sun)`, `status = 'planned'`, ordered by date then created_at
2. Group rows by `scheduled_date` into `sessionsByDay: Record<string, PlannedSession[]>`
3. User drags → on release → call `moveSession` or `swapSessions` → on resolve, refetch the same query → re-render
4. User taps a quick-action → call `moveSession` (catch-up) or `dropSession` (drop) → `router.back()`

Refetch on every commit (not optimistic). Network round-trip per drop is acceptable for the UX (drops are infrequent compared to scrolling); the visual settle animation absorbs the latency.

## Components

**New**

| Path | Responsibility |
|---|---|
| `mobile/app/(app)/week-move.tsx` | The screen — header, day rows, quick actions, gesture handlers, refetch loop |
| `mobile/src/components/ui/DraggableSessionCard.tsx` | Single session chip with long-press → pan → release gesture |
| `mobile/src/components/ui/DayRow.tsx` | One Mon-Sun row, layout-measured for hit-testing |
| `mobile/src/components/ui/SwapPickerSheet.tsx` | Bottom sheet for multi-session target days (swap with X / swap with Y / add alongside / cancel) |

**Edited**

| Path | Why |
|---|---|
| `mobile/src/lib/scheduleGenerator.ts` | Add `swapSessions` helper |
| `mobile/src/components/ui/SessionDetailModal.tsx` | Delete `handleMoveThisWeek` + `noFreeDay` state + No-free-day inline message; `MOVE THIS WEEK` button now `router.push('/(app)/week-move?session=...&date=...')` |
| `mobile/src/components/ui/SessionActionModal.tsx` | Same replacement as SessionDetailModal |
| `mobile/app/(app)/_layout.tsx` | Register the `week-move` route in the Stack |

**No migration needed.** This is pure UX on top of the existing `planned_sessions` table and `moveSession`/`dropSession` helpers.

## Testing

**Unit**
- `swapSessions` — happy path calls `moveSession` twice; second call failure triggers a rollback `moveSession`; rollback failure throws and surfaces the error message
- Pure helper `groupSessionsByDay(rows, weekDates): Record<string, PlannedSession[]>` — buckets correctly, preserves order, includes empty arrays for days with no sessions

**Component**
- `DayRow` — renders empty state when sessions empty; renders n cards when sessions has n items
- `SwapPickerSheet` — renders one row per existing session + add-alongside + cancel; invokes the right callback on press
- `DraggableSessionCard` — long-press scales the card (test via animated value); release-without-pan does nothing

**Manual (simulator)**
- Long-press today's gym → drag down to Wednesday (which has a run) → swap sheet doesn't appear (single session, silent swap) → on release both moved
- Long-press today's gym → drag up to a past-week empty day → moves
- Long-press → drag to a day with 2 sessions → picker sheet appears with both + add-alongside option
- Drop into "add alongside" creates an overloaded day → close → confirm dialog appears
- Catch-Up button moves the focused session +7 days and exits
- Drop button marks dropped and exits

## Risks / open items

- **Gesture math.** Hit-testing a pan against absolute row positions is the most fragile part. Mitigation: explicit `onLayout`-driven bounds cache, refreshed on every re-render (cheap). Test on a phone, not just simulator.
- **`Animated.Value` jank.** Without reanimated, drag tracking runs on the JS thread. For a single card following a finger, this is fine on modern devices but may stutter on older ones. Acceptable for now; can upgrade to reanimated later if telemetry shows it.
- **Long-press conflict with ScrollView.** The Mon-Sun list is in a vertical ScrollView. Long-press inside a ScrollView can be eaten by the scroll gesture. Mitigation: `LongPressGestureHandler` from `react-native-gesture-handler` with `shouldCancelWhenOutside={false}` and a 400ms delay, which prevents accidental scroll-triggered drags.
- **Same-day drops.** Dragging a card back to its own row should snap back, not register as a "swap with self". Explicit early-return in the drop handler.
- **Race condition on rapid drops.** If the user drops a second card before the first refetch completes, the second drop might compute drop semantics against stale data. Mitigation: disable the gesture handler while any commit is in flight (a single `busy` flag on the screen).
