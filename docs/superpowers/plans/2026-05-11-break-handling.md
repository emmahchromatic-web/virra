# Break Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users schedule training breaks (holiday, illness) that either drop sessions in the break window or shift all future sessions forward — triggered by long-press on the monthly calendar or from a new Profile section.

**Architecture:** New `training_breaks` table records each break. A pure `computeBreakDays` function (testable) computes which session IDs to drop vs shift. An async `applyBreak` function in `scheduleGenerator.ts` applies mutations to Supabase and inserts the break record. A `BreakModal` single-scroll component is accessed from MonthCalendar long-press and from a new `breaks.tsx` history screen linked from Profile.

**Tech Stack:** Supabase MCP (migration), React Native, `@react-native-community/datetimepicker`, expo-symbols, existing `VirraModal`/`VirraCard`/`VirraButton`/`VirraText` components, expo-router, Zustand `useAuthStore`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `mobile/supabase/migrations/012_training_breaks.sql` | New table + RLS |
| Modify | `mobile/src/lib/scheduleGenerator.ts` | `computeBreakDays` + `applyBreak` exports |
| Create | `mobile/__tests__/lib/breakHandling.test.ts` | Unit tests for `computeBreakDays` |
| Create | `mobile/src/components/ui/BreakModal.tsx` | Single-scroll break modal |
| Modify | `mobile/src/components/ui/MonthCalendar.tsx` | Add `onLongPress` prop |
| Modify | `mobile/app/(app)/(tabs)/training.tsx` | Wire long-press + render BreakModal |
| Modify | `mobile/app/(app)/(tabs)/profile.tsx` | Add TRAINING card with BREAKS row |
| Create | `mobile/app/(app)/breaks.tsx` | Break history screen |
| Modify | `mobile/app/(app)/_layout.tsx` | Register `breaks` route |

---

## Task 1: DB Migration — `training_breaks`

**Files:**
- Create: `mobile/supabase/migrations/012_training_breaks.sql`

- [ ] **Step 1: Write the migration file**

```sql
create table public.training_breaks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  break_start date not null,
  break_end   date not null,
  mode        text not null check (mode in ('reschedule', 'skip')),
  block_ids   uuid[] not null default '{}',
  applied_at  timestamptz default now(),
  check (break_end >= break_start)
);

create index training_breaks_user_idx
  on public.training_breaks (user_id, break_start desc);

alter table public.training_breaks enable row level security;
create policy "Users manage own breaks"
  on public.training_breaks for all
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `012_training_breaks` and the SQL above.

Verify with `mcp__supabase__execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'training_breaks'
order by ordinal_position;
```
Expected columns: `id, user_id, break_start, break_end, mode, block_ids, applied_at`.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/supabase/migrations/012_training_breaks.sql
git commit -m "feat: add training_breaks table for break history tracking"
```

---

## Task 2: `computeBreakDays` + `applyBreak` in `scheduleGenerator.ts`

**Files:**
- Modify: `mobile/src/lib/scheduleGenerator.ts`
- Create: `mobile/__tests__/lib/breakHandling.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/lib/breakHandling.test.ts`:

```typescript
import { computeBreakDays } from '@/lib/scheduleGenerator';

const sessions = [
  { id: 's1', scheduled_date: '2026-05-12' }, // before break — unaffected
  { id: 's2', scheduled_date: '2026-05-15' }, // in break window → drop
  { id: 's3', scheduled_date: '2026-05-18' }, // in break window → drop
  { id: 's4', scheduled_date: '2026-05-23' }, // after break → shift in reschedule
  { id: 's5', scheduled_date: '2026-05-26' }, // after break → shift in reschedule
];
// break_start=2026-05-14, break_end=2026-05-21 → 8 days inclusive

test('reschedule: drops sessions in window, shifts sessions after', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).toEqual(['s2', 's3']);
  expect(r.toShiftIds).toEqual(['s4', 's5']);
  expect(r.shiftDays).toBe(8);
});

test('skip: drops sessions in window, no shifts', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'skip');
  expect(r.toDropIds).toEqual(['s2', 's3']);
  expect(r.toShiftIds).toEqual([]);
  expect(r.shiftDays).toBe(0);
});

test('sessions before break start are untouched', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).not.toContain('s1');
  expect(r.toShiftIds).not.toContain('s1');
});

test('single-day break: shiftDays = 1', () => {
  const r = computeBreakDays(sessions, '2026-05-15', '2026-05-15', 'reschedule');
  expect(r.shiftDays).toBe(1);
  expect(r.toDropIds).toEqual(['s2']);
  expect(r.toShiftIds).toEqual(['s4', 's5']);
});

test('break with no sessions: all arrays empty', () => {
  const r = computeBreakDays([], '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).toEqual([]);
  expect(r.toShiftIds).toEqual([]);
  expect(r.shiftDays).toBe(8);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx jest --no-coverage breakHandling 2>&1 | tail -10
```
Expected: FAIL — `computeBreakDays is not a function` or similar.

- [ ] **Step 3: Add `computeBreakDays` and `applyBreak` to `scheduleGenerator.ts`**

At the bottom of `mobile/src/lib/scheduleGenerator.ts`, append:

```typescript
// ---- Break handling ----

export interface BreakMutations {
  toDropIds:  string[];
  toShiftIds: string[];
  shiftDays:  number;
}

export function computeBreakDays(
  sessions:   Array<{ id: string; scheduled_date: string }>,
  breakStart: string,
  breakEnd:   string,
  mode:       'reschedule' | 'skip',
): BreakMutations {
  const shiftDays = mode === 'reschedule' ? _daysBetween(breakStart, breakEnd) + 1 : 0;
  const toDropIds:  string[] = [];
  const toShiftIds: string[] = [];
  for (const s of sessions) {
    if (s.scheduled_date >= breakStart && s.scheduled_date <= breakEnd) {
      toDropIds.push(s.id);
    } else if (s.scheduled_date > breakEnd && mode === 'reschedule') {
      toShiftIds.push(s.id);
    }
  }
  return { toDropIds, toShiftIds, shiftDays };
}

export async function applyBreak(
  userId:     string,
  blockIds:   string[],
  breakStart: string,
  breakEnd:   string,
  mode:       'reschedule' | 'skip',
): Promise<void> {
  if (blockIds.length === 0) return;

  // Fetch all planned sessions in affected blocks from breakStart onward
  const { data: sessions, error } = await supabase
    .from('planned_sessions')
    .select('id, scheduled_date')
    .in('block_id', blockIds)
    .gte('scheduled_date', breakStart)
    .eq('status', 'planned')
    .order('scheduled_date', { ascending: false }); // reverse order: shift latest first to avoid clash
  if (error) throw new Error(error.message);

  const { toDropIds, toShiftIds, shiftDays } = computeBreakDays(
    sessions ?? [],
    breakStart,
    breakEnd,
    mode,
  );

  // Drop sessions in the break window
  if (toDropIds.length > 0) {
    const { error: dropErr } = await supabase
      .from('planned_sessions')
      .update({ status: 'dropped' })
      .in('id', toDropIds);
    if (dropErr) console.warn('[scheduleGenerator] applyBreak drop:', dropErr.message);
  }

  // Shift sessions after break window (reschedule mode) — process latest-first to avoid unique clashes
  if (mode === 'reschedule' && shiftDays > 0) {
    const sessionsToShift = (sessions ?? []).filter((s) => toShiftIds.includes(s.id));
    for (const s of sessionsToShift) {
      const newDate = _addDaysISO(s.scheduled_date, shiftDays);
      const { error: shiftErr } = await supabase
        .from('planned_sessions')
        .update({ scheduled_date: newDate })
        .eq('id', s.id);
      if (shiftErr) console.warn(`[scheduleGenerator] applyBreak shift ${s.id}:`, shiftErr.message);
    }

    // Extend block.ends_on for each affected block
    for (const blockId of blockIds) {
      const { data: block } = await supabase
        .from('training_blocks')
        .select('ends_on')
        .eq('id', blockId)
        .single();
      if (block?.ends_on) {
        await supabase
          .from('training_blocks')
          .update({ ends_on: _addDaysISO(block.ends_on, shiftDays) })
          .eq('id', blockId);
      }
    }
  }

  // Record the break
  await supabase.from('training_breaks').insert({
    user_id:    userId,
    break_start: breakStart,
    break_end:   breakEnd,
    mode,
    block_ids:  blockIds,
  });
}

function _daysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00Z');
  const e = new Date(endISO   + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function _addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx jest --no-coverage breakHandling 2>&1 | tail -10
```
Expected: 5 tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/src/lib/scheduleGenerator.ts mobile/__tests__/lib/breakHandling.test.ts
git commit -m "feat: computeBreakDays + applyBreak — break handling logic in scheduleGenerator"
```

---

## Task 3: `BreakModal` Component

**Files:**
- Create: `mobile/src/components/ui/BreakModal.tsx`

- [ ] **Step 1: Write `BreakModal.tsx`**

```typescript
import React, { useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { applyBreak } from '@/lib/scheduleGenerator';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraButton } from './VirraButton';
import { VirraText } from './VirraText';
import type { TrainingBlock } from '@/lib/trainingBlocks';

interface Props {
  visible:      boolean;
  userId:       string;
  activeBlocks: TrainingBlock[];
  initialDate?: string; // ISO — pre-fills break_start (from long-press)
  onClose:      () => void;
  onApplied:    () => void;
}

const MODALITY_ICON: Record<string, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.walk',
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toLocalISO(date: Date): string {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function BreakModal({ visible, userId, activeBlocks, initialDate, onClose, onApplied }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const initStart = initialDate ? parseISO(initialDate) : today;
  const initEnd   = addDays(initStart, 6);

  const [breakStart,      setBreakStart]      = useState<Date>(initStart);
  const [breakEnd,        setBreakEnd]        = useState<Date>(initEnd);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker,   setShowEndPicker]   = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(
    new Set(activeBlocks.map((b) => b.id)),
  );
  const [mode,    setMode]    = useState<'reschedule' | 'skip'>('reschedule');
  const [saving,  setSaving]  = useState(false);

  // Reset state when modal opens with a new initialDate
  React.useEffect(() => {
    if (visible) {
      const s = initialDate ? parseISO(initialDate) : today;
      setBreakStart(s);
      setBreakEnd(addDays(s, 6));
      setSelectedIds(new Set(activeBlocks.map((b) => b.id)));
      setMode('reschedule');
    }
  }, [visible, initialDate]);

  function toggleBlock(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) { Alert.alert('Select at least one block'); return; }
    if (breakEnd < breakStart)  { Alert.alert('End date must be on or after start date'); return; }
    setSaving(true);
    try {
      await applyBreak(
        userId,
        Array.from(selectedIds),
        toLocalISO(breakStart),
        toLocalISO(breakEnd),
        mode,
      );
      onApplied();
    } catch (e: any) {
      Alert.alert('Could not apply break', e.message);
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const canConfirm = selectedIds.size > 0 && breakEnd >= breakStart && !saving;

  return (
    <VirraModal visible={visible} onClose={onClose} title="Schedule a Break">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>

        {/* DATE RANGE */}
        <VirraText variant="mono" size={9} color={colors.muted} style={brk.sectionLabel}>
          BREAK PERIOD
        </VirraText>

        <Pressable style={brk.dateRow} onPress={() => setShowStartPicker(true)}>
          <VirraText variant="mono" size={9} color={colors.muted}>FROM</VirraText>
          <View style={brk.dateRight}>
            <VirraText variant="mono" size={13} color={colors.breath}>{fmtDate(breakStart)}</VirraText>
            <SymbolView name="calendar" size={13} tintColor={colors.muted} />
          </View>
        </Pressable>
        {showStartPicker && (
          <DateTimePicker
            value={breakStart}
            mode="date"
            display="spinner"
            minimumDate={today}
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              setShowStartPicker(false);
              if (d) {
                setBreakStart(d);
                if (d > breakEnd) setBreakEnd(addDays(d, 6));
              }
            }}
          />
        )}

        <Pressable style={brk.dateRow} onPress={() => setShowEndPicker(true)}>
          <VirraText variant="mono" size={9} color={colors.muted}>TO</VirraText>
          <View style={brk.dateRight}>
            <VirraText variant="mono" size={13} color={colors.breath}>{fmtDate(breakEnd)}</VirraText>
            <SymbolView name="calendar" size={13} tintColor={colors.muted} />
          </View>
        </Pressable>
        {showEndPicker && (
          <DateTimePicker
            value={breakEnd}
            mode="date"
            display="spinner"
            minimumDate={breakStart}
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              setShowEndPicker(false);
              if (d) setBreakEnd(d);
            }}
          />
        )}

        {/* AFFECTS */}
        <VirraText variant="mono" size={9} color={colors.muted} style={[brk.sectionLabel, { marginTop: spacing.md }]}>
          AFFECTS
        </VirraText>
        {activeBlocks.map((b) => (
          <Pressable key={b.id} style={brk.blockRow} onPress={() => toggleBlock(b.id)}>
            <SymbolView
              name={selectedIds.has(b.id) ? 'checkmark.square.fill' : 'square'}
              size={16}
              tintColor={selectedIds.has(b.id) ? colors.pulse : colors.muted}
            />
            <SymbolView
              name={MODALITY_ICON[b.modality] ?? 'figure.walk'}
              size={14}
              tintColor={colors.muted}
            />
            <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1 }}>
              {b.template?.name ?? b.modality.charAt(0).toUpperCase() + b.modality.slice(1)}
              {!b.is_primary && (
                <VirraText variant="mono" size={9} color={colors.muted}>{' · Supp'}</VirraText>
              )}
            </VirraText>
          </Pressable>
        ))}

        {/* MODE */}
        <VirraText variant="mono" size={9} color={colors.muted} style={[brk.sectionLabel, { marginTop: spacing.md }]}>
          HOW TO HANDLE
        </VirraText>
        <View style={brk.modeRow}>
          <Pressable
            style={[brk.modePill, mode === 'reschedule' && brk.modePillActive]}
            onPress={() => setMode('reschedule')}
          >
            <VirraText variant="mono" size={9} color={mode === 'reschedule' ? colors.mile : colors.muted}>
              RESCHEDULE
            </VirraText>
          </Pressable>
          <Pressable
            style={[brk.modePill, mode === 'skip' && brk.modePillActive]}
            onPress={() => setMode('skip')}
          >
            <VirraText variant="mono" size={9} color={mode === 'skip' ? colors.mile : colors.muted}>
              SKIP
            </VirraText>
          </Pressable>
        </View>
        <VirraText variant="mono" size={9} color={colors.muted} style={{ marginTop: 4 }}>
          {mode === 'reschedule'
            ? 'Sessions slide forward · plan extends by the break length'
            : 'Sessions in break window are dropped · plan schedule unchanged'}
        </VirraText>

        <View style={{ height: spacing.md }} />
      </ScrollView>

      <VirraButton
        label={saving ? 'Applying…' : 'Confirm Break'}
        onPress={handleConfirm}
        disabled={!canConfirm}
      />
      <VirraButton label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.xs }} />
    </VirraModal>
  );
}

const brk = StyleSheet.create({
  sectionLabel: { letterSpacing: 1.5, marginBottom: spacing.xs },
  dateRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.mist, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs,
  },
  dateRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modePill: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.mist,
  },
  modePillActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/src/components/ui/BreakModal.tsx
git commit -m "feat: BreakModal — single-scroll break scheduling modal"
```

---

## Task 4: MonthCalendar Long-Press

**Files:**
- Modify: `mobile/src/components/ui/MonthCalendar.tsx`

The current `Props` interface is at line 17 and the day cell `<Pressable>` is at line 117.

- [ ] **Step 1: Add `onLongPress` to Props**

In `mobile/src/components/ui/MonthCalendar.tsx`, replace the Props interface:

```typescript
interface Props {
  userId:       string;
  year:         number;
  month:        number; // 1-based
  onDayPress?:  (date: string, sessions: CalendarSession[], events: UserEvent[]) => void;
  onLongPress?: (date: string) => void;
}
```

- [ ] **Step 2: Destructure `onLongPress` in the component**

Replace:
```typescript
export function MonthCalendar({ userId, year, month, onDayPress }: Props) {
```
With:
```typescript
export function MonthCalendar({ userId, year, month, onDayPress, onLongPress }: Props) {
```

- [ ] **Step 3: Add `onLongPress` to each day cell Pressable**

The current `<Pressable>` at line 117 has `onPress`. Add `onLongPress`:

```typescript
              <Pressable
                key={di}
                style={[cal.cell, isToday && cal.cellToday]}
                onPress={() => {
                  const hasSessions = sessions.length > 0;
                  const hasEvents   = (eventMap[iso] ?? []).length > 0;
                  if (hasSessions || hasEvents) onDayPress?.(iso, sessions, eventMap[iso] ?? []);
                }}
                onLongPress={() => onLongPress?.(iso)}
                delayLongPress={400}
                accessibilityRole={(sessions.length > 0 || (eventMap[iso] ?? []).length > 0) ? 'button' : 'none'}
              >
```

- [ ] **Step 4: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/src/components/ui/MonthCalendar.tsx
git commit -m "feat: MonthCalendar — add onLongPress prop for break scheduling"
```

---

## Task 5: Wire BreakModal into Training Tab

**Files:**
- Modify: `mobile/app/(app)/(tabs)/training.tsx`

- [ ] **Step 1: Add imports**

At the top of `training.tsx`, add after the existing imports:

```typescript
import { BreakModal } from '@/components/ui/BreakModal';
```

- [ ] **Step 2: Add state variables**

In `TrainingScreen()`, after the existing `const [actionDate, ...]` state line, add:

```typescript
const [breakModalVisible,   setBreakModalVisible]   = useState(false);
const [breakModalStartDate, setBreakModalStartDate] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Add `onLongPress` to MonthCalendar**

Find the `<MonthCalendar ... />` usage (around line 231) and add the `onLongPress` prop:

```typescript
                <MonthCalendar
                  userId={session.user.id}
                  year={calYear}
                  month={calMonth}
                  onDayPress={(date) => {
                    setActionDate(date);
                  }}
                  onLongPress={(date) => {
                    setBreakModalStartDate(date);
                    setBreakModalVisible(true);
                  }}
                />
```

- [ ] **Step 4: Render BreakModal**

After the existing `SessionDetailModal` block (after the closing `)}` at line ~250), add:

```tsx
            {session && (
              <BreakModal
                visible={breakModalVisible}
                userId={session.user.id}
                activeBlocks={activeBlocks}
                initialDate={breakModalStartDate}
                onClose={() => setBreakModalVisible(false)}
                onApplied={() => {
                  setBreakModalVisible(false);
                  loadData();
                }}
              />
            )}
```

- [ ] **Step 5: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
npx jest --no-coverage 2>&1 | tail -8
```
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/app/(app)/(tabs)/training.tsx
git commit -m "feat: wire BreakModal into Training tab via MonthCalendar long-press"
```

---

## Task 6: Profile TRAINING Card + Breaks History Screen

**Files:**
- Modify: `mobile/app/(app)/(tabs)/profile.tsx`
- Create: `mobile/app/(app)/breaks.tsx`
- Modify: `mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Add imports to `profile.tsx`**

At the top of `profile.tsx`, add after the existing imports:

```typescript
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { BreakModal } from '@/components/ui/BreakModal';
import { getActiveBlocks, type TrainingBlock } from '@/lib/trainingBlocks';
```

- [ ] **Step 2: Add state to `ProfileScreen`**

In `ProfileScreen()`, after the existing state declarations, add:

```typescript
const [lastBreak,         setLastBreak]         = useState<{ break_start: string; break_end: string } | null>(null);
const [showBreakModal,    setShowBreakModal]     = useState(false);
const [profileBlocks,     setProfileBlocks]      = useState<TrainingBlock[]>([]);

useFocusEffect(
  useCallback(() => {
    if (!session) return;
    supabase
      .from('training_breaks')
      .select('break_start, break_end')
      .eq('user_id', session.user.id)
      .order('break_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLastBreak(data ?? null));
    getActiveBlocks(session.user.id).then(setProfileBlocks);
  }, [session]),
);
```

- [ ] **Step 3: Add break summary helper**

After the existing `displayName` / `initials` / `showCycleDetails` lines, add:

```typescript
function fmtBreakRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${eStr}`;
  }
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${eStr}`;
}

const todayISO      = new Date().toLocaleDateString('en-CA');
const breakSummary  = lastBreak
  ? (lastBreak.break_start >= todayISO
    ? fmtBreakRange(lastBreak.break_start, lastBreak.break_end)
    : `Last: ${fmtBreakRange(lastBreak.break_start, lastBreak.break_end)}`)
  : 'None scheduled';
```

- [ ] **Step 4: Add TRAINING card to profile JSX**

In the profile JSX, find the CYCLE card (around line 219) and insert a new TRAINING card immediately after it (before the NOTIFICATIONS card):

```tsx
        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>TRAINING</VirraText>
          <Row
            label="BREAKS"
            value={breakSummary}
            onPress={() => router.push('/(app)/breaks' as any)}
          />
        </VirraCard>
```

- [ ] **Step 5: Render BreakModal in Profile**

At the very end of the `ScrollView` content (just before `</ScrollView>` or before the `SignOut` button), add:

```tsx
        {session && (
          <BreakModal
            visible={showBreakModal}
            userId={session.user.id}
            activeBlocks={profileBlocks}
            onClose={() => setShowBreakModal(false)}
            onApplied={() => {
              setShowBreakModal(false);
              // Reload break summary
              supabase
                .from('training_breaks')
                .select('break_start, break_end')
                .eq('user_id', session.user.id)
                .order('break_start', { ascending: false })
                .limit(1)
                .maybeSingle()
                .then(({ data }) => setLastBreak(data ?? null));
            }}
          />
        )}
```

- [ ] **Step 6: Create `breaks.tsx` history screen**

Create `mobile/app/(app)/breaks.tsx`:

```typescript
import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { getActiveBlocks, type TrainingBlock } from '@/lib/trainingBlocks';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { BreakModal } from '@/components/ui/BreakModal';

interface BreakRecord {
  id:          string;
  break_start: string;
  break_end:   string;
  mode:        'reschedule' | 'skip';
  block_ids:   string[];
  applied_at:  string;
}

function fmtBreakRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${eStr}`;
  }
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${eStr}`;
}

export default function BreaksScreen() {
  const { session }                                 = useAuthStore();
  const [breaks,       setBreaks]                   = useState<BreakRecord[]>([]);
  const [activeBlocks, setActiveBlocks]             = useState<TrainingBlock[]>([]);
  const [showModal,    setShowModal]                = useState(false);
  const todayISO = new Date().toLocaleDateString('en-CA');

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      load();
    }, [session]),
  );

  async function load() {
    if (!session) return;
    const [breaksRes, blocks] = await Promise.all([
      supabase
        .from('training_breaks')
        .select('id, break_start, break_end, mode, block_ids, applied_at')
        .eq('user_id', session.user.id)
        .order('break_start', { ascending: false }),
      getActiveBlocks(session.user.id),
    ]);
    setBreaks((breaksRes.data ?? []) as BreakRecord[]);
    setActiveBlocks(blocks);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={11} color={colors.breath} style={s.title}>BREAKS</VirraText>
        <Pressable onPress={() => setShowModal(true)} hitSlop={12}>
          <SymbolView name="plus" size={18} tintColor={colors.pulse} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {breaks.length === 0 ? (
          <VirraCard style={s.card}>
            <VirraText variant="body" size={13} color={colors.muted}>
              No breaks recorded. Long-press any day in your training calendar to schedule one.
            </VirraText>
          </VirraCard>
        ) : (
          <VirraCard style={s.card}>
            {breaks.map((b, i) => {
              const isUpcoming = b.break_start >= todayISO;
              return (
                <View key={b.id}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.breakRow}>
                    <View style={{ flex: 1 }}>
                      <VirraText variant="body" size={14} color={colors.breath}>
                        {fmtBreakRange(b.break_start, b.break_end)}
                      </VirraText>
                      <View style={s.badges}>
                        <View style={s.badge}>
                          <VirraText variant="mono" size={8} color={colors.muted}>
                            {b.mode === 'reschedule' ? 'RESCHEDULED' : 'SKIPPED'}
                          </VirraText>
                        </View>
                        <VirraText variant="mono" size={8} color={colors.muted}>
                          {b.block_ids.length} block{b.block_ids.length !== 1 ? 's' : ''}
                        </VirraText>
                      </View>
                    </View>
                    <SymbolView
                      name={isUpcoming ? 'clock' : 'checkmark.circle'}
                      size={14}
                      tintColor={isUpcoming ? colors.muted : colors.pulse}
                    />
                  </View>
                </View>
              );
            })}
          </VirraCard>
        )}
      </ScrollView>

      {session && (
        <BreakModal
          visible={showModal}
          userId={session.user.id}
          activeBlocks={activeBlocks}
          onClose={() => setShowModal(false)}
          onApplied={() => { setShowModal(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: colors.mile },
  header:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 52,
  },
  title:    { letterSpacing: 1.5 },
  scroll:   { padding: spacing.lg, gap: spacing.md },
  card:     { gap: spacing.xs },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  badges:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  badge:    {
    paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  divider:  { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
});
```

- [ ] **Step 7: Register `breaks` route in `_layout.tsx`**

In `mobile/app/(app)/_layout.tsx`, add to the `<Stack>` after the `subscription` screen:

```typescript
      <Stack.Screen name="breaks" options={{ presentation: 'card' }} />
```

- [ ] **Step 8: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/pauldickenson/Claude/virra
git add mobile/app/(app)/(tabs)/profile.tsx mobile/app/(app)/breaks.tsx mobile/app/(app)/_layout.tsx
git commit -m "feat: profile TRAINING card, break history screen, and breaks route"
```

---

## Verification (end-to-end)

1. Start a plan from the plan detail screen so you have an active block with planned sessions
2. Go to Training tab → monthly calendar → long-press any future date → BreakModal opens with that date pre-filled
3. Pick an end date 7 days later, leave all blocks checked, mode = RESCHEDULE → Confirm Break
4. Calendar reloads: sessions in the break window disappear (dropped); sessions after the break window shift forward by 7 days
5. Query `training_breaks` in Supabase — one row with correct user_id, break_start, break_end, mode, block_ids
6. Go to Profile → TRAINING section → BREAKS row shows "May 11–17" (the break you just scheduled)
7. Tap the row → navigates to `breaks.tsx` → shows the break with RESCHEDULED badge + clock icon
8. Tap `+` in breaks.tsx header → BreakModal opens (no pre-filled date)
9. Test SKIP mode: sessions in window dropped; sessions after window unchanged; `block.ends_on` not extended

---

## Self-Review

**Spec coverage:**
- ✅ `training_breaks` table (Task 1)
- ✅ `computeBreakDays` pure function — testable (Task 2)
- ✅ `applyBreak` — drop in window, shift after window (reschedule), extend `ends_on` (Task 2)
- ✅ `BreakModal` single-scroll: date range, block selector, mode toggle, confirm (Task 3)
- ✅ MonthCalendar `onLongPress` with 400ms delay (Task 4)
- ✅ Training tab long-press wires into BreakModal (Task 5)
- ✅ Profile TRAINING card with break summary row (Task 6)
- ✅ `breaks.tsx` history screen with empty state + break list (Task 6)
- ✅ `breaks` route registered in `_layout.tsx` (Task 6)
- ✅ Latest-first session ordering in `applyBreak` to avoid unique constraint conflicts

**Placeholder scan:** None.

**Type consistency:**
- `BreakMutations` exported from `scheduleGenerator.ts`, imported in tests ✅
- `applyBreak` takes `blockIds: string[]` — `BreakModal` passes `Array.from(selectedIds)` ✅
- `TrainingBlock` imported consistently from `@/lib/trainingBlocks` in all consumers ✅
- `BreakRecord.mode: 'reschedule' | 'skip'` matches `applyBreak` mode parameter ✅
