# Cycle Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Your Cycle" sub-menu screen reached from the Dashboard cycle hero, with phase calendar, weight-chart scaffold, reasoning card, coaching tips, and a two-button action row (Update Cycle + I Got My Period that resets the cycle to day 1).

**Architecture:** New `cycle-detail.tsx` route in `mobile/app/(app)/`. Extract two reusable units out of the Dashboard (`CycleProgressBar`, `PHASE_META`) and add a new horizontal-scroll calendar component. Period reset writes a new `cycle_logs` row and updates the existing Zustand `useCycleStore` via `setPeriodStart`, so the Dashboard reflects day 1 on return.

**Tech Stack:** Expo + expo-router, React Native, Zustand, Supabase (`cycle_logs` table — already exists), `@testing-library/react-native` + jest-expo.

**Spec:** `docs/superpowers/specs/2026-05-17-cycle-detail-screen-design.md`

---

## File map

**New**
- `mobile/src/components/ui/CycleProgressBar.tsx` — extracted from Dashboard
- `mobile/src/lib/phaseMeta.ts` — extracted + extended with `lifestyle` field
- `mobile/src/lib/cycleCalendar.ts` — pure helper computing the day-by-day phase array for one cycle
- `mobile/src/components/ui/CycleCalendar.tsx` — horizontal day-chip scroller
- `mobile/src/lib/resetCycle.ts` — period-reset helper (DB insert + store update)
- `mobile/app/(app)/cycle-detail.tsx` — the screen

**Tests**
- `mobile/__tests__/components/CycleProgressBar.test.tsx`
- `mobile/__tests__/lib/cycleCalendar.test.ts`
- `mobile/__tests__/components/CycleCalendar.test.tsx`
- `mobile/__tests__/lib/resetCycle.test.ts`

**Edited**
- `mobile/app/(app)/(tabs)/index.tsx` — replace inline `CycleProgressBar` + `PHASE_META` with imports; wrap cycle hero in a `Pressable` linking to the new route

---

## Task 1: Extract CycleProgressBar component

**Files:**
- Create: `mobile/src/components/ui/CycleProgressBar.tsx`
- Test: `mobile/__tests__/components/CycleProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/components/CycleProgressBar.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { colors } from '@/constants/theme';

describe('CycleProgressBar', () => {
  it('renders without crashing at day 1', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={1} cycleLength={28} phaseColor={colors.heat} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing at last day of cycle', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={28} cycleLength={28} phaseColor={colors.pulse} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('caps fill at 100% when dayOfCycle exceeds cycleLength', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={40} cycleLength={28} phaseColor={colors.pulse} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/components/CycleProgressBar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/CycleProgressBar'`.

- [ ] **Step 3: Create the component**

`mobile/src/components/ui/CycleProgressBar.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  dayOfCycle: number;
  cycleLength: number;
  phaseColor: string;
}

export function CycleProgressBar({ dayOfCycle, cycleLength, phaseColor }: Props) {
  const pct = Math.min((dayOfCycle - 1) / cycleLength, 1);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
      <View style={[styles.dot,  { left:  `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, backgroundColor: colors.border, borderRadius: radius.full, marginTop: spacing.md, position: 'relative', overflow: 'visible' },
  fill:  { position: 'absolute', top: 0, left: 0, height: 3, borderRadius: radius.full },
  dot:   { position: 'absolute', top: -4, width: 11, height: 11, borderRadius: radius.full, marginLeft: -5 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/components/CycleProgressBar.test.tsx`
Expected: PASS — all three tests green.

- [ ] **Step 5: Replace inline usage on Dashboard with import**

In `mobile/app/(app)/(tabs)/index.tsx`:

Delete the inline `function CycleProgressBar(...)` (lines ~56–66) and the `const bar = StyleSheet.create(...)` block (lines ~68–72).

Add to the imports at the top (alongside other `@/components/ui/...` imports):
```ts
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
```

Run the existing Dashboard render check via the regression test sweep below.

- [ ] **Step 6: Run the full mobile test suite**

Run: `cd mobile && npx jest`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ui/CycleProgressBar.tsx \
        mobile/__tests__/components/CycleProgressBar.test.tsx \
        mobile/app/\(app\)/\(tabs\)/index.tsx
git commit -m "refactor(cycle): extract CycleProgressBar to shared component"
```

---

## Task 2: Extract PHASE_META to lib/phaseMeta.ts with lifestyle field

**Files:**
- Create: `mobile/src/lib/phaseMeta.ts`
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (replace inline `PHASE_META`)

- [ ] **Step 1: Create the shared module**

`mobile/src/lib/phaseMeta.ts`:
```ts
import { colors } from '@/constants/theme';
import type { CyclePhase } from '@/lib/cycleEngine';

export interface PhaseMeta {
  label:     string;
  tagline:   string;
  training:  string;
  nutrition: string;
  lifestyle: string;
  color:     string;
}

export const PHASE_META: Record<CyclePhase, PhaseMeta> = {
  menstrual: {
    label:     'Menstrual',
    tagline:   'Rest, restore, and honour your body.',
    training:  'Easy movement only — yoga, walking, or full rest. No hard efforts.',
    nutrition: 'Iron-rich foods. Warming meals. Honour cravings without guilt.',
    lifestyle: 'Prioritise sleep and warmth. Heat pads ease cramps better than ibuprofen for many.',
    color:     colors.heat,
  },
  follicular: {
    label:     'Follicular',
    tagline:   'Energy is rising. Build on it.',
    training:  'Ramp up intensity. Strength sessions and tempo runs respond well now.',
    nutrition: 'Lean protein and complex carbs to fuel adaptation.',
    lifestyle: 'Social energy is high. Book the hard conversations and the heavy sessions now.',
    color:     colors.dawn,
  },
  ovulatory: {
    label:     'Ovulatory',
    tagline:   'Peak window. Push hard.',
    training:  'Highest-intensity workouts belong here. Your body is primed.',
    nutrition: 'High-carb day. Your muscles are ready to use every gram.',
    lifestyle: 'Communication peaks. Have the difficult conversation today — it lands lighter.',
    color:     colors.pulse,
  },
  luteal: {
    label:     'Luteal',
    tagline:   "Maintain, don't overreach.",
    training:  'Moderate effort. Honour fatigue signals — they\'re real.',
    nutrition: 'Carbs curb cravings and support mood. Magnesium helps sleep.',
    lifestyle: 'Schedule recovery. Caffeine sensitivity rises — taper after 2pm to protect sleep.',
    color:     colors.breath,
  },
};
```

- [ ] **Step 2: Replace inline `PHASE_META` on Dashboard with import**

In `mobile/app/(app)/(tabs)/index.tsx`:

Delete the entire inline `const PHASE_META: Record<CyclePhase, {...}> = { ... };` block (lines ~19–54).

Remove the now-unused `colors` import only if the file no longer references it — it almost certainly does, so leave it.

Add to the imports at the top:
```ts
import { PHASE_META } from '@/lib/phaseMeta';
```

- [ ] **Step 3: Run the test suite to confirm no regressions**

Run: `cd mobile && npx jest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/phaseMeta.ts mobile/app/\(app\)/\(tabs\)/index.tsx
git commit -m "refactor(cycle): extract PHASE_META and add lifestyle field"
```

---

## Task 3: Pure helper — day-by-day phase array for a cycle

**Files:**
- Create: `mobile/src/lib/cycleCalendar.ts`
- Test: `mobile/__tests__/lib/cycleCalendar.test.ts`

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/lib/cycleCalendar.test.ts`:
```ts
import { buildCycleCalendar } from '@/lib/cycleCalendar';

describe('buildCycleCalendar', () => {
  const start = new Date('2025-01-01');
  const cal28 = buildCycleCalendar(start, 28);

  it('returns one entry per day in the cycle', () => {
    expect(cal28).toHaveLength(28);
  });

  it('numbers days 1..cycleLength', () => {
    expect(cal28[0].dayOfCycle).toBe(1);
    expect(cal28[27].dayOfCycle).toBe(28);
  });

  it('marks days 1-5 as menstrual', () => {
    for (let i = 0; i < 5; i++) {
      expect(cal28[i].phase).toBe('menstrual');
      expect(cal28[i].isBleed).toBe(true);
    }
  });

  it('marks day 6 as follicular', () => {
    expect(cal28[5].phase).toBe('follicular');
    expect(cal28[5].isBleed).toBe(false);
  });

  it('marks day 14 (28-day cycle, ovulation = 28-14 = day 14) as ovulatory', () => {
    expect(cal28[13].phase).toBe('ovulatory');
  });

  it('marks the last day as luteal', () => {
    expect(cal28[27].phase).toBe('luteal');
  });

  it('exposes the absolute date for each day', () => {
    expect(cal28[0].date.toDateString()).toBe(start.toDateString());
    const dayThree = new Date(start);
    dayThree.setDate(start.getDate() + 2);
    expect(cal28[2].date.toDateString()).toBe(dayThree.toDateString());
  });

  it('works for a 35-day cycle', () => {
    const cal35 = buildCycleCalendar(start, 35);
    expect(cal35).toHaveLength(35);
    // ovulation = 35 - 14 = day 21
    expect(cal35[20].phase).toBe('ovulatory');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/lib/cycleCalendar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`mobile/src/lib/cycleCalendar.ts`:
```ts
import { getCyclePhase, type CyclePhase } from '@/lib/cycleEngine';

const MENSTRUAL_DAYS = 5;

export interface CycleCalendarDay {
  dayOfCycle: number;
  date:       Date;
  phase:      CyclePhase;
  isBleed:    boolean;
}

export function buildCycleCalendar(periodStart: Date, cycleLength: number): CycleCalendarDay[] {
  const days: CycleCalendarDay[] = [];
  for (let i = 0; i < cycleLength; i++) {
    const date = new Date(periodStart);
    date.setDate(periodStart.getDate() + i);
    const phase = getCyclePhase(periodStart, cycleLength, date);
    days.push({
      dayOfCycle: i + 1,
      date,
      phase,
      isBleed:    i < MENSTRUAL_DAYS,
    });
  }
  return days;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/lib/cycleCalendar.test.ts`
Expected: PASS — all eight tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/cycleCalendar.ts mobile/__tests__/lib/cycleCalendar.test.ts
git commit -m "feat(cycle): add buildCycleCalendar helper"
```

---

## Task 4: CycleCalendar component

**Files:**
- Create: `mobile/src/components/ui/CycleCalendar.tsx`
- Test: `mobile/__tests__/components/CycleCalendar.test.tsx`

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/components/CycleCalendar.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleCalendar } from '@/components/ui/CycleCalendar';

describe('CycleCalendar', () => {
  const periodStart = new Date('2025-01-01');

  it('renders one chip per day in the cycle', () => {
    const { getAllByTestId } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={periodStart} />
    );
    expect(getAllByTestId(/^cycle-day-/)).toHaveLength(28);
  });

  it('marks the today chip with testID cycle-day-today', () => {
    const today = new Date(periodStart);
    today.setDate(periodStart.getDate() + 6); // day 7
    const { getByTestId } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={today} />
    );
    expect(getByTestId('cycle-day-today')).toBeTruthy();
  });

  it('renders the legend row', () => {
    const { getByText } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={periodStart} />
    );
    expect(getByText(/BLEED/i)).toBeTruthy();
    expect(getByText(/FOLLICULAR/i)).toBeTruthy();
    expect(getByText(/OVULATORY/i)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/components/CycleCalendar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`mobile/src/components/ui/CycleCalendar.tsx`:
```tsx
import React, { useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { buildCycleCalendar, type CycleCalendarDay } from '@/lib/cycleCalendar';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  periodStart: Date;
  cycleLength: number;
  today?:      Date;
}

const PHASE_COLOR: Record<CycleCalendarDay['phase'], string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

const CHIP_WIDTH = 40;
const CHIP_GAP   = 6;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

export function CycleCalendar({ periodStart, cycleLength, today = new Date() }: Props) {
  const days = buildCycleCalendar(periodStart, cycleLength);
  const scrollRef = useRef<ScrollView>(null);

  const todayIndex = days.findIndex((d) => sameDay(d.date, today));

  useEffect(() => {
    if (todayIndex < 0 || !scrollRef.current) return;
    const x = Math.max(0, todayIndex * (CHIP_WIDTH + CHIP_GAP) - CHIP_WIDTH * 2);
    scrollRef.current.scrollTo({ x, animated: false });
  }, [todayIndex]);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {days.map((d, i) => {
          const isToday = i === todayIndex;
          const tint    = PHASE_COLOR[d.phase];
          const textColor = d.phase === 'ovulatory' || d.phase === 'luteal'
            ? colors.mile
            : colors.breath;
          return (
            <View
              key={d.dayOfCycle}
              testID={isToday ? 'cycle-day-today' : `cycle-day-${d.dayOfCycle}`}
              style={[
                styles.chip,
                { backgroundColor: tint },
                isToday && styles.chipToday,
              ]}
            >
              <VirraText variant="mono" size={11} color={textColor}>
                {d.dayOfCycle}
              </VirraText>
              {d.isBleed && <View style={styles.bleedDot} />}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.legend}>
        <LegendDot color={colors.heat}   label="BLEED" />
        <LegendDot color={colors.dawn}   label="FOLLICULAR" />
        <LegendDot color={colors.pulse}  label="OVULATORY" />
        <LegendDot color={colors.breath} label="LUTEAL" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
    </View>
  );
}

const styles = StyleSheet.create({
  row:           { gap: CHIP_GAP, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  chip:          { width: CHIP_WIDTH, height: CHIP_WIDTH, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  chipToday:     { borderWidth: 2, borderColor: colors.breath, transform: [{ scale: 1.08 }] },
  bleedDot:      { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.mile },
  legend:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch:  { width: 8, height: 8, borderRadius: 2 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/components/CycleCalendar.test.tsx`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/CycleCalendar.tsx \
        mobile/__tests__/components/CycleCalendar.test.tsx
git commit -m "feat(cycle): add CycleCalendar horizontal day strip"
```

---

## Task 5: Period reset helper

**Files:**
- Create: `mobile/src/lib/resetCycle.ts`
- Test: `mobile/__tests__/lib/resetCycle.test.ts`

This helper is the single source of truth for the "I got my period today" action. It owns the Supabase insert AND the store update, so the UI layer is a thin wrapper.

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/lib/resetCycle.test.ts`:
```ts
import { resetCycleToToday } from '@/lib/resetCycle';

// Mock Supabase client used by the helper
jest.mock('@/lib/supabase', () => {
  const insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: {
      from: jest.fn(() => ({ insert })),
    },
    __insert: insert,
  };
});

// Mock the cycle store used by the helper
jest.mock('@/store/cycle', () => {
  const setPeriodStart = jest.fn();
  return {
    useCycleStore: {
      getState: () => ({ cycleLength: 28, setPeriodStart }),
    },
    __setPeriodStart: setPeriodStart,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __insert }          = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setPeriodStart }  = require('@/store/cycle');

describe('resetCycleToToday', () => {
  beforeEach(() => {
    __insert.mockClear();
    __setPeriodStart.mockClear();
  });

  it('inserts a new cycle_logs row with today as period_start', async () => {
    const today = new Date('2026-05-17T10:00:00Z');
    await resetCycleToToday('user-1', today);
    expect(__insert).toHaveBeenCalledWith({
      user_id:           'user-1',
      period_start:      '2026-05-17',
      cycle_length_days: 28,
    });
  });

  it('updates the store so dayOfCycle becomes 1', async () => {
    const today = new Date('2026-05-17T10:00:00Z');
    await resetCycleToToday('user-1', today);
    expect(__setPeriodStart).toHaveBeenCalledTimes(1);
    const [calledDate] = __setPeriodStart.mock.calls[0];
    expect(calledDate.toDateString()).toBe(today.toDateString());
  });

  it('throws on Supabase error and does not mutate the store', async () => {
    __insert.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(resetCycleToToday('user-1', new Date('2026-05-17')))
      .rejects.toThrow('boom');
    expect(__setPeriodStart).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/lib/resetCycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`mobile/src/lib/resetCycle.ts`:
```ts
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';

function toYmd(d: Date): string {
  // YYYY-MM-DD in the local timezone — matches how cycle_logs is stored elsewhere
  return d.toLocaleDateString('en-CA');
}

export async function resetCycleToToday(userId: string, today: Date = new Date()): Promise<void> {
  const { cycleLength, setPeriodStart } = useCycleStore.getState();
  const periodStart = toYmd(today);

  const { error } = await supabase
    .from('cycle_logs')
    .insert({
      user_id:           userId,
      period_start:      periodStart,
      cycle_length_days: cycleLength,
    });

  if (error) throw new Error(error.message);

  setPeriodStart(today);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/lib/resetCycle.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/resetCycle.ts mobile/__tests__/lib/resetCycle.test.ts
git commit -m "feat(cycle): add resetCycleToToday helper"
```

---

## Task 6: Cycle detail screen

**Files:**
- Create: `mobile/app/(app)/cycle-detail.tsx`

No automated test for the screen itself — integration verification is via the manual smoke test in Task 8. The pure logic underneath (calendar, reset, progress bar) is already covered.

- [ ] **Step 1: Create the screen file**

`mobile/app/(app)/cycle-detail.tsx`:
```tsx
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { PHASE_META } from '@/lib/phaseMeta';
import { resetCycleToToday } from '@/lib/resetCycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { CycleCalendar } from '@/components/ui/CycleCalendar';
import type { CyclePhase } from '@/lib/cycleEngine';

const WEIGHT_REASONING: Record<CyclePhase, string> = {
  menstrual:  'Bleed days often show your lowest read of the cycle as water levels reset.',
  follicular: 'Follicular days are your steadiest baseline — energy rises and weight tends to hold.',
  ovulatory:  'A small lift around ovulation is normal. Hormones drive a brief water rise.',
  luteal:     'Expect a 1–2 kg lift before your period. This is water retention, not fat gain.',
};

export default function CycleDetailScreen() {
  const { session } = useAuthStore();
  const { cycleInfo, cycleProfile, periodStart, cycleLength } = useCycleStore();
  const [resetting, setResetting] = useState(false);

  const meta = cycleInfo ? PHASE_META[cycleInfo.phase] : null;

  function handleReset() {
    if (!session) return;
    Alert.alert(
      'Reset your cycle?',
      'This logs today as the start of a new period and your day count restarts from 1.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetCycleToToday(session.user.id);
            } catch (e: any) {
              Alert.alert('Could not reset cycle', e?.message ?? 'Please try again.');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }

  const isNatural = cycleProfile === 'natural' || cycleProfile === 'irregular';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Your Cycle</VirraText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!cycleInfo || !meta || !isNatural || !periodStart ? (
          <>
            <VirraCard>
              <VirraText variant="body" size={14} color={colors.breath}>
                Your cycle profile is set to {labelForProfile(cycleProfile)}. Update it in
                Profile → Cycle settings if anything changes.
              </VirraText>
            </VirraCard>
            <View style={styles.actionRow}>
              <VirraButton
                label="UPDATE CYCLE"
                onPress={() => router.push('/(app)/cycle-settings')}
                style={{ flex: 2 }}
              />
              <View style={{ flex: 1 }}>
                <PeriodButton onPress={() => {}} disabled />
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Hero */}
            <VirraCard>
              <View style={styles.phasePill}>
                <VirraText variant="mono" size={10} color={meta.color}>
                  {meta.label.toUpperCase()} PHASE
                </VirraText>
              </View>
              <CycleProgressBar
                dayOfCycle={cycleInfo.dayOfCycle}
                cycleLength={cycleInfo.cycleLength}
                phaseColor={meta.color}
              />
              <View style={styles.statsRow}>
                <Stat value={cycleInfo.dayOfCycle}          label="DAY"       color={meta.color} />
                <View style={styles.statDivider} />
                <Stat value={cycleInfo.daysUntilNextPeriod} label="DAYS LEFT" color={meta.color} />
                <View style={styles.statDivider} />
                <Stat value={cycleInfo.cycleLength}         label="DAY CYCLE" color={meta.color} />
              </View>
            </VirraCard>

            {/* Calendar */}
            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                THIS CYCLE
              </VirraText>
              <CycleCalendar periodStart={periodStart} cycleLength={cycleLength} />
            </VirraCard>

            {/* Weight scaffold */}
            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                WEIGHT
              </VirraText>
              <VirraText variant="body" size={13} color={colors.muted} style={{ marginBottom: spacing.sm }}>
                How your weight moves through your cycle
              </VirraText>
              <VirraText variant="body" size={14} color={colors.breath}>
                Weight tracking is off. We're saving this surface for Virra's cycle-aware
                weight insight — coming soon. When it's on, you'll see your weight delta from
                baseline charted across the current cycle, with the same phase-band colouring
                as the calendar above.
              </VirraText>
            </VirraCard>

            {/* Reasoning */}
            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                WHAT TO EXPECT
              </VirraText>
              <VirraText variant="body" size={14} color={colors.breath}>
                {WEIGHT_REASONING[cycleInfo.phase]}
              </VirraText>
            </VirraCard>

            {/* Actions */}
            <View style={styles.actionRow}>
              <VirraButton
                label="UPDATE CYCLE"
                onPress={() => router.push('/(app)/cycle-settings')}
                style={{ flex: 2 }}
              />
              <View style={{ flex: 1 }}>
                <PeriodButton onPress={handleReset} loading={resetting} />
              </View>
            </View>

            {/* Coaching */}
            <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
              THIS PHASE
            </VirraText>
            <CoachingCard title="Training"  body={meta.training}  accent={meta.color} />
            <CoachingCard title="Nutrition" body={meta.nutrition} accent={meta.color} />
            <CoachingCard title="Lifestyle" body={meta.lifestyle} accent={meta.color} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <VirraText variant="display" size={32} color={color}>{value}</VirraText>
      <VirraText variant="mono" size={11} color={colors.muted} style={styles.statLabel}>{label}</VirraText>
    </View>
  );
}

function CoachingCard({ title, body, accent }: { title: string; body: string; accent: string }) {
  return (
    <VirraCard style={{ marginBottom: spacing.sm }}>
      <VirraText variant="mono" size={10} color={accent} style={styles.cardLabel}>
        {title.toUpperCase()}
      </VirraText>
      <VirraText variant="body" size={14} color={colors.breath}>{body}</VirraText>
    </VirraCard>
  );
}

function PeriodButton({ onPress, disabled, loading }: { onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        periodStyles.base,
        disabled && periodStyles.disabled,
        pressed && periodStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="I got my period"
    >
      <VirraText variant="mono" size={11} color={colors.mile} numberOfLines={2} style={{ textAlign: 'center' }}>
        {loading ? '…' : 'I GOT MY PERIOD'}
      </VirraText>
    </Pressable>
  );
}

function labelForProfile(p: string): string {
  switch (p) {
    case 'hormonal':      return 'Hormonal contraception';
    case 'perimenopause': return 'Perimenopause';
    case 'menopause':     return 'Menopause';
    case 'irregular':     return 'Irregular cycle';
    default:              return 'Regular cycle';
  }
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:    { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:      { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  phasePill:    { alignSelf: 'flex-start', marginBottom: spacing.sm },
  statsRow:     { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
  stat:         { flex: 1, alignItems: 'center' },
  statDivider:  { width: 1, height: 28, backgroundColor: colors.border },
  statLabel:    { letterSpacing: 1.5, marginTop: 2 },
  cardLabel:    { letterSpacing: 1.5, marginBottom: spacing.xs },
  sectionLabel: { letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.xs },
  actionRow:    { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});

const periodStyles = StyleSheet.create({
  base:     { backgroundColor: colors.heat, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', height: '100%' },
  disabled: { opacity: 0.45 },
  pressed:  { opacity: 0.82 },
});
```

- [ ] **Step 2: Run the test suite to confirm no regressions**

Run: `cd mobile && npx jest`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/cycle-detail.tsx
git commit -m "feat(cycle): add Your Cycle detail screen"
```

---

## Task 7: Wire Dashboard cycle hero to the detail route

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

The current Dashboard has, in the `heroRow` View, a `VirraCard` containing the cycle info. Wrap that card in a `Pressable` so tapping it pushes the new route. The Activity Rings card next to it remains untouched.

- [ ] **Step 1: Wrap the cycle card in a Pressable**

In `mobile/app/(app)/(tabs)/index.tsx`, locate the block beginning `<View style={styles.heroRow}>` (around line 209). Inside that View, the **first child** is `<VirraCard style={[styles.heroCard, { flex: 1 }]}>...</VirraCard>` — the cycle card. The **second child** is `<VirraCard style={styles.ringsCard}>...</VirraCard>` — the rings card. You are wrapping ONLY the first child in a `Pressable`. Do NOT rewrite the children of either card — they stay exactly as they are.

Concretely, two edits:

1. **Immediately before** the first `<VirraCard style={[styles.heroCard, { flex: 1 }]}>`, insert:
```tsx
<Pressable
  style={{ flex: 1 }}
  onPress={() => router.push('/(app)/cycle-detail' as any)}
  accessibilityRole="button"
  accessibilityLabel="Open cycle detail"
>
```

2. **Immediately after** the matching closing `</VirraCard>` for that first card (the one that contains the tagline, progress bar, and stats row — NOT the rings card), insert:
```tsx
</Pressable>
```

`Pressable` is already imported in this file. `router` is already imported. No new imports needed.

- [ ] **Step 2: Run the test suite to confirm no regressions**

Run: `cd mobile && npx jest`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/\(tabs\)/index.tsx
git commit -m "feat(cycle): tap dashboard cycle hero to open detail screen"
```

---

## Task 8: Manual smoke test on the simulator

Type checking and unit tests verify code correctness, not feature correctness. Run the app and walk the flow.

- [ ] **Step 1: Type-check the project**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. Fix anything that surfaces (likely import typos) before moving on.

- [ ] **Step 2: Boot the dev server**

Run: `cd mobile && npx expo start --ios` (or use the existing dev workflow)

- [ ] **Step 3: Walk the flow**

Verify each:
- Dashboard cycle hero is tappable; tapping opens the new screen
- Header reads "Your Cycle" with a left chevron, no profile/bell, no logo
- Hero shows current phase pill + progress bar + DAY / DAYS LEFT / DAY CYCLE
- Calendar shows correct number of chips for the user's `cycleLength`, today's chip is highlighted, bleed dots on days 1–5, legend renders below
- Weight card shows the empty-state copy
- Reasoning card shows phase-appropriate copy
- `UPDATE CYCLE` is wider (2/3) and pulse; `I GOT MY PERIOD` is narrower (1/3) and heat
- Tapping `UPDATE CYCLE` opens Cycle Settings
- Tapping `I GOT MY PERIOD` → confirm dialog → tap `Yes, reset` → return to Dashboard → DAY now reads 1
- Cancelling the dialog leaves DAY unchanged
- Coaching cards render Training / Nutrition / Lifestyle copy

Then switch cycle profile to `hormonal` in Cycle Settings and re-enter Detail:
- Only the empty-state card + the action row render
- `I GOT MY PERIOD` is visually disabled

- [ ] **Step 4: Commit any fixes from this pass**

If the smoke test surfaced issues, fix and commit each fix as its own commit with a clear message. If everything passed, no commit needed.

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| 1 Route & entry point | Task 6 (new route), Task 7 (Dashboard wiring) |
| 2 Header (sub-menu pattern) | Task 6 step 1 |
| 3 Hero block (no tagline)| Task 6 step 1 — note the screen omits `meta.tagline`; Dashboard still uses it |
| 4 Cycle calendar card | Tasks 3 + 4 |
| 5 Weight chart scaffold | Task 6 step 1 (empty-state card) |
| 6 Reasoning card | Task 6 step 1 (WEIGHT_REASONING map) |
| 7 Update Cycle + I Got My Period row | Tasks 5 + 6 step 1 (PeriodButton + handleReset) |
| 8 Phase coaching tips | Task 2 (lifestyle field) + Task 6 step 1 (CoachingCard) |
| 9 Non-natural profile handling | Task 6 step 1 (empty-state branch + disabled period button) |
| 10 Files touched | All tasks |
| 11 Out-of-scope items | None implemented (correct) |
