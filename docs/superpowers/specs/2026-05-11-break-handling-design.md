# Break Handling — Design Spec

**Date:** 2026-05-11
**Phase:** E sub-project 3a (holiday/illness break handling)
**Status:** Approved

---

## Goal

Let users schedule training breaks (holiday, illness, injury) that either drop sessions in the break window or shift all future sessions forward. Entry points: long-press on the monthly calendar (primary) and a Profile row.

---

## Architecture

- New `training_breaks` table records each break with mode and affected block IDs
- `applyBreak()` function added to `scheduleGenerator.ts` — mutates `planned_sessions` and updates `training_blocks.ends_on`
- `BreakModal` single-scroll component — date range, block selector, mode toggle, confirm
- `breaks.tsx` new screen for break history (from Profile)
- MonthCalendar gains `onLongPress` prop → pre-fills break start date in modal

---

## Data Model

### `training_breaks` table

```sql
create table public.training_breaks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  break_start date not null,
  break_end   date not null,
  mode        text not null check (mode in ('reschedule', 'skip')),
  block_ids   uuid[] not null,
  applied_at  timestamptz default now(),
  check (break_end >= break_start)
);
alter table public.training_breaks enable row level security;
create policy "Users manage own breaks"
  on public.training_breaks for all
  using (auth.uid() = user_id);
notify pgrst, 'reload schema';
```

`block_ids` is a postgres `uuid[]` array — stores which blocks the break was applied to. Queried client-side only for display (no joins needed).

---

## Break Logic — `applyBreak`

Signature:
```typescript
async function applyBreak(
  userId:     string,
  blockIds:   string[],
  breakStart: string, // ISO date
  breakEnd:   string, // ISO date
  mode:       'reschedule' | 'skip',
): Promise<void>
```

Steps (applied in order, no rollback — mutations are immediate):

1. Fetch all `planned` sessions for `blockIds` where `scheduled_date >= breakStart`, ordered by date
2. Sessions with `scheduled_date <= breakEnd` → `UPDATE status = 'dropped'`
3. If `mode === 'reschedule'`:
   - `breakLength = daysBetween(breakStart, breakEnd) + 1` (inclusive — May 15 to May 22 = 8 days)
   - Sessions with `scheduled_date > breakEnd` → `UPDATE scheduled_date = scheduled_date + breakLength`
   - For each block in `blockIds`: if `ends_on` is set → `UPDATE ends_on = ends_on + breakLength`
4. Insert row into `training_breaks` with all params + `applied_at = now()`

The unique index `planned_sessions_no_clash_idx` may reject shifts that land on dates already occupied by a session with the same `(user_id, scheduled_date, modality, session_label)`. This can only happen if the user has two overlapping blocks of the same modality. If a conflict arises, log a warning and skip that session (it will remain in its original position).

---

## Components

### `BreakModal` — `src/components/ui/BreakModal.tsx`

A single scrollable `VirraModal`. All controls on one screen.

Props:
```typescript
interface Props {
  visible:      boolean;
  userId:       string;
  activeBlocks: TrainingBlock[];   // from parent — avoid re-fetching
  initialDate?: string;           // pre-fills break_start (from long-press)
  onClose:      () => void;
  onApplied:    () => void;        // trigger calendar/profile reload
}
```

Layout (top to bottom inside `VirraModal`):
1. **DATE RANGE section** — label `BREAK PERIOD`
   - FROM row: date display + calendar icon → `DateTimePicker` on press (mode=date, minimumDate=today)
   - TO row: date display + calendar icon → `DateTimePicker` on press (mode=date, minimumDate=breakStart)
2. **AFFECTS section** — label `AFFECTS`
   - List of active blocks, each as a pressable row with a checkbox SF symbol (`checkmark.square` / `square`)
   - Block display: modality icon + template name (or modality if no template) + supplementary badge if `!is_primary`
   - All checked by default on open
3. **MODE section** — label `HOW TO HANDLE`
   - Two pressable pills: `RESCHEDULE` (shift forward) and `SKIP` (mark dropped)
   - Selected pill has `colors.pulse` background, unselected has `colors.mist` border
   - Sub-text under each: "Sessions slide forward · plan extends" vs "Sessions dropped · no reschedule"
4. **Confirm button** — disabled if: no blocks selected, or `breakEnd < breakStart`
5. **Cancel ghost button**

### MonthCalendar — long-press addition

`src/components/ui/MonthCalendar.tsx`:
- Add `onLongPress?: (date: string) => void` to Props
- Day cell `<Pressable>` gains `onLongPress={() => onLongPress?.(iso)}`
- Haptic feedback (`expo-haptics` — already available) on long-press

`app/(app)/(tabs)/training.tsx`:
- Add `breakModalVisible` and `breakModalStartDate` state
- Pass `onLongPress` to `MonthCalendar` → sets `breakModalStartDate`, opens modal
- Render `<BreakModal>` alongside existing modals

### Profile — `TRAINING` card

`app/(app)/(tabs)/profile.tsx`:
- New `VirraCard` with label `TRAINING` inserted above `NOTIFICATIONS` card
- Contains one `Row`: label `BREAKS`, value = break summary (see below), `onPress` → `router.push('/(app)/breaks')`
- Break summary logic (loaded on focus with `useFocusEffect`):
  - Query `training_breaks` for this user ordered by `break_start DESC` limit 1
  - If upcoming (break_start >= today): `"May 15–22"` in `colors.pulse`
  - If last (most recent past): `"Last: Apr 3–7"` in `colors.muted`
  - If none: `"None scheduled"` in `colors.muted`

### Breaks history — `app/(app)/breaks.tsx`

New screen. Route: `/(app)/breaks`.

Header: "BREAKS" + `+` icon button (top-right, `SF: plus`) → opens `BreakModal`

Content (scroll):
- Fetch all `training_breaks` for user, ordered by `applied_at DESC`
- Empty state: "No breaks recorded. Long-press any day in your training calendar to schedule one."
- Each break row:
  - Left: date range formatted as `"15–22 May 2026"` in `colors.breath`
  - Below: mode badge (`RESCHEDULE` or `SKIP`) in `colors.mono` + `· N block(s)` count
  - Right: SF `checkmark.circle` in `colors.pulse` if in the past, `clock` in `colors.muted` if upcoming

Register route in `app/(app)/_layout.tsx` as a stack screen (`title: 'Breaks'`).

---

## File Map

| Action   | Path                                              | Responsibility |
|----------|---------------------------------------------------|----------------|
| Create   | `supabase/migrations/012_training_breaks.sql`     | New table + RLS |
| Modify   | `src/lib/scheduleGenerator.ts`                    | `applyBreak` function |
| Create   | `src/components/ui/BreakModal.tsx`                | Single-scroll break modal |
| Modify   | `src/components/ui/MonthCalendar.tsx`             | Add `onLongPress` prop |
| Modify   | `app/(app)/(tabs)/training.tsx`                   | Wire long-press + BreakModal |
| Modify   | `app/(app)/(tabs)/profile.tsx`                    | Add TRAINING card with BREAKS row |
| Create   | `app/(app)/breaks.tsx`                            | Break history screen |
| Modify   | `app/(app)/_layout.tsx`                           | Register breaks route |

---

## Edge Cases

- **Break after block ends**: If `break_start > block.ends_on`, there are no sessions to affect — `applyBreak` inserts the `training_breaks` row anyway (harmless, user may have miscalculated).
- **Zero sessions in range**: If no `planned` sessions exist in the break window (already completed/dropped), still insert the break record.
- **Unique constraint conflict on shift**: Log a warning and skip the conflicting session — don't fail the whole operation.
- **Break overlapping another break**: No validation — each break applies independently. User is responsible for not double-applying.
- **Block with no `ends_on`**: Skip the `ends_on` extension for that block (open-ended blocks have no end date to extend).

---

## Out of Scope

- Cancelling or editing an applied break (irreversible in this phase)
- Recurring breaks (e.g. "every Christmas")
- Breaks affecting nutrition logs or insights recalculation
