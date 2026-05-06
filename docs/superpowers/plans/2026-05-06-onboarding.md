# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 7-step onboarding flow shown once to new users after auth — collecting fitness, goal, cycle, and dietary data with HealthKit pre-fill — ending at the existing paywall.

**Architecture:** A new `(onboarding)` route group hosts 6 screens (steps 1–6). A React context (`OnboardingContext`) holds the current step index (for the progress bar) and collects form data in memory across steps; Supabase writes happen all-at-once in step 6 when the `user_profiles` row is created. `(auth)/index.tsx` detects new users by checking for a `user_profiles` row and routes them to onboarding. HealthKit IO is isolated in a thin async wrapper; pure derivation logic is separated into testable functions.

**Tech Stack:** Expo Router v3, React Native, Zustand, Supabase JS client, `react-native-health`, `expo-location`, `expo-notifications`, `expo-camera`, Jest + jest-expo

---

## File Map

**Create:**
- `mobile/app/(onboarding)/_layout.tsx` — progress bar + back arrow, no tab bar
- `mobile/app/(onboarding)/welcome.tsx` — step 1: value prop
- `mobile/app/(onboarding)/permissions.tsx` — step 2: 4 sequential permission requests
- `mobile/app/(onboarding)/fitness.tsx` — step 3: fitness assessment with HK pre-fill
- `mobile/app/(onboarding)/goal.tsx` — step 4: running goal with HK pre-fill
- `mobile/app/(onboarding)/cycle.tsx` — step 5: cycle data with HK pre-fill
- `mobile/app/(onboarding)/diet.tsx` — step 6: dietary prefs + all Supabase writes
- `mobile/src/context/OnboardingContext.tsx` — step index + collected form data
- `mobile/src/components/ui/OnboardingProgressBar.tsx` — 7 lime pill segments
- `mobile/src/lib/healthKitOnboarding.ts` — HK IO wrappers + pure derivation helpers
- `mobile/__tests__/components/ui/OnboardingProgressBar.test.tsx`
- `mobile/__tests__/lib/healthKitOnboarding.test.ts`

**Modify:**
- `mobile/app/(auth)/index.tsx` — add new-user detection via `user_profiles` check

---

## Task 1: OnboardingProgressBar component

**Files:**
- Create: `mobile/src/components/ui/OnboardingProgressBar.tsx`
- Create: `mobile/__tests__/components/ui/OnboardingProgressBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/__tests__/components/ui/OnboardingProgressBar.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';

describe('OnboardingProgressBar', () => {
  it('renders 7 pill segments', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={1} totalSteps={7} />);
    expect(getAllByTestId('progress-pill')).toHaveLength(7);
  });

  it('fills pills 1 through currentStep in lime', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={3} totalSteps={7} />);
    const pills = getAllByTestId('progress-pill');
    expect(pills[0].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[1].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[2].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[3].props.style).toMatchObject({ backgroundColor: 'rgba(212,255,38,0.15)' });
  });

  it('fills all 7 pills at step 7', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={7} totalSteps={7} />);
    getAllByTestId('progress-pill').forEach(pill =>
      expect(pill.props.style).toMatchObject({ backgroundColor: '#D4FF26' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/components/ui/OnboardingProgressBar.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/ui/OnboardingProgressBar'`

- [ ] **Step 3: Create the component**

```typescript
// mobile/src/components/ui/OnboardingProgressBar.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  currentStep: number;
  totalSteps:  number;
}

export function OnboardingProgressBar({ currentStep, totalSteps }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          testID="progress-pill"
          style={[
            styles.pill,
            { backgroundColor: i < currentStep ? '#D4FF26' : 'rgba(212,255,38,0.15)' },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 4 },
  pill: { flex: 1, height: 3, borderRadius: 2 },
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && npx jest __tests__/components/ui/OnboardingProgressBar.test.tsx --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/OnboardingProgressBar.tsx mobile/__tests__/components/ui/OnboardingProgressBar.test.tsx
git commit -m "feat: add OnboardingProgressBar component"
```

---

## Task 2: HealthKit derivation helpers (pure functions)

The HK IO layer requires a real device; we can't unit test it. We separate the pure derivation logic so it is testable independently.

**Files:**
- Create: `mobile/src/lib/healthKitOnboarding.ts`
- Create: `mobile/__tests__/lib/healthKitOnboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/lib/healthKitOnboarding.test.ts
import {
  deriveFitnessLevel,
  deriveWeeklyMileageBracket,
  estimateCycleLength,
} from '@/lib/healthKitOnboarding';

describe('deriveFitnessLevel', () => {
  it('returns advanced for pace < 5:00/km (< 300 s/km)', () => {
    expect(deriveFitnessLevel(280)).toBe('advanced');
  });

  it('returns intermediate for pace 5:00–6:30/km (300–389)', () => {
    expect(deriveFitnessLevel(350)).toBe('intermediate');
  });

  it('returns recreational for pace 6:30–8:00/km (390–479)', () => {
    expect(deriveFitnessLevel(430)).toBe('recreational');
  });

  it('returns beginner for pace > 8:00/km (>= 480)', () => {
    expect(deriveFitnessLevel(510)).toBe('beginner');
  });

  it('returns null when no pace data', () => {
    expect(deriveFitnessLevel(null)).toBeNull();
  });
});

describe('deriveWeeklyMileageBracket', () => {
  it('returns <5 for weekly km under 5', () => {
    expect(deriveWeeklyMileageBracket(3)).toBe('<5');
  });

  it('returns 5-15 for weekly km 5–15', () => {
    expect(deriveWeeklyMileageBracket(10)).toBe('5-15');
  });

  it('returns 15-30 for weekly km 15–30', () => {
    expect(deriveWeeklyMileageBracket(22)).toBe('15-30');
  });

  it('returns 30+ for weekly km over 30', () => {
    expect(deriveWeeklyMileageBracket(45)).toBe('30+');
  });

  it('returns null when no data', () => {
    expect(deriveWeeklyMileageBracket(null)).toBeNull();
  });
});

describe('estimateCycleLength', () => {
  it('returns null with fewer than 2 entries', () => {
    expect(estimateCycleLength([new Date('2024-01-01')])).toBeNull();
  });

  it('returns average interval between period start dates', () => {
    const dates = [
      new Date('2024-01-01'),
      new Date('2024-01-29'),
      new Date('2024-02-26'),
    ];
    expect(estimateCycleLength(dates)).toBe(28);
  });

  it('clamps result to 40 when interval is too long', () => {
    expect(estimateCycleLength([new Date('2024-01-01'), new Date('2024-03-10')])).toBe(40);
  });

  it('clamps result to 21 when interval is too short', () => {
    expect(estimateCycleLength([new Date('2024-01-01'), new Date('2024-01-10')])).toBe(21);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/lib/healthKitOnboarding.test.ts --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement pure helpers + IO wrappers**

```typescript
// mobile/src/lib/healthKitOnboarding.ts
export type FitnessLevel = 'beginner' | 'recreational' | 'intermediate' | 'advanced';
export type WeeklyMileageBracket = '<5' | '5-15' | '15-30' | '30+';

// ---- Pure derivation (unit-tested) ----

export function deriveFitnessLevel(avgPaceSeconds: number | null): FitnessLevel | null {
  if (avgPaceSeconds === null) return null;
  if (avgPaceSeconds < 300) return 'advanced';
  if (avgPaceSeconds < 390) return 'intermediate';
  if (avgPaceSeconds < 480) return 'recreational';
  return 'beginner';
}

export function deriveWeeklyMileageBracket(weeklyKm: number | null): WeeklyMileageBracket | null {
  if (weeklyKm === null) return null;
  if (weeklyKm < 5)  return '<5';
  if (weeklyKm < 15) return '5-15';
  if (weeklyKm < 30) return '15-30';
  return '30+';
}

export function estimateCycleLength(periodStartDates: Date[]): number | null {
  if (periodStartDates.length < 2) return null;
  const sorted = [...periodStartDates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round(
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    );
    intervals.push(days);
  }
  const avg = Math.round(intervals.reduce((s, n) => s + n, 0) / intervals.length);
  return Math.min(40, Math.max(21, avg));
}

// ---- HK IO wrappers (device-only, not unit-tested) ----

export interface HKFitnessData {
  avgPaceSeconds: number | null;
  weeklyKm:       number | null;
  best5kSeconds:  number | null;
}

export interface HKGoalData {
  best5kSeconds:     number | null;
  best10kSeconds:    number | null;
  bestHalfSeconds:   number | null;
  bestMarathonSeconds: number | null;
}

export interface HKCycleData {
  lastPeriodStart:       Date | null;
  estimatedCycleLength:  number | null;
}

export async function fetchHKFitnessData(): Promise<HKFitnessData> {
  const empty: HKFitnessData = { avgPaceSeconds: null, weeklyKm: null, best5kSeconds: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return new Promise((resolve) => {
      AppleHealthKit.getSamples(
        { type: 'Running', startDate: ninetyDaysAgo.toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const withDistance = results.filter(r => r.distance > 0);
          const avgPace = withDistance.length
            ? withDistance.reduce((s, r) => s + (r.duration / 60) / (r.distance / 1000), 0)
              / withDistance.length * 60
            : null;
          const eightWeeksAgo = Date.now() - 56 * 24 * 60 * 60 * 1000;
          const recentRuns = results.filter(r => new Date(r.startDate).getTime() > eightWeeksAgo);
          const totalKm = recentRuns.reduce((s, r) => s + (r.distance ?? 0) / 1000, 0);
          const weeklyKm = recentRuns.length ? totalKm / 8 : null;
          const nearFiveK = results.filter(r => r.distance >= 4800 && r.distance <= 5200);
          const best5k = nearFiveK.length ? Math.min(...nearFiveK.map(r => r.duration)) : null;
          resolve({
            avgPaceSeconds: avgPace ? Math.round(avgPace) : null,
            weeklyKm:       weeklyKm ? Math.round(weeklyKm * 10) / 10 : null,
            best5kSeconds:  best5k ? Math.round(best5k) : null,
          });
        }
      );
    });
  } catch {
    return empty;
  }
}

export async function fetchHKGoalData(): Promise<HKGoalData> {
  const empty: HKGoalData = { best5kSeconds: null, best10kSeconds: null, bestHalfSeconds: null, bestMarathonSeconds: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default;
    return new Promise((resolve) => {
      AppleHealthKit.getSamples(
        { type: 'Running', startDate: new Date(0).toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const best = (min: number, max: number) => {
            const m = results.filter(r => r.distance >= min && r.distance <= max);
            return m.length ? Math.min(...m.map(r => r.duration)) : null;
          };
          resolve({
            best5kSeconds:       best(4800, 5200),
            best10kSeconds:      best(9800, 10200),
            bestHalfSeconds:     best(21000, 21200),
            bestMarathonSeconds: best(42100, 42300),
          });
        }
      );
    });
  } catch {
    return empty;
  }
}

export async function fetchHKCycleData(): Promise<HKCycleData> {
  const empty: HKCycleData = { lastPeriodStart: null, estimatedCycleLength: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default;
    return new Promise((resolve) => {
      AppleHealthKit.getMenstrualFlowSamples(
        { startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const startDates = results
            .filter((r) => r.value === 1)
            .map((r) => new Date(r.startDate))
            .sort((a, b) => b.getTime() - a.getTime());
          resolve({
            lastPeriodStart:      startDates[0] ?? null,
            estimatedCycleLength: estimateCycleLength(startDates),
          });
        }
      );
    });
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && npx jest __tests__/lib/healthKitOnboarding.test.ts --no-coverage
```

Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/healthKitOnboarding.ts mobile/__tests__/lib/healthKitOnboarding.test.ts
git commit -m "feat: add HealthKit onboarding helpers with testable derivation functions"
```

---

## Task 3: OnboardingContext

**Files:**
- Create: `mobile/src/context/OnboardingContext.tsx`

No unit test — pure context wrapper, no logic.

- [ ] **Step 1: Create the context**

```typescript
// mobile/src/context/OnboardingContext.tsx
import React, { createContext, useContext, useState } from 'react';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';

export type RunningGoal = '5k' | '10k' | 'half' | 'marathon' | 'general';

interface OnboardingData {
  fitnessLevel:  FitnessLevel | null;
  weeklyMileage: WeeklyMileageBracket | null;
  fiveKTime:     string;
  runningGoal:   RunningGoal | null;
  periodStart:   Date | null;
  cycleLength:   number;
}

interface OnboardingContextValue {
  currentStep: number;
  setStep:     (step: number) => void;
  data:        OnboardingData;
  setData:     (patch: Partial<OnboardingData>) => void;
}

const defaultData: OnboardingData = {
  fitnessLevel:  null,
  weeklyMileage: null,
  fiveKTime:     '',
  runningGoal:   null,
  periodStart:   null,
  cycleLength:   28,
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

- [ ] **Step 2: Commit**

```bash
git add mobile/src/context/OnboardingContext.tsx
git commit -m "feat: add OnboardingContext for step tracking and form data"
```

---

## Task 4: Onboarding layout

**Files:**
- Create: `mobile/app/(onboarding)/_layout.tsx`

- [ ] **Step 1: Create the layout**

```typescript
// mobile/app/(onboarding)/_layout.tsx
import React from 'react';
import { View, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { Slot, router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';

function OnboardingLayout() {
  const { currentStep } = useOnboarding();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {currentStep > 1 ? (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <VirraText variant="body" size={20} color={colors.breath}>←</VirraText>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressWrapper}>
          <OnboardingProgressBar currentStep={currentStep} totalSteps={7} />
        </View>
        <View style={styles.backBtn} />
      </View>
      <Slot />
    </SafeAreaView>
  );
}

export default function Layout() {
  return (
    <OnboardingProvider>
      <OnboardingLayout />
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  backBtn:         { width: 32 },
  progressWrapper: { flex: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/_layout.tsx
git commit -m "feat: add onboarding layout with progress bar and conditional back arrow"
```

---

## Task 5: New user detection in (auth)/index.tsx

After auth, check `user_profiles`. No row → onboarding. Row exists → app.

**Files:**
- Modify: `mobile/app/(auth)/index.tsx`

- [ ] **Step 1: Add new-user detection**

Replace the `useEffect` block (lines 12–14) in the existing file:

```typescript
// Replace:
React.useEffect(() => {
  if (session) router.replace('/(app)');
}, [session]);

// With:
React.useEffect(() => {
  if (!session) return;
  supabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle()
    .then(({ data }) => {
      router.replace(data ? '/(app)' : '/(onboarding)/welcome');
    });
}, [session]);
```

Add `supabase` import at the top alongside the existing imports:

```typescript
import { supabase } from '@/lib/supabase';
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(auth)/index.tsx
git commit -m "feat: route new users to onboarding via user_profiles check"
```

---

## Task 6: Welcome screen (step 1)

**Files:**
- Create: `mobile/app/(onboarding)/welcome.tsx`

- [ ] **Step 1: Create welcome screen**

```typescript
// mobile/app/(onboarding)/welcome.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';

export default function WelcomeScreen() {
  const { setStep } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(1); }, []));

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <VirraText variant="display" size={64} color={colors.pulse} style={styles.wordmark}>
          VIRRA
        </VirraText>
        <VirraText variant="display" size={26} color={colors.breath} style={styles.headline}>
          Training that works with your cycle, not against it.
        </VirraText>
        <View style={styles.bullets}>
          {[
            'Cycle-adjusted training plans',
            'Phase-aware nutrition targets',
            'Seamless HealthKit sync',
          ].map((bullet) => (
            <View key={bullet} style={styles.bullet}>
              <VirraText variant="mono" size={10} color={colors.pulse}>—</VirraText>
              <VirraText variant="body" color="rgba(244,237,224,0.7)" style={styles.bulletText}>
                {bullet}
              </VirraText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <VirraButton
          label="GET STARTED"
          onPress={() => router.push('/(onboarding)/permissions')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero:       { flex: 1, justifyContent: 'center', gap: spacing.lg },
  wordmark:   { letterSpacing: 6 },
  headline:   { lineHeight: 32 },
  bullets:    { gap: spacing.sm, marginTop: spacing.sm },
  bullet:     { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1, lineHeight: 20 },
  footer:     { paddingBottom: spacing.xl },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/welcome.tsx
git commit -m "feat: add onboarding welcome screen (step 1)"
```

---

## Task 7: Permissions screen (step 2)

4 permissions shown one at a time. Each has a lime label + headline + body + WHY THIS MATTERS card + Continue. Tapping Continue fires the iOS dialog, then advances. Camera has an optional "Skip for now" link.

**Files:**
- Create: `mobile/app/(onboarding)/permissions.tsx`

- [ ] **Step 1: Create permissions screen**

```typescript
// mobile/app/(onboarding)/permissions.tsx
import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding } from '@/context/OnboardingContext';

const PERMISSIONS = [
  {
    id:       'health',
    label:    'HEALTH + ACTIVITY',
    headline: 'Your health data, working for you.',
    body:     "Virra reads your workout history to pre-fill your fitness baseline — and pulls cycle data if you've logged it in Apple Health.",
    why:      'Your data never leaves your device. Virra never uploads or sells health information.',
    optional: false,
  },
  {
    id:       'location',
    label:    'GPS + LOCATION',
    headline: 'Track every run, automatically.',
    body:     'Virra uses GPS to map routes, measure pace in real time, and log splits — all without touching your phone mid-run.',
    why:      "Without this, Virra can't track runs live. Your Watch data still syncs automatically.",
    optional: false,
  },
  {
    id:       'notifications',
    label:    'REMINDERS + ALERTS',
    headline: 'Stay on track without checking the app.',
    body:     'Virra sends smart reminders that cancel themselves as soon as the action is done.',
    why:      "Training reminders cancel when your workout is logged. Nutrition reminders cancel when you've logged a meal.",
    optional: false,
  },
  {
    id:       'camera',
    label:    'BARCODE SCANNER',
    headline: 'Log food in seconds.',
    body:     'Scan any barcode to log food instantly — no typing, no searching.',
    why:      'You can always add this later in Settings. It only affects barcode scanning.',
    optional: true,
  },
] as const;

async function requestPermission(id: string): Promise<void> {
  switch (id) {
    case 'health': {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AppleHealthKit = require('react-native-health').default;
        await new Promise<void>((resolve) => {
          AppleHealthKit.initHealthKit(
            {
              permissions: {
                read: [
                  AppleHealthKit.Constants.Permissions.HeartRate,
                  AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
                  AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
                  AppleHealthKit.Constants.Permissions.MenstrualFlow,
                  AppleHealthKit.Constants.Permissions.Workout,
                ],
                write: [AppleHealthKit.Constants.Permissions.Workout],
              },
            },
            () => resolve()
          );
        });
      } catch { /* HK unavailable on simulator — silently continue */ }
      break;
    }
    case 'location':
      await Location.requestForegroundPermissionsAsync();
      break;
    case 'notifications':
      await Notifications.requestPermissionsAsync();
      break;
    case 'camera':
      await ImagePicker.requestCameraPermissionsAsync();
      break;
  }
}

export default function PermissionsScreen() {
  const { setStep } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(2); }, []));

  const [permIndex, setPermIndex] = useState(0);
  const [loading, setLoading]     = useState(false);

  const current = PERMISSIONS[permIndex];

  function advance() {
    if (permIndex < PERMISSIONS.length - 1) {
      setPermIndex(permIndex + 1);
    } else {
      router.push('/(onboarding)/fitness');
    }
  }

  async function handleContinue() {
    setLoading(true);
    await requestPermission(current.id);
    setLoading(false);
    advance();
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.label}>
          {current.label}
        </VirraText>
        <VirraText variant="display" size={26} color={colors.breath} style={styles.headline}>
          {current.headline}
        </VirraText>
        <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.body}>
          {current.body}
        </VirraText>
        <VirraCard style={styles.whyCard}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.whyLabel}>
            WHY THIS MATTERS
          </VirraText>
          <VirraText variant="body" size={13} color="rgba(244,237,224,0.7)" style={styles.whyText}>
            {current.why}
          </VirraText>
        </VirraCard>
      </View>
      <View style={styles.footer}>
        <VirraButton label="CONTINUE" onPress={handleContinue} loading={loading} />
        {current.optional && (
          <Pressable onPress={advance} style={styles.skip}>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.4)">
              Skip for now
            </VirraText>
          </Pressable>
        )}
        <VirraText variant="mono" size={10} color="rgba(244,237,224,0.25)" style={styles.counter}>
          {permIndex + 1} of {PERMISSIONS.length}
        </VirraText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  content:   { flex: 1, justifyContent: 'center', gap: spacing.lg },
  label:     { letterSpacing: 2 },
  headline:  { lineHeight: 32 },
  body:      { lineHeight: 22 },
  whyCard:   { gap: spacing.sm },
  whyLabel:  { letterSpacing: 1 },
  whyText:   { lineHeight: 20 },
  footer:    { gap: spacing.md, paddingBottom: spacing.xl },
  skip:      { alignItems: 'center', paddingVertical: spacing.sm },
  counter:   { textAlign: 'center', letterSpacing: 1 },
});
```

**Note:** The camera permission uses `expo-image-picker`'s camera permission API (already in the Expo SDK) instead of `expo-camera` which requires an additional install.

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/permissions.tsx
git commit -m "feat: add onboarding permissions screen (step 2)"
```

---

## Task 8: Fitness Assessment screen (step 3)

**Files:**
- Create: `mobile/app/(onboarding)/fitness.tsx`

HK pre-fill runs in `useEffect`. Pre-filled fields show "· From Apple Health" badge. All fields editable.

- [ ] **Step 1: Create fitness screen**

```typescript
// mobile/app/(onboarding)/fitness.tsx
import React, { useState, useEffect } from 'react';
import { View, TextInput, ScrollView, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding } from '@/context/OnboardingContext';
import {
  fetchHKFitnessData,
  deriveFitnessLevel,
  deriveWeeklyMileageBracket,
  type FitnessLevel,
  type WeeklyMileageBracket,
} from '@/lib/healthKitOnboarding';

const FITNESS_OPTIONS: { value: FitnessLevel; label: string; sub: string }[] = [
  { value: 'beginner',     label: 'Beginner',     sub: 'Just starting out' },
  { value: 'recreational', label: 'Recreational', sub: 'Running for fun' },
  { value: 'intermediate', label: 'Intermediate', sub: 'Training consistently' },
  { value: 'advanced',     label: 'Advanced',     sub: 'Racing regularly' },
];

const MILEAGE_OPTIONS: WeeklyMileageBracket[] = ['<5', '5-15', '15-30', '30+'];

export default function FitnessScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(3); }, []));

  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | null>(null);
  const [mileage, setMileage]           = useState<WeeklyMileageBracket | null>(null);
  const [fiveKTime, setFiveKTime]       = useState('');
  const [hkBadges, setHkBadges]         = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHKFitnessData().then((hk) => {
      const badges = new Set<string>();
      const level   = deriveFitnessLevel(hk.avgPaceSeconds);
      const bracket = deriveWeeklyMileageBracket(hk.weeklyKm);
      if (level)   { setFitnessLevel(level);   badges.add('level'); }
      if (bracket) { setMileage(bracket);       badges.add('mileage'); }
      if (hk.best5kSeconds) {
        const m = Math.floor(hk.best5kSeconds / 60);
        const s = String(hk.best5kSeconds % 60).padStart(2, '0');
        setFiveKTime(`${m}:${s}`);
        badges.add('fivek');
      }
      setHkBadges(badges);
    });
  }, []);

  function handleContinue() {
    if (!fitnessLevel || !mileage) return;
    setData({ fitnessLevel, weeklyMileage: mileage, fiveKTime });
    router.push('/(onboarding)/goal');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Let's build your baseline.
      </VirraText>

      {/* Fitness level */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            FITNESS LEVEL
          </VirraText>
          {hkBadges.has('level') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <View style={styles.cardGrid}>
          {FITNESS_OPTIONS.map((opt) => (
            <Pressable key={opt.value} onPress={() => setFitnessLevel(opt.value)} style={styles.halfCard}>
              <VirraCard accent={fitnessLevel === opt.value}>
                <VirraText variant="bodyMedium" color={colors.breath}>{opt.label}</VirraText>
                <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)">{opt.sub}</VirraText>
              </VirraCard>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Weekly mileage */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            WEEKLY MILEAGE (KM)
          </VirraText>
          {hkBadges.has('mileage') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <View style={styles.segmented}>
          {MILEAGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setMileage(opt)}
              style={[styles.segment, mileage === opt && styles.segmentActive]}
            >
              <VirraText
                variant="mono"
                size={12}
                color={mileage === opt ? colors.mile : 'rgba(244,237,224,0.6)'}
              >
                {opt}
              </VirraText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 5K time */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            RECENT 5K TIME
          </VirraText>
          {hkBadges.has('fivek') && (
            <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
              {' '}· From Apple Health
            </VirraText>
          )}
        </View>
        <TextInput
          value={fiveKTime}
          onChangeText={setFiveKTime}
          placeholder="MM:SS"
          placeholderTextColor="rgba(244,237,224,0.25)"
          style={styles.timeInput}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)">
          Leave blank if you haven't raced
        </VirraText>
      </View>

      <VirraButton
        label="CONTINUE"
        onPress={handleContinue}
        disabled={!fitnessLevel || !mileage}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:        { flex: 1 },
  container:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:         { lineHeight: 34 },
  section:       { gap: spacing.sm },
  fieldRow:      { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:    { letterSpacing: 2 },
  cardGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  halfCard:      { width: '47%' },
  segmented:     { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  segment:       { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.mist },
  segmentActive: { backgroundColor: colors.pulse },
  timeInput:     { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, color: colors.breath, fontFamily: 'SpaceMono_400Regular', fontSize: 18, borderWidth: 1, borderColor: colors.border },
  cta:           { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/fitness.tsx
git commit -m "feat: add fitness assessment screen (step 3) with HealthKit pre-fill"
```

---

## Task 9: Running Goal screen (step 4)

**Files:**
- Create: `mobile/app/(onboarding)/goal.tsx`

HK pre-fill: surface furthest distance with a recorded time as the suggested goal.

- [ ] **Step 1: Create goal screen**

```typescript
// mobile/app/(onboarding)/goal.tsx
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding, type RunningGoal } from '@/context/OnboardingContext';
import { fetchHKGoalData } from '@/lib/healthKitOnboarding';

const GOAL_OPTIONS: { value: RunningGoal; label: string; sub: string }[] = [
  { value: '5k',       label: '5K',             sub: 'Build your base' },
  { value: '10k',      label: '10K',            sub: 'Push your limits' },
  { value: 'half',     label: 'Half Marathon',  sub: 'Go the distance' },
  { value: 'marathon', label: 'Marathon',       sub: 'The ultimate goal' },
  { value: 'general',  label: 'General Fitness', sub: 'Stay healthy, stay strong' },
];

function deriveGoal(hk: Awaited<ReturnType<typeof fetchHKGoalData>>): RunningGoal | null {
  if (hk.bestMarathonSeconds) return 'marathon';
  if (hk.bestHalfSeconds)     return 'half';
  if (hk.best10kSeconds)      return '10k';
  if (hk.best5kSeconds)       return '5k';
  return null;
}

export default function GoalScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(4); }, []));

  const [goal, setGoal]           = useState<RunningGoal | null>(null);
  const [hkSuggested, setHkSuggested] = useState(false);

  useEffect(() => {
    fetchHKGoalData().then((hk) => {
      const derived = deriveGoal(hk);
      if (derived) { setGoal(derived); setHkSuggested(true); }
    });
  }, []);

  function handleContinue() {
    if (!goal) return;
    setData({ runningGoal: goal });
    router.push('/(onboarding)/cycle');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        What are you training for?
      </VirraText>
      {hkSuggested && (
        <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)" style={styles.badge}>
          Based on your best times
        </VirraText>
      )}
      <View style={styles.list}>
        {GOAL_OPTIONS.map((opt) => (
          <Pressable key={opt.value} onPress={() => setGoal(opt.value)}>
            <VirraCard accent={goal === opt.value}>
              <VirraText variant="bodyMedium" color={colors.breath}>{opt.label}</VirraText>
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)">{opt.sub}</VirraText>
            </VirraCard>
          </Pressable>
        ))}
      </View>
      <VirraButton label="CONTINUE" onPress={handleContinue} disabled={!goal} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title:     { lineHeight: 34 },
  badge:     { letterSpacing: 1.5, marginTop: -spacing.sm },
  list:      { gap: spacing.sm },
  cta:       { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/goal.tsx
git commit -m "feat: add running goal screen (step 4) with HealthKit pre-fill"
```

---

## Task 10: Cycle Data screen (step 5)

Uses a pure-JS date display with +/- day buttons — no native `DateTimePicker` dependency needed.

**Files:**
- Create: `mobile/app/(onboarding)/cycle.tsx`

- [ ] **Step 1: Create cycle screen**

```typescript
// mobile/app/(onboarding)/cycle.tsx
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { fetchHKCycleData } from '@/lib/healthKitOnboarding';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;

function defaultPeriodStart() {
  return new Date(Date.now() - DEFAULT_CYCLE * MS_PER_DAY);
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CycleScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(5); }, []));

  const [periodStart, setPeriodStart] = useState<Date>(defaultPeriodStart);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE);
  const [hkBadges, setHkBadges]       = useState<Set<string>>(new Set());

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
    setData({ periodStart, cycleLength });
    router.push('/(onboarding)/diet');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        When did your last period start?
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        This activates your cycle phase engine right away.
      </VirraText>

      {/* Period start */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            LAST PERIOD START
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

      {/* Cycle length */}
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

      <VirraButton label="CONTINUE" onPress={handleContinue} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:      { flex: 1 },
  container:   { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:       { lineHeight: 34 },
  sub:         { lineHeight: 22, marginTop: -spacing.md },
  section:     { gap: spacing.sm },
  fieldRow:    { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:  { letterSpacing: 2 },
  datePicker:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:     { width: 36, alignItems: 'center' },
  dateText:    { flex: 1, textAlign: 'center' },
  stepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:  { alignItems: 'center', gap: 2 },
  stepHint:    { textAlign: 'center' },
  cta:         { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/cycle.tsx
git commit -m "feat: add cycle data screen (step 5) with HealthKit pre-fill"
```

---

## Task 11: Dietary Preferences screen (step 6) + all Supabase writes

Step 6 is the completion step. On submit it:
1. Writes `fitness_assessments` row (step 3 data)
2. Writes `cycle_logs` row (step 5 data)
3. Writes `user_profiles` row (marks onboarding complete)
4. Updates `useCycleStore.setPeriodStart()` locally
5. Navigates to paywall with `router.replace`

**Files:**
- Create: `mobile/app/(onboarding)/diet.tsx`

- [ ] **Step 1: Create dietary preferences screen**

```typescript
// mobile/app/(onboarding)/diet.tsx
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { useCycleStore } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

type DietaryPref = 'vegan' | 'vegetarian' | 'gluten-free' | 'dairy-free' | 'nut-free' | 'halal';

const DIET_OPTIONS: { value: DietaryPref; label: string }[] = [
  { value: 'vegan',       label: 'Vegan' },
  { value: 'vegetarian',  label: 'Vegetarian' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'dairy-free',  label: 'Dairy-free' },
  { value: 'nut-free',    label: 'Nut-free' },
  { value: 'halal',       label: 'Halal' },
];

export default function DietScreen() {
  const { setStep, data }   = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(6); }, []));

  const { session }         = useAuthStore();
  const { setPeriodStart }  = useCycleStore();
  const [selected, setSelected] = useState<Set<DietaryPref>>(new Set());
  const [saving, setSaving]     = useState(false);

  function toggle(pref: DietaryPref) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pref) ? next.delete(pref) : next.add(pref);
      return next;
    });
  }

  async function handleContinue() {
    if (!session) return;
    setSaving(true);
    const userId = session.user.id;
    const today  = new Date().toISOString().split('T')[0];

    const [profileResult] = await Promise.all([
      supabase.from('user_profiles').upsert({
        user_id:       userId,
        fitness_level: data.fitnessLevel,
        goal:          data.runningGoal,
        dietary_prefs: Array.from(selected),
      }),
      data.fitnessLevel
        ? supabase.from('fitness_assessments').insert({
            user_id:      userId,
            date:         today,
            stated_level: data.fitnessLevel,
            actual_pace:  null,
            trigger:      'onboarding',
          })
        : Promise.resolve(),
      data.periodStart
        ? supabase.from('cycle_logs').insert({
            user_id:      userId,
            period_start: data.periodStart.toISOString().split('T')[0],
            cycle_length: data.cycleLength,
          })
        : Promise.resolve(),
    ]);

    if (profileResult.error) {
      Alert.alert('Something went wrong', profileResult.error.message);
      setSaving(false);
      return;
    }

    if (data.periodStart) {
      setPeriodStart(data.periodStart);
    }

    setSaving(false);
    router.replace('/(auth)/paywall');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Any dietary preferences?
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        Shapes your nutrition guidance. Select all that apply — none is fine too.
      </VirraText>

      <View style={styles.chipGrid}>
        {DIET_OPTIONS.map((opt) => {
          const active = selected.has(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggle(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <VirraText
                variant="mono"
                size={12}
                color={active ? colors.mile : 'rgba(244,237,224,0.7)'}
              >
                {opt.label}
              </VirraText>
            </Pressable>
          );
        })}
      </View>

      <VirraButton label="CONTINUE" onPress={handleContinue} loading={saving} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1 },
  container:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:      { lineHeight: 34 },
  sub:        { lineHeight: 22, marginTop: -spacing.md },
  chipGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip:       { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  chipActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  cta:        { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/(onboarding)/diet.tsx
git commit -m "feat: add dietary preferences screen (step 6) with all Supabase writes"
```

---

## Task 12: Full test suite + smoke test

- [ ] **Step 1: Run all tests**

```bash
cd mobile && npx jest --no-coverage
```

Expected PASS across all test files:
- `__tests__/lib/cycleEngine.test.ts` (14 tests)
- `__tests__/store/cycle.test.ts` (8 tests)
- `__tests__/components/ui/OnboardingProgressBar.test.tsx` (3 tests)
- `__tests__/lib/healthKitOnboarding.test.ts` (13 tests)

- [ ] **Step 2: Start Metro and smoke-test on simulator**

```bash
cd mobile && npx expo start
```

Then press `i` to open in the iOS Simulator (or use an existing running build).

**New user flow** (delete `user_profiles` row in Supabase for test user, or use fresh sign-up):
- [ ] After sign-in → routes to `/(onboarding)/welcome`
- [ ] Progress bar shows 1 filled pill on Welcome
- [ ] No back arrow on Welcome (step 1)
- [ ] "GET STARTED" → Permissions screen, progress shows 2 filled pills, back arrow visible
- [ ] All 4 permission dialogs fire on Continue (on simulator they'll silently succeed or show a stripped dialog)
- [ ] Fitness screen (step 3): HK badge appears if permissions granted, fields editable
- [ ] Goal screen (step 4): cards selectable, Continue disabled until one is picked
- [ ] Cycle screen (step 5): ← → arrows adjust the date, stepper works 21–40
- [ ] Diet screen (step 6): chips toggle, Continue writes to Supabase and navigates to paywall
- [ ] No back arrow visible on paywall

**Returning user flow** (user_profiles row exists):
- [ ] After sign-in → routes directly to `/(app)`, skips onboarding entirely

- [ ] **Step 3: Commit test run (no code change needed)**

No commit needed if all tests pass and no code was changed.

---

## Dependency note

The camera permission on the Permissions screen uses `expo-image-picker` (already in SDK — no install needed). All other permissions (`expo-location`, `expo-notifications`) are also pre-installed. `react-native-health` is already in `package.json`. No additional native dependencies are required.
