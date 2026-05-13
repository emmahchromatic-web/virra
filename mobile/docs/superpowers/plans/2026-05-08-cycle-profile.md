# Cycle Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cycle_profile` field to capture whether a user has a natural cycle, is on hormonal contraception, has an irregular cycle, or is peri/menopausal — gating the cycle phase engine and replacing hard-coded "no cycle data" nulls with appropriate fallback targets and copy.

**Architecture:** A new `cycle_profile` column on `user_profiles` (`natural | hormonal | irregular | perimenopause | menopause`) drives everything downstream. The cycle phase engine continues to run as-is for `natural` and `irregular` users; all others get `cycleInfo = null` with flat load-based nutrition targets instead of phase-based ones. The onboarding cycle screen gets a profile selector before the date pickers; the diet screen (onboarding save point) persists the choice. The cycle store loads the profile from Supabase on app boot alongside the existing cycle log query.

**Tech Stack:** Supabase (migration + MCP), Zustand, React Native, existing `cycleEngine.ts` / `nutritionTargets.ts`, Jest.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/004_cycle_profile.sql` | Add `cycle_profile` to `user_profiles` with check constraint |
| Modify | `src/lib/cycleEngine.ts` | Export `CycleProfile` union type |
| Modify | `src/lib/nutritionTargets.ts` | Accept `CyclePhase \| null`; add flat load-based targets |
| Create | `__tests__/lib/nutritionTargets.test.ts` | Unit tests for null-phase and phase-specific targets |
| Modify | `src/store/cycle.ts` | Add `cycleProfile` field + `setCycleProfile` action + load from `user_profiles` |
| Modify | `src/context/OnboardingContext.tsx` | Add `cycleProfile: CycleProfile` to `OnboardingData` |
| Modify | `app/(onboarding)/cycle.tsx` | Profile selector at top; conditional date pickers |
| Modify | `app/(onboarding)/diet.tsx` | Include `cycle_profile` in `user_profiles` upsert; call `setCycleProfile` |
| Modify | `app/(app)/(tabs)/index.tsx` | Differentiate null-state copy by `cycleProfile` |
| Modify | `app/(app)/(tabs)/nutrition.tsx` | Always return targets (flat when phase is null) |

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/004_cycle_profile.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/004_cycle_profile.sql`:

```sql
alter table public.user_profiles
  add column if not exists cycle_profile text not null default 'natural';

alter table public.user_profiles
  add constraint user_profiles_cycle_profile_check
  check (cycle_profile in ('natural', 'hormonal', 'irregular', 'perimenopause', 'menopause'));
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with:
- `name`: `004_cycle_profile`
- `query`: the SQL above

Expected: no error. Verify with `mcp__supabase__list_tables` or `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'user_profiles' and column_name = 'cycle_profile';
```
Expected: one row, `text`, default `natural`.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add supabase/migrations/004_cycle_profile.sql
git commit -m "feat: add cycle_profile column to user_profiles"
```

---

## Task 2: CycleEngine type + NutritionTargets flat fallback

**Files:**
- Modify: `src/lib/cycleEngine.ts`
- Modify: `src/lib/nutritionTargets.ts`
- Create: `__tests__/lib/nutritionTargets.test.ts`

### Context

`src/lib/cycleEngine.ts` currently exports:
```typescript
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
export interface CycleInfo { phase, dayOfCycle, daysUntilNextPeriod, cycleLength }
export function getCycleInfo(periodStart, cycleLength, today?): CycleInfo
export function getCyclePhase(periodStart, cycleLength, today?): CyclePhase
```

`src/lib/nutritionTargets.ts` currently exports:
```typescript
export function getNutritionTargets(phase: CyclePhase, load: TrainingLoad): NutritionTargets
```
This signature requires a non-null phase. All callers must update once we change it.

The one caller is `app/(app)/(tabs)/nutrition.tsx` line 104:
```typescript
const targets = cycleInfo ? getNutritionTargets(cycleInfo.phase, load) : null;
```
That is updated in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/nutritionTargets.test.ts`:

```typescript
import { getNutritionTargets } from '@/lib/nutritionTargets';

describe('getNutritionTargets', () => {
  it('returns phase-specific targets when phase is provided', () => {
    const t = getNutritionTargets('luteal', 'hard');
    expect(t.calories).toBe(2550);
    expect(t.carbs_g).toBe(310);
    expect(t.protein_g).toBe(145);
    expect(t.fat_g).toBe(75);
  });

  it('returns flat targets when phase is null', () => {
    const t = getNutritionTargets(null, 'easy');
    expect(t.calories).toBeGreaterThan(0);
    expect(t.carbs_g).toBeGreaterThan(0);
    expect(t.protein_g).toBeGreaterThan(0);
    expect(t.fat_g).toBeGreaterThan(0);
  });

  it('flat targets scale with training load', () => {
    const rest = getNutritionTargets(null, 'rest');
    const hard = getNutritionTargets(null, 'hard');
    expect(hard.calories).toBeGreaterThan(rest.calories);
    expect(hard.carbs_g).toBeGreaterThan(rest.carbs_g);
  });

  it('flat targets are within plausible range', () => {
    const t = getNutritionTargets(null, 'moderate');
    expect(t.calories).toBeGreaterThanOrEqual(1500);
    expect(t.calories).toBeLessThanOrEqual(3500);
  });

  it('all four loads return flat targets without error', () => {
    for (const load of ['rest', 'easy', 'moderate', 'hard'] as const) {
      expect(() => getNutritionTargets(null, load)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/nutritionTargets.test.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `Argument of type 'null' is not assignable to parameter of type 'CyclePhase'` or similar.

- [ ] **Step 3: Export `CycleProfile` from `src/lib/cycleEngine.ts`**

Add this line after the `CyclePhase` type definition (after line 1):

```typescript
export type CycleProfile = 'natural' | 'hormonal' | 'irregular' | 'perimenopause' | 'menopause';
```

The full file after the change (lines 1–10):
```typescript
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
export type CycleProfile = 'natural' | 'hormonal' | 'irregular' | 'perimenopause' | 'menopause';

export interface CycleInfo {
  phase:               CyclePhase;
  dayOfCycle:          number;
  daysUntilNextPeriod: number;
  cycleLength:         number;
}
```

The rest of the file is unchanged.

- [ ] **Step 4: Update `src/lib/nutritionTargets.ts`**

Replace the entire file with:

```typescript
import type { CyclePhase } from '@/store/cycle';

export type TrainingLoad = 'rest' | 'easy' | 'moderate' | 'hard';

export interface NutritionTargets {
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
}

// Science-based targets for a recreational female runner (~60kg, 40–60km/week)
// Luteal gets highest carbs overall; ovulatory/follicular get higher protein for adaptation
const TARGETS: Record<CyclePhase, Record<TrainingLoad, NutritionTargets>> = {
  menstrual: {
    rest:     { calories: 1750, carbs_g: 175, protein_g: 100, fat_g: 65 },
    easy:     { calories: 1950, carbs_g: 205, protein_g: 110, fat_g: 68 },
    moderate: { calories: 2150, carbs_g: 235, protein_g: 120, fat_g: 70 },
    hard:     { calories: 2350, carbs_g: 265, protein_g: 130, fat_g: 72 },
  },
  follicular: {
    rest:     { calories: 1800, carbs_g: 185, protein_g: 105, fat_g: 65 },
    easy:     { calories: 2050, carbs_g: 220, protein_g: 120, fat_g: 68 },
    moderate: { calories: 2350, carbs_g: 265, protein_g: 138, fat_g: 68 },
    hard:     { calories: 2650, carbs_g: 315, protein_g: 155, fat_g: 68 },
  },
  ovulatory: {
    rest:     { calories: 1850, carbs_g: 195, protein_g: 108, fat_g: 65 },
    easy:     { calories: 2100, carbs_g: 235, protein_g: 125, fat_g: 68 },
    moderate: { calories: 2400, carbs_g: 280, protein_g: 142, fat_g: 68 },
    hard:     { calories: 2700, carbs_g: 330, protein_g: 158, fat_g: 68 },
  },
  luteal: {
    rest:     { calories: 1900, carbs_g: 215, protein_g: 105, fat_g: 70 },
    easy:     { calories: 2100, carbs_g: 245, protein_g: 115, fat_g: 72 },
    moderate: { calories: 2300, carbs_g: 275, protein_g: 130, fat_g: 72 },
    hard:     { calories: 2550, carbs_g: 310, protein_g: 145, fat_g: 75 },
  },
};

// Flat load-based targets for users without cycle phase data.
// Values are the arithmetic mean across all four phases, rounded to sensible numbers.
const FLAT_TARGETS: Record<TrainingLoad, NutritionTargets> = {
  rest:     { calories: 1825, carbs_g: 192, protein_g: 105, fat_g: 67 },
  easy:     { calories: 2050, carbs_g: 226, protein_g: 118, fat_g: 69 },
  moderate: { calories: 2300, carbs_g: 264, protein_g: 133, fat_g: 70 },
  hard:     { calories: 2563, carbs_g: 305, protein_g: 147, fat_g: 71 },
};

export function getNutritionTargets(phase: CyclePhase | null, load: TrainingLoad): NutritionTargets {
  if (!phase) return FLAT_TARGETS[load];
  return TARGETS[phase][load];
}

export const LOAD_LABELS: Record<TrainingLoad, string> = {
  rest:     'Rest',
  easy:     'Easy',
  moderate: 'Moderate',
  hard:     'Hard',
};
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/nutritionTargets.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 6: Run full suite to confirm no regressions**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all previous tests still pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add src/lib/cycleEngine.ts src/lib/nutritionTargets.ts __tests__/lib/nutritionTargets.test.ts
git commit -m "feat: add CycleProfile type; nutrition targets accept null phase with flat fallback"
```

---

## Task 3: CycleStore — add cycleProfile

**Files:**
- Modify: `src/store/cycle.ts`

### Context

Current `src/store/cycle.ts` exports `useCycleStore` with state `{ periodStart, cycleLength, cycleInfo }` and actions `{ setPeriodStart, setCycleLength, refreshPhase, loadFromSupabase }`. `loadFromSupabase` queries only `cycle_logs`.

`app/(app)/_layout.tsx` line 33 calls `loadFromSupabase(session.user.id)` on boot. That's the entry point for loading `cycleProfile` from Supabase.

The `CycleProfile` type is now exported from `src/lib/cycleEngine.ts` (added in Task 2).

- [ ] **Step 1: Replace `src/store/cycle.ts`**

```typescript
import { create } from 'zustand';
import { getCycleInfo, type CyclePhase, type CycleInfo, type CycleProfile } from '@/lib/cycleEngine';
import { supabase } from '@/lib/supabase';

interface CycleState {
  cycleProfile: CycleProfile;
  periodStart:  Date | null;
  cycleLength:  number;
  cycleInfo:    CycleInfo | null;
  setCycleProfile:   (profile: CycleProfile) => void;
  setPeriodStart:    (date: Date, today?: Date) => void;
  setCycleLength:    (length: number, today?: Date) => void;
  refreshPhase:      (today?: Date) => void;
  loadFromSupabase:  (userId: string, today?: Date) => Promise<void>;
}

function compute(
  periodStart: Date | null,
  cycleLength: number,
  today: Date,
): CycleInfo | null {
  if (!periodStart) return null;
  return getCycleInfo(periodStart, cycleLength, today);
}

export const useCycleStore = create<CycleState>((set, get) => ({
  cycleProfile: 'natural',
  periodStart:  null,
  cycleLength:  28,
  cycleInfo:    null,

  setCycleProfile: (profile) =>
    set({ cycleProfile: profile }),

  setPeriodStart: (date, today = new Date()) =>
    set((s) => ({
      periodStart: date,
      cycleInfo:   compute(date, s.cycleLength, today),
    })),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength: length,
      cycleInfo:   compute(s.periodStart, length, today),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      cycleInfo: compute(s.periodStart, s.cycleLength, today),
    })),

  loadFromSupabase: async (userId, today = new Date()) => {
    const [cycleRes, profileRes] = await Promise.all([
      supabase
        .from('cycle_logs')
        .select('period_start, cycle_length_days')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('cycle_profile')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const cycleProfile = (profileRes.data?.cycle_profile as CycleProfile | undefined) ?? 'natural';

    if (!cycleRes.data) {
      set({ cycleProfile });
      return;
    }

    const periodStart = new Date(cycleRes.data.period_start);
    const cycleLength = cycleRes.data.cycle_length_days ?? 28;
    set({
      cycleProfile,
      periodStart,
      cycleLength,
      cycleInfo: compute(periodStart, cycleLength, today),
    });
  },
}));

// Re-export types so consumers can import from one place
export type { CyclePhase, CycleInfo, CycleProfile };
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "cycle" | head -20
```

Expected: no errors. If any appear, fix them before proceeding.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add src/store/cycle.ts
git commit -m "feat: add cycleProfile to cycle store; loadFromSupabase now loads cycle_profile from user_profiles"
```

---

## Task 4: Onboarding — cycle profile selector

**Files:**
- Modify: `src/context/OnboardingContext.tsx`
- Modify: `app/(onboarding)/cycle.tsx`
- Modify: `app/(onboarding)/diet.tsx`

### Context

`src/context/OnboardingContext.tsx` currently stores `periodStart: Date | null` and `cycleLength: number` in `OnboardingData`. We add `cycleProfile: CycleProfile`.

`app/(onboarding)/cycle.tsx` is the 6th onboarding step. It currently asks for period start date and cycle length only. We prepend a profile selector. For `natural` and `irregular` profiles, the existing date pickers follow. For `hormonal`, `perimenopause`, and `menopause`, the date pickers are hidden and a brief contextual note is shown instead.

`app/(onboarding)/diet.tsx` is where all onboarding data is saved (step 7, the "Continue" that leads to the paywall). It currently upserts to `user_profiles` without `cycle_profile`. We add it. It also calls `setPeriodStart` on the cycle store — we replace that with calls to both `setCycleProfile` and (conditionally) `setPeriodStart`.

The `CycleProfile` type is exported from `src/store/cycle` (which re-exports from `src/lib/cycleEngine.ts`).

- [ ] **Step 1: Update `src/context/OnboardingContext.tsx`**

Replace the file:

```typescript
import React, { createContext, useContext, useState } from 'react';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';
import type { CycleProfile } from '@/store/cycle';

export type RunningGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

interface OnboardingData {
  firstName:      string;
  lastName:       string;
  localAvatarUri: string | null;
  fitnessLevel:   FitnessLevel | null;
  weeklyMileage:  WeeklyMileageBracket | null;
  fiveKTime:      string;
  runningGoal:    RunningGoal | null;
  cycleProfile:   CycleProfile;
  periodStart:    Date | null;
  cycleLength:    number;
}

interface OnboardingContextValue {
  currentStep: number;
  setStep:     (step: number) => void;
  data:        OnboardingData;
  setData:     (patch: Partial<OnboardingData>) => void;
}

const defaultData: OnboardingData = {
  firstName:      '',
  lastName:       '',
  localAvatarUri: null,
  fitnessLevel:   null,
  weeklyMileage:  null,
  fiveKTime:      '',
  runningGoal:    null,
  cycleProfile:   'natural',
  periodStart:    null,
  cycleLength:    28,
};

const OnboardingContext = createContext<OnboardingContextValue>({
  currentStep: 1,
  setStep:     () => {},
  data:        defaultData,
  setData:     () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setStep] = useState(1);
  const [data, setDataState]   = useState<OnboardingData>(defaultData);

  function setData(patch: Partial<OnboardingData>) {
    setDataState((prev) => ({ ...prev, ...patch }));
  }

  return (
    <OnboardingContext.Provider value={{ currentStep, setStep, data, setData }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
```

- [ ] **Step 2: Replace `app/(onboarding)/cycle.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { fetchHKCycleData } from '@/lib/healthKitOnboarding';
import type { CycleProfile } from '@/store/cycle';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;

function defaultPeriodStart() {
  return new Date(Date.now() - DEFAULT_CYCLE * MS_PER_DAY);
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string }[] = [
  { value: 'natural',       label: 'Regular cycle',          sub: 'I can roughly predict it'           },
  { value: 'hormonal',      label: 'Hormonal contraception',  sub: 'Pill, IUD, implant or patch'        },
  { value: 'irregular',     label: 'Irregular cycle',         sub: 'Unpredictable or recently changed'  },
  { value: 'perimenopause', label: 'Perimenopause',           sub: 'Cycles changing or stopping'        },
  { value: 'menopause',     label: 'Menopause',               sub: 'No period for 12+ months'           },
];

const NON_NATURAL_NOTE: Partial<Record<CycleProfile, string>> = {
  hormonal:     'Your targets are based on training load — the same science, without cycle phase modulation.',
  perimenopause:'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:    'Your targets are based on training load. Symptom logging is available throughout.',
};

export default function CycleScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(6); }, [setStep]));

  const [cycleProfile, setCycleProfile] = useState<CycleProfile>('natural');
  const [periodStart, setPeriodStart]   = useState<Date>(defaultPeriodStart);
  const [cycleLength, setCycleLength]   = useState(DEFAULT_CYCLE);
  const [hkBadges, setHkBadges]         = useState<Set<string>>(new Set());

  const showDatePickers = cycleProfile === 'natural' || cycleProfile === 'irregular';

  useEffect(() => {
    fetchHKCycleData().then((hk) => {
      const badges = new Set<string>();
      if (hk.lastPeriodStart)      { setPeriodStart(hk.lastPeriodStart); badges.add('date'); }
      if (hk.estimatedCycleLength) { setCycleLength(hk.estimatedCycleLength); badges.add('length'); }
      setHkBadges(badges);
    });
  }, []);

  function shiftDate(days: number) {
    setPeriodStart((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  function handleContinue() {
    setData({
      cycleProfile,
      periodStart: showDatePickers ? periodStart : null,
      cycleLength: showDatePickers ? cycleLength : DEFAULT_CYCLE,
    });
    router.push('/(onboarding)/diet');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Tell us about your cycle
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        This personalises your training and nutrition targets.
      </VirraText>

      {/* Profile selector */}
      <View style={styles.section}>
        {CYCLE_PROFILES.map((opt) => {
          const active = cycleProfile === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setCycleProfile(opt.value)}
              style={[styles.profileOption, active && styles.profileOptionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                {opt.label}
              </VirraText>
              <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                {opt.sub}
              </VirraText>
            </Pressable>
          );
        })}
      </View>

      {/* Date pickers — natural and irregular only */}
      {showDatePickers && (
        <>
          <View style={styles.section}>
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                {cycleProfile === 'irregular' ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?' : 'LAST PERIOD START'}
              </VirraText>
              {hkBadges.has('date') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
            <View style={styles.datePicker}>
              <Pressable onPress={() => shiftDate(-1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
              </Pressable>
              <VirraText variant="bodyMedium" size={16} color={colors.breath} style={styles.dateText}>
                {formatDate(periodStart)}
              </VirraText>
              <Pressable onPress={() => shiftDate(1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                AVERAGE CYCLE LENGTH
              </VirraText>
              {hkBadges.has('length') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setCycleLength((n) => Math.max(21, n - 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
              </Pressable>
              <View style={styles.stepCenter}>
                <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
              </View>
              <Pressable
                onPress={() => setCycleLength((n) => Math.min(40, n + 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
              </Pressable>
            </View>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.stepHint}>
              Range: 21–40 days
            </VirraText>
          </View>
        </>
      )}

      {/* Contextual note for non-natural profiles */}
      {!showDatePickers && NON_NATURAL_NOTE[cycleProfile] && (
        <View style={styles.note}>
          <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={styles.noteText}>
            {NON_NATURAL_NOTE[cycleProfile]}
          </VirraText>
        </View>
      )}

      <VirraButton label="CONTINUE" onPress={handleContinue} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:               { flex: 1 },
  container:            { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:                { lineHeight: 34 },
  sub:                  { lineHeight: 22, marginTop: -spacing.md },
  section:              { gap: spacing.sm },
  profileOption:        { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive:  { backgroundColor: colors.pulse, borderColor: colors.pulse },
  fieldRow:             { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:           { letterSpacing: 2 },
  datePicker:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:              { width: 36, alignItems: 'center' },
  dateText:             { flex: 1, textAlign: 'center' },
  stepper:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:              { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:           { alignItems: 'center', gap: 2 },
  stepHint:             { textAlign: 'center' },
  note:                 { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:             { lineHeight: 22 },
  cta:                  { marginTop: spacing.sm },
});
```

- [ ] **Step 3: Update `app/(onboarding)/diet.tsx`**

Two changes:

**Change A** — update the `user_profiles` upsert to include `cycle_profile`. Replace lines 78–93 (the `user_profiles` upsert block):

```typescript
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id:                  userId,
      first_name:          data.firstName   || null,
      last_name:           data.lastName    || null,
      ...(avatarUrl != null && { avatar_url: avatarUrl }),
      fitness_level:       data.fitnessLevel,
      running_goal:        data.runningGoal,
      dietary_prefs:       Array.from(selected),
      cycle_profile:       data.cycleProfile,
      onboarding_complete: true,
    });
```

**Change B** — update the cycle store calls at the bottom of `handleContinue`. Replace the existing `if (data.periodStart) { setPeriodStart(data.periodStart); }` block (currently lines 115–117) with:

```typescript
    const { setCycleProfile, setPeriodStart } = useCycleStore.getState();
    setCycleProfile(data.cycleProfile);
    if (data.periodStart) {
      setPeriodStart(data.periodStart);
    }
```

**Change C** — update the import from `@/store/cycle` at the top of the file. The current import is:
```typescript
import { useCycleStore } from '@/store/cycle';
```
That stays as-is (we call `useCycleStore.getState()` directly inside the async function, not the hook, because this is inside an async handler not a component render).

**Change D** — remove the `const { setPeriodStart } = useCycleStore();` line from the component body (around line 30), since we now call `useCycleStore.getState()` inside `handleContinue` directly:

Find and remove:
```typescript
  const { setPeriodStart }  = useCycleStore();
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -E "(cycle|diet|OnboardingContext)" | head -20
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add src/context/OnboardingContext.tsx "app/(onboarding)/cycle.tsx" "app/(onboarding)/diet.tsx"
git commit -m "feat: cycle profile selector in onboarding — pill, irregular, peri/menopause"
```

---

## Task 5: App screens — dashboard copy + nutrition flat targets

**Files:**
- Modify: `app/(app)/(tabs)/index.tsx`
- Modify: `app/(app)/(tabs)/nutrition.tsx`

### Context

**`index.tsx`** — the dashboard. Around line 97–98:
```typescript
const { cycleInfo } = useCycleStore();
const meta = cycleInfo ? PHASE_META[cycleInfo.phase] : null;
```
And around line 128:
```typescript
{!cycleInfo || !meta ? (
  // null state — currently says "Add your cycle data to unlock..."
```

For users whose `cycleProfile` is `hormonal`, `perimenopause`, or `menopause`, telling them to "Add your cycle data" is wrong — they intentionally have no cycle data. We need copy that reflects their actual situation.

**`nutrition.tsx`** — around line 96–104:
```typescript
const { cycleInfo } = useCycleStore();
// ...
const targets = cycleInfo ? getNutritionTargets(cycleInfo.phase, load) : null;
```
`getNutritionTargets` now accepts `null` phase, so `targets` can always be computed. Change to:
```typescript
const targets = getNutritionTargets(cycleInfo?.phase ?? null, load);
```
Also: the `WhyCard` at line 204 is gated by `{cycleInfo && <WhyCard ... />}`. That stays as-is — phase-specific "why" copy only makes sense when we have a phase.

- [ ] **Step 1: Update `app/(app)/(tabs)/index.tsx`**

**Change A** — add `cycleProfile` to the `useCycleStore` destructure. Find:
```typescript
  const { cycleInfo } = useCycleStore();
```
Replace with:
```typescript
  const { cycleInfo, cycleProfile } = useCycleStore();
```

**Change B** — update the null state copy. Find the existing null-state `VirraText` (line ~87):
```typescript
        Add your cycle data to unlock phase-aware training and nutrition guidance.
```
Replace that entire null-state block. The block currently looks like:
```typescript
        {!cycleInfo || !meta ? (
          <View style={...}>
            ...Add your cycle data to unlock phase-aware training and nutrition guidance....
          </View>
        ) : (
```

Read the actual file to get the exact surrounding code, then replace only the string content of that VirraText:
```typescript
          {cycleProfile === 'natural' || cycleProfile === 'irregular'
            ? 'Add your cycle data to unlock phase-aware training and nutrition guidance.'
            : 'Training and nutrition targets are personalised to your training load.'}
```

- [ ] **Step 2: Update `app/(app)/(tabs)/nutrition.tsx`**

**Change A** — add `cycleProfile` to the useCycleStore destructure if needed for the WhyCard guard (it isn't, so just update the targets line).

Find:
```typescript
  const targets = cycleInfo ? getNutritionTargets(cycleInfo.phase, load) : null;
```
Replace with:
```typescript
  const targets = getNutritionTargets(cycleInfo?.phase ?? null, load);
```

**Change B** — find any conditional rendering that guards on `targets` being non-null (e.g. `{targets && ...}` or `if (!targets) return`). Since `targets` is now always defined, remove those guards if they exist and would hide the nutrition UI from non-cycling users.

Read the file first to identify the exact guards before editing.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -E "(index|nutrition)" | head -20
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/(tabs)/index.tsx" "app/(app)/(tabs)/nutrition.tsx"
git commit -m "feat: differentiate dashboard null state by cycle profile; nutrition always shows targets"
```

---

## Self-Review

**Spec coverage:**
- ✅ Pill / hormonal contraception — `hormonal` profile, no phase engine, flat targets
- ✅ Irregular cycle — `irregular` profile, date pickers shown with softer copy, engine runs best-effort
- ✅ Perimenopause — `perimenopause` profile, no phase engine, contextual note, flat targets
- ✅ Menopause — `menopause` profile, no phase engine, contextual note, flat targets
- ✅ Natural cycle — unchanged behaviour
- ✅ Onboarding question gates which experience — Task 4 (`cycle.tsx` profile selector)
- ✅ Schema stores choice durably — Task 1 (`cycle_profile` column)
- ✅ Store loads choice on boot — Task 3 (`loadFromSupabase` queries `user_profiles`)
- ✅ Nutrition targets always available — Task 2 + Task 5
- ✅ Dashboard copy correct for non-natural profiles — Task 5
- ✅ Unit tests for null-phase targets — Task 2

**Placeholder scan:** None. All code blocks are complete.

**Type consistency:**
- `CycleProfile` defined in `src/lib/cycleEngine.ts`, re-exported from `src/store/cycle` — used in `OnboardingContext`, `cycle.tsx`, `diet.tsx`, `index.tsx`, `cycle.ts` store ✅
- `getNutritionTargets(phase: CyclePhase | null, load: TrainingLoad)` — defined Task 2, called Task 5 with `cycleInfo?.phase ?? null` ✅
- `setCycleProfile(profile: CycleProfile)` — defined Task 3, called in `diet.tsx` Task 4 ✅
- `data.cycleProfile` in `OnboardingData` — added Task 4 Step 1, written in `cycle.tsx` Task 4 Step 2, read in `diet.tsx` Task 4 Step 3 ✅
