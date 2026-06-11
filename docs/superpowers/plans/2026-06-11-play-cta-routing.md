# Play CTA Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dashboard play button to the correct execution surface — run sessions open the GPS run tracker (with planned-session linkage), all other modalities open a new workout-preview screen with a live timer and HealthKit write on finish.

**Architecture:** Update `TodaysSessionHero`'s callback signature to pass the chosen `TodaysSession` rather than fire a void callback, adding an ActionSheet picker for multi-session days. The dashboard handler branches on `session.modality`. The run tracker gains a `sessionId` search param it uses to link the saved activity. A new `/(app)/workout-preview` screen hosts preview UI, a live timer, and on-stop saves to HealthKit + Supabase.

**Tech Stack:** React Native, Expo Router (`useLocalSearchParams`), `ActionSheetIOS`, `NativeModules.AppleHealthKit.saveWorkout`, Supabase JS client, React Native Testing Library / Jest.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `mobile/src/components/ui/TodaysSessionHero.tsx` | Prop signature change + ActionSheet logic |
| Create | `mobile/__tests__/components/TodaysSessionHero.test.tsx` | Hero callback + picker behaviour |
| Modify | `mobile/app/(app)/(tabs)/index.tsx` | Modality-aware routing handler |
| Modify | `mobile/app/(app)/run.tsx` | Accept + use `sessionId` search param |
| Create | `mobile/app/(app)/workout-preview.tsx` | Preview + timer + HK write + Supabase save |
| Create | `mobile/__tests__/components/WorkoutPreview.test.tsx` | Timer state + save flow |

---

## Task 1 — TodaysSessionHero: callback signature + ActionSheet picker

**Files:**
- Modify: `mobile/src/components/ui/TodaysSessionHero.tsx`
- Create: `mobile/__tests__/components/TodaysSessionHero.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/TodaysSessionHero.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
import { TodaysSessionHero } from '@/components/ui/TodaysSessionHero';
import type { TodaysSession } from '@/lib/todaysSession';

const base: Omit<TodaysSession, 'id' | 'modality' | 'session_label'> = {
  status:                   'planned',
  activity_id:              null,
  cycle_adjusted_pace_secs: null,
  cycle_reason_short:       null,
  cycle_pace_arrow:         null,
  structure_summary:        null,
};

const runSession: TodaysSession    = { ...base, id: 'r1', modality: 'run',      session_label: 'Easy Run'    };
const strengthSession: TodaysSession = { ...base, id: 's1', modality: 'strength', session_label: 'Lower Body' };

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('TodaysSessionHero', () => {
  it('calls onStartPress immediately when exactly one planned session', () => {
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(runSession);
  });

  it('shows ActionSheet when multiple planned sessions exist', () => {
    const showSheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((opts, cb) => cb(0));
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(showSheet).toHaveBeenCalledTimes(1);
    // cb(0) selects first option → runSession
    expect(handler).toHaveBeenCalledWith(runSession);
    showSheet.mockRestore();
  });

  it('does not call handler when ActionSheet cancel is chosen', () => {
    const showSheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((opts, cb) => {
        // cancel index is last option
        cb(opts.options.length - 1);
      });
    const handler = jest.fn();
    const { getByRole } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={handler} />,
    );
    fireEvent.press(getByRole('button', { name: /start/i }));
    expect(handler).not.toHaveBeenCalled();
    showSheet.mockRestore();
  });

  it('labels button START RUN for a single planned run', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[runSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START RUN')).toBeTruthy();
  });

  it('labels button START SESSION for a single planned non-run', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[strengthSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START SESSION')).toBeTruthy();
  });

  it('labels button START SESSION → for multiple planned sessions', () => {
    const { getByText } = render(
      <TodaysSessionHero sessions={[runSession, strengthSession]} onStartPress={() => {}} />,
    );
    expect(getByText('START SESSION →')).toBeTruthy();
  });

  it('hides the button when no planned sessions remain', () => {
    const done: TodaysSession = { ...runSession, status: 'completed' };
    const { queryByRole } = render(
      <TodaysSessionHero sessions={[done]} onStartPress={() => {}} />,
    );
    expect(queryByRole('button', { name: /start/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/components/TodaysSessionHero.test.tsx --no-coverage
```

Expected: multiple failures (prop type mismatch, ActionSheet not called).

- [ ] **Step 3: Update `TodaysSessionHero.tsx`**

Replace the `Props` interface and button section in `mobile/src/components/ui/TodaysSessionHero.tsx`:

```tsx
// Add to imports at top of file
import { ActionSheetIOS } from 'react-native';

// Replace Props interface (line ~48)
interface Props {
  sessions:      TodaysSession[];
  onStartPress?: (session: TodaysSession) => void;
  style?:        StyleProp<ViewStyle>;
}

// Replace the component's onStartPress handler and button label logic:
// Inside TodaysSessionHero, before the return, add:
const planned = sessions.filter(s => s.status === 'planned');

function handleStartPress() {
  if (!onStartPress || planned.length === 0) return;
  if (planned.length === 1) {
    onStartPress(planned[0]);
    return;
  }
  const options = [
    ...planned.map(s => `${s.session_label.charAt(0).toUpperCase() + s.session_label.slice(1).toLowerCase()} · ${s.modality.toUpperCase()}`),
    'Cancel',
  ];
  ActionSheetIOS.showActionSheetWithOptions(
    { options, cancelButtonIndex: options.length - 1 },
    (index) => {
      if (index < planned.length) onStartPress(planned[index]);
    },
  );
}

const buttonLabel =
  planned.length > 1      ? 'START SESSION →' :
  planned[0]?.modality === 'run' ? 'START RUN'       : 'START SESSION';
```

Then update the button JSX (the `{onStartPress && sessions.some(...)}` block) to:

```tsx
{onStartPress && planned.length > 0 && (
  <Pressable
    style={styles.startBtn}
    onPress={handleStartPress}
    accessibilityRole="button"
    accessibilityLabel="Start today's session"
  >
    <SymbolView name="play.fill" size={13} tintColor={colors.mile} />
    <VirraText variant="display" size={13} color={colors.mile} style={styles.startLabel}>
      {buttonLabel}
    </VirraText>
  </Pressable>
)}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/components/TodaysSessionHero.test.tsx --no-coverage
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/TodaysSessionHero.tsx \
        mobile/__tests__/components/TodaysSessionHero.test.tsx
git commit -m "feat(hero): session-aware play callback + ActionSheet multi-session picker"
```

---

## Task 2 — Dashboard: modality-aware routing

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (line 199)

- [ ] **Step 1: Update the `onStartPress` handler**

Find and replace the `onStartPress` prop on `TodaysSessionHero` in `mobile/app/(app)/(tabs)/index.tsx`:

```tsx
// Replace this (line ~199):
onStartPress={() => router.push('/(app)/(tabs)/training' as any)}

// With:
onStartPress={(session) => {
  if (session.modality === 'run') {
    router.push(`/(app)/run?sessionId=${session.id}` as any);
  } else {
    router.push(`/(app)/workout-preview?sessionId=${session.id}` as any);
  }
}}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/(tabs)/index.tsx"
git commit -m "feat(dashboard): route play button by modality — run tracker or workout preview"
```

---

## Task 3 — Run tracker: planned-session linkage

**Files:**
- Modify: `mobile/app/(app)/run.tsx`

- [ ] **Step 1: Read `sessionId` from search params**

At the top of the `RunTrackerScreen` component in `mobile/app/(app)/run.tsx`, add:

```tsx
// Add to imports (expo-router import already exists — extend it):
import { router, useLocalSearchParams } from 'expo-router';

// Add inside RunTrackerScreen, near the top of the component:
const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
```

- [ ] **Step 2: Link activity to planned session on save**

In `handleSave`, after the `run_details` insert (around line 236), add the planned-session update:

```tsx
// After the run_details insert:
if (sessionId) {
  await supabase
    .from('planned_sessions')
    .update({ status: 'completed', activity_id: act.id })
    .eq('id', sessionId);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/run.tsx"
git commit -m "feat(run): accept sessionId param, mark planned session completed on save"
```

---

## Task 4 — Workout preview screen

**Files:**
- Create: `mobile/app/(app)/workout-preview.tsx`
- Create: `mobile/__tests__/components/WorkoutPreview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/WorkoutPreview.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert, NativeModules } from 'react-native';

// Mock expo-router
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'ps-1' }),
  router: { back: jest.fn(), push: jest.fn() },
}));

// Mock expo-symbols
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

// Mock auth store
jest.mock('@/store/auth', () => ({
  useAuthStore: () => ({ session: { user: { id: 'user-1' } } }),
}));

// Mock cycle store
jest.mock('@/store/cycle', () => ({
  useCycleStore: () => ({ cycleInfo: null }),
}));

// Mock notifications
jest.mock('@/lib/notifications', () => ({
  cancelTrainingReminderToday: jest.fn(),
}));

const mockSession = {
  id: 'ps-1',
  session_label: 'Lower Body',
  modality: 'strength',
  strength_structure: {
    version: 1,
    session_type: 'lower',
    exercises: [
      { id: 'e1', name: 'Squat',     primary_muscles: ['quads'], target_sets: [{ reps: 8 }], rest_seconds: 90 },
      { id: 'e2', name: 'Deadlift',  primary_muscles: ['hamstrings'], target_sets: [{ reps: 6 }], rest_seconds: 120 },
    ],
    estimated_minutes: 45,
  },
  run_structure: null,
  cycle_reason_short: null,
  cycle_adjusted_pace_secs: null,
};

const supabaseInsertMock = jest.fn().mockResolvedValue({ data: { id: 'act-1' }, error: null });
const supabaseUpdateMock = jest.fn().mockResolvedValue({ data: null, error: null });
const supabaseSelectMock = jest.fn().mockResolvedValue({ data: mockSession, error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: supabaseSelectMock,
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: supabaseInsertMock,
        })),
      })),
      update: jest.fn(() => ({
        eq: supabaseUpdateMock,
      })),
    })),
  },
}));

// Mock HealthKit
NativeModules.AppleHealthKit = { saveWorkout: jest.fn((_opts: any, _cb: any) => {}) };

import WorkoutPreviewScreen from '@/app/(app)/workout-preview';

describe('WorkoutPreviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders session label and exercises in idle state', async () => {
    const { findByText } = render(<WorkoutPreviewScreen />);
    expect(await findByText(/lower body/i)).toBeTruthy();
    expect(await findByText(/squat/i)).toBeTruthy();
    expect(await findByText(/deadlift/i)).toBeTruthy();
  });

  it('shows timer when LET\'S GO is pressed', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    expect(getByText('00:00')).toBeTruthy();
  });

  it('shows PAUSE and STOP buttons in active state', async () => {
    const { findByText, getByText, getByRole } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    expect(getByText('PAUSE')).toBeTruthy();
    expect(getByText('STOP')).toBeTruthy();
  });

  it('advances timer after 1 second', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(getByText('00:01')).toBeTruthy();
  });

  it('freezes timer on PAUSE and shows RESUME', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(5000); });
    fireEvent.press(getByText('PAUSE'));
    const timerAtPause = getByText('00:05').props.children;
    act(() => { jest.advanceTimersByTime(3000); });
    // Timer should not have advanced
    expect(getByText('00:05')).toBeTruthy();
    expect(getByText('RESUME')).toBeTruthy();
  });

  it('saves activity and updates planned session on stop + confirm', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons: any) => {
      const confirm = buttons?.find((b: any) => b.style !== 'cancel');
      confirm?.onPress?.();
    });

    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(10000); });
    fireEvent.press(getByText('STOP'));

    await waitFor(() => {
      expect(NativeModules.AppleHealthKit.saveWorkout).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TraditionalStrengthTraining' }),
        expect.any(Function),
      );
      expect(supabaseInsertMock).toHaveBeenCalled();
      expect(supabaseUpdateMock).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/components/WorkoutPreview.test.tsx --no-coverage
```

Expected: failures (module not found for `workout-preview`).

- [ ] **Step 3: Create `workout-preview.tsx`**

Create `mobile/app/(app)/workout-preview.tsx`:

```tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, Alert,
  NativeModules, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo } from '@/lib/cycleEngine';
import { cancelTrainingReminderToday } from '@/lib/notifications';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { formatPace } from '@/lib/volumePlan';
import type {
  RunWorkoutStructure,
  StrengthWorkoutStructure,
} from '@/lib/workoutStructure';

type ScreenState = 'loading' | 'idle' | 'active' | 'paused';

const HK_TYPE: Record<string, string> = {
  strength: 'TraditionalStrengthTraining',
  yoga:     'Yoga',
  swim:     'Swimming',
  other:    'FunctionalStrengthTraining',
};

const MODALITY_ICON: Record<string, any> = {
  strength: 'dumbbell.fill',
  yoga:     'figure.mind.and.body',
  swim:     'figure.pool.swim',
  other:    'figure.mixed.cardio',
};

interface SessionData {
  id:                       string;
  session_label:            string;
  modality:                 string;
  run_structure:            RunWorkoutStructure | null;
  strength_structure:       StrengthWorkoutStructure | null;
  cycle_reason_short:       string | null;
  cycle_adjusted_pace_secs: number | null;
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildStepLines(session: SessionData): string[] {
  if (session.strength_structure) {
    return session.strength_structure.exercises.map(
      (e) => `${e.name}  ·  ${e.target_sets.length} × ${e.target_sets[0].reps} reps`,
    );
  }
  if (session.run_structure) {
    return session.run_structure.steps.map((step) => {
      const dist = step.target.distance_m ? `${(step.target.distance_m / 1000).toFixed(1)}km` : '';
      const pace = step.target.pace_secs_per_km ? `@ ${formatPace(step.target.pace_secs_per_km)}` : step.target.pace_band ?? '';
      return [step.label ?? step.kind, dist, pace].filter(Boolean).join('  ·  ');
    });
  }
  return [];
}

export default function WorkoutPreviewScreen() {
  const { sessionId }    = useLocalSearchParams<{ sessionId?: string }>();
  const { session }      = useAuthStore();
  const { cycleInfo }    = useCycleStore();

  const [state,        setState]        = useState<ScreenState>('loading');
  const [sessionData,  setSessionData]  = useState<SessionData | null>(null);
  const [elapsedS,     setElapsedS]     = useState(0);
  const [saving,       setSaving]       = useState(false);

  const startedAt       = useRef<Date | null>(null);
  const pausedAt        = useRef<number | null>(null);
  const pausedDurationMs = useRef(0);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId) { setState('idle'); return; }
    supabase
      .from('planned_sessions')
      .select('id, session_label, modality, run_structure, strength_structure, cycle_reason_short, cycle_adjusted_pace_secs')
      .eq('id', sessionId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setSessionData(data as SessionData);
        setState('idle');
      });
  }, [sessionId]);

  function startTimer() {
    startedAt.current = new Date();
    pausedDurationMs.current = 0;
    setState('active');
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current!.getTime() - pausedDurationMs.current;
      setElapsedS(Math.floor(elapsed / 1000));
    }, 1000);
  }

  function handlePause() {
    if (timerRef.current) clearInterval(timerRef.current);
    pausedAt.current = Date.now();
    setState('paused');
  }

  function handleResume() {
    if (pausedAt.current) {
      pausedDurationMs.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current!.getTime() - pausedDurationMs.current;
      setElapsedS(Math.floor(elapsed / 1000));
    }, 1000);
    setState('active');
  }

  function handleStop() {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalSeconds = elapsedS;
    Alert.alert(
      'End session?',
      `${formatElapsed(finalSeconds)} recorded.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => {
          // Resume timer so user can continue
          setState('active');
          timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startedAt.current!.getTime() - pausedDurationMs.current;
            setElapsedS(Math.floor(elapsed / 1000));
          }, 1000);
        }},
        { text: 'End session', onPress: () => saveSession(finalSeconds) },
      ],
    );
  }

  async function saveSession(durationSeconds: number) {
    if (!session || !startedAt.current) return;
    setSaving(true);

    const modality    = sessionData?.modality ?? 'other';
    const startDate   = startedAt.current.toISOString();
    const endDate     = new Date(startedAt.current.getTime() + durationSeconds * 1000 + pausedDurationMs.current).toISOString();
    const phaseAtTime = cycleInfo?.phase ?? null;

    // HealthKit write — fire and forget; failure is non-blocking
    const HK = NativeModules.AppleHealthKit;
    if (HK?.saveWorkout) {
      HK.saveWorkout(
        { type: HK_TYPE[modality] ?? 'FunctionalStrengthTraining', startDate, endDate, duration: durationSeconds },
        () => {},
      );
    }

    // Insert activity
    const { data: act, error: actErr } = await supabase
      .from('activities')
      .insert({
        user_id:          session.user.id,
        activity_type:    modality,
        started_at:       startDate,
        duration_seconds: durationSeconds,
        phase_at_time:    phaseAtTime,
        planned_session_id: sessionId ?? null,
      })
      .select('id')
      .single();

    if (actErr) {
      Alert.alert('Save failed', actErr.message + ' — tap Stop again to retry.');
      setSaving(false);
      setState('paused');
      return;
    }

    // Mark planned session completed
    if (sessionId) {
      await supabase
        .from('planned_sessions')
        .update({ status: 'completed', activity_id: act.id })
        .eq('id', sessionId);
    }

    cancelTrainingReminderToday();
    setSaving(false);
    router.back();
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const label    = sessionData ? sessionData.session_label.charAt(0).toUpperCase() + sessionData.session_label.slice(1).toLowerCase() : '';
  const modality = sessionData?.modality ?? 'other';
  const steps    = sessionData ? buildStepLines(sessionData) : [];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>
          {label || 'Workout'}
        </VirraText>
        <View style={s.headerBtn} />
      </View>

      {state === 'loading' && (
        <View style={s.centred}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {(state === 'idle') && (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Session identity */}
          <VirraCard style={{ gap: spacing.sm }}>
            <View style={s.sessionRow}>
              <SymbolView name={MODALITY_ICON[modality] ?? 'figure.mixed.cardio'} size={28} tintColor={colors.dawn} />
              <View>
                <VirraText variant="display" size={20} color={colors.breath}>{label}</VirraText>
                <VirraText variant="mono" size={11} color={colors.muted}>{modality.toUpperCase()}</VirraText>
              </View>
            </View>
            {sessionData?.cycle_reason_short && (
              <VirraText variant="mono" size={11} color={colors.pulse}>
                {sessionData.cycle_adjusted_pace_secs
                  ? `${formatPace(sessionData.cycle_adjusted_pace_secs)} · `
                  : ''}
                {sessionData.cycle_reason_short.toLowerCase()}
              </VirraText>
            )}
          </VirraCard>

          {/* Structure steps */}
          {steps.length > 0 && (
            <VirraCard style={{ gap: spacing.xs, marginTop: spacing.md }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>WORKOUT</VirraText>
              {steps.map((line, i) => (
                <View key={i} style={s.stepRow}>
                  <VirraText variant="mono" size={12} color="rgba(244,237,224,0.45)" style={{ width: 20 }}>{i + 1}</VirraText>
                  <VirraText variant="mono" size={12} color={colors.breath}>{line}</VirraText>
                </View>
              ))}
            </VirraCard>
          )}

          {/* CTA */}
          <Pressable style={s.ctaBtn} onPress={startTimer} accessibilityRole="button">
            <SymbolView name="play.fill" size={15} tintColor={colors.mile} />
            <VirraText variant="display" size={15} color={colors.mile} style={{ letterSpacing: 1.5 }}>LET'S GO</VirraText>
          </Pressable>
        </ScrollView>
      )}

      {(state === 'active' || state === 'paused') && (
        <View style={s.timerContainer}>
          {/* Timer display */}
          <VirraText variant="display" size={72} color={state === 'paused' ? colors.muted : colors.breath} style={s.timerText}>
            {formatElapsed(elapsedS)}
          </VirraText>
          {state === 'paused' && (
            <VirraText variant="mono" size={12} color={colors.dawn} style={{ letterSpacing: 2, marginTop: -spacing.sm }}>PAUSED</VirraText>
          )}

          {/* Reference steps */}
          {steps.length > 0 && (
            <ScrollView style={s.timerSteps} contentContainerStyle={{ gap: spacing.xs }}>
              {steps.map((line, i) => (
                <VirraText key={i} variant="mono" size={11} color="rgba(244,237,224,0.4)">{line}</VirraText>
              ))}
            </ScrollView>
          )}

          {/* Controls */}
          <View style={s.controls}>
            {state === 'active' ? (
              <Pressable style={[s.controlBtn, s.pauseBtn]} onPress={handlePause} accessibilityRole="button">
                <VirraText variant="display" size={14} color={colors.breath} style={{ letterSpacing: 1.5 }}>PAUSE</VirraText>
              </Pressable>
            ) : (
              <Pressable style={[s.controlBtn, s.resumeBtn]} onPress={handleResume} accessibilityRole="button">
                <VirraText variant="display" size={14} color={colors.mile} style={{ letterSpacing: 1.5 }}>RESUME</VirraText>
              </Pressable>
            )}
            <Pressable style={[s.controlBtn, s.stopBtn]} onPress={handleStop} disabled={saving} accessibilityRole="button">
              {saving
                ? <ActivityIndicator color={colors.breath} size="small" />
                : <VirraText variant="display" size={14} color={colors.breath} style={{ letterSpacing: 1.5 }}>STOP</VirraText>}
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.mile },
  header:        { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:     { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  centred:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:        { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  sessionRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ctaBtn: {
    marginTop:       spacing.lg,
    backgroundColor: colors.pulse,
    borderRadius:    radius.sm,
    paddingVertical: spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.xs,
  },
  timerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.lg },
  timerText:      { lineHeight: 80 },
  timerSteps:     { maxHeight: 120, width: '100%' },
  controls:       { flexDirection: 'row', gap: spacing.md, width: '100%' },
  controlBtn:     { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  pauseBtn:       { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border },
  resumeBtn:      { backgroundColor: colors.pulse },
  stopBtn:        { backgroundColor: 'rgba(255,46,126,0.18)', borderWidth: 1, borderColor: colors.heat },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/components/WorkoutPreview.test.tsx --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/workout-preview.tsx" \
        "mobile/__tests__/components/WorkoutPreview.test.tsx"
git commit -m "feat(workout-preview): timer screen with HealthKit write for non-run sessions"
```

---

## Task 5 — Smoke test (manual)

> No automated test covers full navigation on-device. Run the app and verify end-to-end.

- [ ] **Step 1: Start the dev server (clear cache — new route added)**

```bash
cd mobile && npx expo start --clear
```

- [ ] **Step 2: Verify run-day flow**

With a planned run session for today:
1. Dashboard play button shows `START RUN`
2. Tapping it opens the run tracker screen
3. Complete a short test run; verify the activity appears in the timeline and the planned session shows `DONE` on the dashboard hero

- [ ] **Step 3: Verify strength-day flow**

With a planned strength session for today:
1. Dashboard play button shows `START SESSION`
2. Tapping it opens the workout preview screen
3. Session label, exercises, and any cycle guidance are visible
4. Tap `LET'S GO` — timer starts at `00:00` and counts up
5. Pause → timer freezes; Resume → timer continues
6. Stop → confirm dialog → activity saved; return to dashboard; session shows `DONE`

- [ ] **Step 4: Verify multi-session day flow**

With both a run and a strength session planned for today:
1. Dashboard play button shows `START SESSION →`
2. Tapping it shows an ActionSheet with two labelled options + Cancel
3. Selecting the run option → run tracker
4. Selecting the strength option → workout preview

- [ ] **Step 5: Verify no regression on training tab**

The session hero on the Training tab (no `onStartPress` prop) should render exactly as before — no button visible.
