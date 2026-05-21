# This Week's Training Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Dashboard's `WeekStrip` widget so completed sessions render as filled circles, missed sessions render as a thin grey bar, multi-session days split into two half-circles, tap routes to the Training tab, and the empty-state surfaces a "pick a plan" prompt.

**Architecture:** Pull the per-day rendering decision into a pure function (`dayState.ts`) with unit tests, then split presentation into `DayCell` and `EmptyWeekStrip`. `WeekStrip` becomes a thin orchestrator (data fetch + Pressable + 7 cells). All visual states drive off a single `DayState` discriminated union — no branching JSX in the orchestrator.

**Tech Stack:** React Native (Expo), TypeScript, Jest (jest-expo preset), Supabase JS client, expo-symbols, expo-router.

**Spec:** `docs/superpowers/specs/2026-05-21-week-training-widget-design.md`

---

## File Structure

- **Create** `mobile/src/lib/dayState.ts` — pure `deriveDayState()` function + types
- **Create** `mobile/__tests__/lib/dayState.test.ts` — unit tests for derivation rules
- **Create** `mobile/src/components/ui/DayCell.tsx` — pure renderer for one day
- **Create** `mobile/src/components/ui/EmptyWeekStrip.tsx` — 7 rest cells + caption
- **Modify** `mobile/src/components/ui/WeekStrip.tsx` — drop inline JSX branching, add Pressable + empty-state check, use `DayCell`

No changes to `app/(app)/(tabs)/index.tsx` — `<WeekStrip>` already mounts there.

---

## Task 1: Pure `dayState.ts` module + tests

**Files:**
- Create: `mobile/src/lib/dayState.ts`
- Test:   `mobile/__tests__/lib/dayState.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/lib/dayState.test.ts`:

```ts
import { deriveDayState, type SessionForDay } from '@/lib/dayState';

const planned  = (modality: SessionForDay['modality']): SessionForDay =>
  ({ status: 'planned',   modality });
const done     = (modality: SessionForDay['modality']): SessionForDay =>
  ({ status: 'completed', modality });

describe('deriveDayState', () => {
  test('zero sessions → rest', () => {
    expect(deriveDayState([], false)).toEqual({ kind: 'rest' });
    expect(deriveDayState([], true)).toEqual({ kind: 'rest' });
  });

  test('1 completed (past)   → completed', () => {
    expect(deriveDayState([done('run')], true))
      .toEqual({ kind: 'completed', modality: 'run' });
  });

  test('1 completed (today)  → completed', () => {
    expect(deriveDayState([done('strength')], false))
      .toEqual({ kind: 'completed', modality: 'strength' });
  });

  test('1 planned future     → planned', () => {
    expect(deriveDayState([planned('run')], false))
      .toEqual({ kind: 'planned', modality: 'run' });
  });

  test('1 planned today      → planned (not missed)', () => {
    expect(deriveDayState([planned('run')], false))
      .toEqual({ kind: 'planned', modality: 'run' });
  });

  test('1 planned past       → missed', () => {
    expect(deriveDayState([planned('run')], true))
      .toEqual({ kind: 'missed' });
  });

  test('2 completed past     → completed_multi (priority order)', () => {
    expect(deriveDayState([done('strength'), done('run')], true))
      .toEqual({ kind: 'completed_multi', a: 'run', b: 'strength' });
  });

  test('2 planned future     → planned_multi (priority order)', () => {
    expect(deriveDayState([planned('yoga'), planned('strength')], false))
      .toEqual({ kind: 'planned_multi', a: 'strength', b: 'yoga' });
  });

  test('2 planned past, none done → missed', () => {
    expect(deriveDayState([planned('run'), planned('strength')], true))
      .toEqual({ kind: 'missed' });
  });

  test('2 past, 1 done + 1 missed → mixed (completed modality)', () => {
    expect(deriveDayState([done('strength'), planned('run')], true))
      .toEqual({ kind: 'mixed', completed: 'strength' });
  });

  test('mixed picks top completed by priority when >1 done', () => {
    expect(deriveDayState([done('strength'), done('swim'), planned('yoga')], true))
      .toEqual({ kind: 'mixed', completed: 'strength' });
  });

  test('3 planned future → planned_multi using top 2 by priority', () => {
    expect(deriveDayState(
      [planned('swim'), planned('run'), planned('yoga')], false))
      .toEqual({ kind: 'planned_multi', a: 'run', b: 'swim' });
  });

  test('priority is stable regardless of insertion order', () => {
    expect(deriveDayState([planned('other'), planned('run')], false))
      .toEqual({ kind: 'planned_multi', a: 'run', b: 'other' });
  });

  test('3 sessions, top 2 done + 3rd missed → mixed (full-list rule)', () => {
    expect(deriveDayState(
      [done('run'), done('strength'), planned('yoga')], true))
      .toEqual({ kind: 'mixed', completed: 'run' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd mobile && npx jest __tests__/lib/dayState.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/dayState'".

- [ ] **Step 3: Implement `dayState.ts`**

Create `mobile/src/lib/dayState.ts`:

```ts
export type Modality = 'run' | 'strength' | 'swim' | 'yoga' | 'other';

export interface SessionForDay {
  status:   'planned' | 'completed' | 'dropped' | 'moved' | string;
  modality: Modality | string;
}

export type DayState =
  | { kind: 'rest' }
  | { kind: 'planned',         modality: Modality }
  | { kind: 'planned_multi',   a: Modality, b: Modality }
  | { kind: 'completed',       modality: Modality }
  | { kind: 'completed_multi', a: Modality, b: Modality }
  | { kind: 'missed' }
  | { kind: 'mixed',           completed: Modality };

const PRIORITY: Modality[] = ['run', 'strength', 'swim', 'yoga', 'other'];

function priorityOf(m: string): number {
  const i = PRIORITY.indexOf(m as Modality);
  return i === -1 ? PRIORITY.length : i;
}

function asModality(m: string): Modality {
  return (PRIORITY as readonly string[]).includes(m) ? (m as Modality) : 'other';
}

function sortedByPriority(list: SessionForDay[]): SessionForDay[] {
  return [...list].sort((x, y) => priorityOf(x.modality) - priorityOf(y.modality));
}

export function deriveDayState(sessions: SessionForDay[], isPast: boolean): DayState {
  const total = sessions.length;
  if (total === 0) return { kind: 'rest' };

  const doneList   = sessions.filter((s) => s.status === 'completed');
  const undoneList = sessions.filter((s) => s.status !== 'completed');
  const done       = doneList.length;

  // All completed
  if (done === total) {
    const sorted = sortedByPriority(sessions);
    if (total === 1) return { kind: 'completed', modality: asModality(sorted[0].modality) };
    return {
      kind: 'completed_multi',
      a: asModality(sorted[0].modality),
      b: asModality(sorted[1].modality),
    };
  }

  // None completed
  if (done === 0) {
    if (isPast) return { kind: 'missed' };
    const sorted = sortedByPriority(sessions);
    if (total === 1) return { kind: 'planned', modality: asModality(sorted[0].modality) };
    return {
      kind: 'planned_multi',
      a: asModality(sorted[0].modality),
      b: asModality(sorted[1].modality),
    };
  }

  // Partial: 0 < done < total
  const topCompleted = sortedByPriority(doneList)[0];
  return { kind: 'mixed', completed: asModality(topCompleted.modality) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd mobile && npx jest __tests__/lib/dayState.test.ts
```

Expected: PASS — all 14 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/dayState.ts mobile/__tests__/lib/dayState.test.ts
git commit -m "feat(week-strip): pure deriveDayState() with rules + tests"
```

---

## Task 2: `DayCell` component

**Files:**
- Create: `mobile/src/components/ui/DayCell.tsx`

- [ ] **Step 1: Implement `DayCell.tsx`**

Create `mobile/src/components/ui/DayCell.tsx`:

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors } from '@/constants/theme';
import { VirraText } from './VirraText';
import type { DayState, Modality } from '@/lib/dayState';

const MODALITY_ICON: Record<Modality, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.mixed.cardio',
};

const MODALITY_COLOR: Record<Modality, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

interface DayCellProps {
  state:     DayState;
  isToday:   boolean;
  dayLetter: string;
  belowSlot?: React.ReactNode;
}

export function DayCell({ state, isToday, dayLetter, belowSlot }: DayCellProps) {
  return (
    <View style={cell.col}>
      <VirraText
        variant="mono"
        size={10}
        color={isToday ? colors.breath : colors.muted}
      >
        {dayLetter}
      </VirraText>
      <View style={cell.slot}>{renderInner(state)}</View>
      {belowSlot}
    </View>
  );
}

function renderInner(state: DayState): React.ReactNode {
  switch (state.kind) {
    case 'rest':
      return null;

    case 'planned': {
      const color = MODALITY_COLOR[state.modality];
      return (
        <View style={[cell.circle, { borderColor: colors.border }]}>
          <SymbolView name={MODALITY_ICON[state.modality]} size={12} tintColor={color} />
        </View>
      );
    }

    case 'completed':
      return (
        <View style={[cell.circle, {
          backgroundColor: MODALITY_COLOR[state.modality],
          borderColor:     MODALITY_COLOR[state.modality],
        }]} />
      );

    case 'planned_multi':
      return (
        <View style={cell.circle}>
          <View style={[cell.half, cell.halfLeft,  { backgroundColor: MODALITY_COLOR[state.a] }]} />
          <View style={[cell.half, cell.halfRight, { backgroundColor: MODALITY_COLOR[state.b] }]} />
        </View>
      );

    case 'completed_multi':
      return (
        <View style={cell.circle}>
          <View style={[cell.half, cell.halfLeft,  { backgroundColor: MODALITY_COLOR[state.a] }]} />
          <View style={[cell.half, cell.halfRight, { backgroundColor: MODALITY_COLOR[state.b] }]} />
        </View>
      );

    case 'missed':
      return (
        <View style={[cell.circle, { borderColor: colors.border }]}>
          <View style={cell.missedBar} />
        </View>
      );

    case 'mixed':
      return (
        <View style={cell.circle}>
          <View style={[cell.half, cell.halfLeft,  { backgroundColor: MODALITY_COLOR[state.completed] }]} />
          <View style={[cell.half, cell.halfRight, cell.halfBordered]}>
            <View style={cell.missedBar} />
          </View>
        </View>
      );
  }
}

const CIRCLE = 32;

const cell = StyleSheet.create({
  col:  { alignItems: 'center', gap: 4, flex: 1 },
  slot: { width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexDirection: 'row',
  },
  half: {
    width: CIRCLE / 2, height: CIRCLE,
    alignItems: 'center', justifyContent: 'center',
  },
  halfLeft:  {
    borderTopLeftRadius: CIRCLE / 2, borderBottomLeftRadius: CIRCLE / 2,
  },
  halfRight: {
    borderTopRightRadius: CIRCLE / 2, borderBottomRightRadius: CIRCLE / 2,
  },
  halfBordered: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent',
  },
  missedBar: {
    width: 10, height: 2, borderRadius: 1, backgroundColor: colors.muted,
  },
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```

Expected: PASS (no new errors from this file).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/DayCell.tsx
git commit -m "feat(week-strip): DayCell renders the seven visual states"
```

---

## Task 3: `EmptyWeekStrip` component

**Files:**
- Create: `mobile/src/components/ui/EmptyWeekStrip.tsx`

- [ ] **Step 1: Implement `EmptyWeekStrip.tsx`**

Create `mobile/src/components/ui/EmptyWeekStrip.tsx`:

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { DayCell } from './DayCell';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface EmptyWeekStripProps {
  todayIndex: number; // 0..6 for Mon..Sun
}

export function EmptyWeekStrip({ todayIndex }: EmptyWeekStripProps) {
  return (
    <View>
      <View style={empty.row}>
        {DAY_LABELS.map((letter, i) => (
          <DayCell
            key={i}
            state={{ kind: 'rest' }}
            isToday={i === todayIndex}
            dayLetter={letter}
          />
        ))}
      </View>
      <VirraText variant="body" size={11} color={colors.muted} style={empty.caption}>
        No active plan — tap to pick one
      </VirraText>
    </View>
  );
}

const empty = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  caption: { textAlign: 'center', marginTop: spacing.xs },
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```

Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/EmptyWeekStrip.tsx
git commit -m "feat(week-strip): empty state with 7 rest cells + caption"
```

---

## Task 4: Refactor `WeekStrip.tsx`

**Files:**
- Modify: `mobile/src/components/ui/WeekStrip.tsx`

- [ ] **Step 1: Rewrite `WeekStrip.tsx`**

Replace the entire contents of `mobile/src/components/ui/WeekStrip.tsx` with:

```tsx
import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { DayCell } from './DayCell';
import { EmptyWeekStrip } from './EmptyWeekStrip';
import { deriveDayState, type DayState, type SessionForDay } from '@/lib/dayState';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface FetchedSession extends SessionForDay {
  id:             string;
  scheduled_date: string;
}

function localDateISO(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function getMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return localDateISO(monday);
}

function offsetISO(base: string, n: number): string {
  const [y, m, d] = base.split('-').map(Number);
  return localDateISO(new Date(y, m - 1, d + n));
}

function todayIndexMonZero(): number {
  // Date.getDay(): 0=Sun..6=Sat → convert to Mon=0..Sun=6
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export function WeekStrip({ userId, phase }: { userId: string; phase?: CyclePhase | null }) {
  const [states,    setStates]    = useState<DayState[]>(() => Array(7).fill({ kind: 'rest' }));
  const [hasPlan,   setHasPlan]   = useState<boolean>(true); // optimistic
  const [todayLoad, setTodayLoad] = useState<TrainingLoad | null>(null);

  useFocusEffect(useCallback(() => { load(); }, [userId, phase]));

  async function load() {
    const monday   = getMondayISO();
    const sunday   = offsetISO(monday, 6);
    const todayISO = localDateISO(new Date());

    const [{ data: sessions }, { data: blocks }] = await Promise.all([
      supabase
        .from('planned_sessions')
        .select('id, scheduled_date, modality, status')
        .eq('user_id', userId)
        .gte('scheduled_date', monday)
        .lte('scheduled_date', sunday)
        .in('status', ['planned', 'completed'])
        .order('scheduled_date'),
      supabase
        .from('training_blocks')
        .select('id')
        .eq('user_id', userId)
        .lte('starts_on', todayISO)
        .gte('ends_on',   todayISO)
        .limit(1),
    ]);

    const sessionsByDay: Record<string, FetchedSession[]> = {};
    for (let i = 0; i < 7; i++) sessionsByDay[offsetISO(monday, i)] = [];
    for (const s of (sessions ?? [])) {
      sessionsByDay[s.scheduled_date]?.push(s as FetchedSession);
    }

    const nextStates: DayState[] = [];
    for (let i = 0; i < 7; i++) {
      const iso       = offsetISO(monday, i);
      const isPast    = iso < todayISO;
      nextStates.push(deriveDayState(sessionsByDay[iso], isPast));
    }
    setStates(nextStates);
    setHasPlan((blocks ?? []).length > 0);

    try {
      const ctx = await getDailyTrainingContext(userId, todayISO, phase ?? null);
      setTodayLoad(ctx.inferred_load);
    } catch {
      // Non-critical — load label omitted on error
    }
  }

  const tIndex = todayIndexMonZero();

  function openTraining() {
    router.push('/(app)/(tabs)/training' as any);
  }

  if (!hasPlan) {
    return (
      <Pressable
        onPress={openTraining}
        accessibilityRole="button"
        accessibilityLabel="This week's training — open Training tab"
      >
        <EmptyWeekStrip todayIndex={tIndex} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={openTraining}
      accessibilityRole="button"
      accessibilityLabel="This week's training — open Training tab"
    >
      <View style={strip.row}>
        {states.map((s, i) => (
          <DayCell
            key={i}
            state={s}
            isToday={i === tIndex}
            dayLetter={DAY_LABELS[i]}
            belowSlot={i === tIndex && todayLoad ? (
              <VirraText variant="mono" size={10} color={colors.muted}>
                {todayLoad === 'moderate' ? 'MOD' : todayLoad.toUpperCase()}
              </VirraText>
            ) : undefined}
          />
        ))}
      </View>
    </Pressable>
  );
}

const strip = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```

Expected: PASS (no new errors).

- [ ] **Step 3: Re-run dayState tests to confirm no regression**

Run:
```bash
cd mobile && npx jest __tests__/lib/dayState.test.ts
```

Expected: PASS — all 14 tests still green.

- [ ] **Step 4: Visual QA on device**

Start the app and confirm on the Dashboard:

```bash
cd mobile && npx expo start
```

Check:
- [ ] Past days with completed sessions render as filled circles in modality colour, no check icon.
- [ ] Past days with no completions render as bordered circle with a thin grey bar centred.
- [ ] Today (if planned, not yet done) renders as bordered circle with modality icon. Today's day letter is breath colour. Today's load tier label shows beneath the column.
- [ ] Future planned days render as bordered circle with modality icon.
- [ ] Rest days render as empty cells (no circle).
- [ ] Days with 2 sessions render as two half-circles in their respective modality colours.
- [ ] Tapping anywhere on the THIS WEEK card navigates to the Training tab.
- [ ] If you have no active training block (test by temporarily ending your active block in Supabase, then revert), the widget shows 7 empty cells + "No active plan — tap to pick one" caption.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeekStrip.tsx
git commit -m "feat(week-strip): tap-through to Training tab, new visual states, empty state"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full test suite**

Run:
```bash
cd mobile && npx jest
```

Expected: PASS — no regressions in other test files.

- [ ] **Step 2: Confirm git log shows four feat commits**

Run:
```bash
git log --oneline -6
```

Expected: Four commits in this order (top = newest):
1. `feat(week-strip): tap-through to Training tab, new visual states, empty state`
2. `feat(week-strip): empty state with 7 rest cells + caption`
3. `feat(week-strip): DayCell renders the seven visual states`
4. `feat(week-strip): pure deriveDayState() with rules + tests`

- [ ] **Step 3: Report completion**

State: "Implementation complete. WeekStrip now renders filled completed circles, slim-bar missed days, half-circle multi-session days, and routes to the Training tab on tap. Empty state surfaces when no active `training_blocks` row covers today. All `dayState` rules covered by 14 passing unit tests; full Jest suite still green."
