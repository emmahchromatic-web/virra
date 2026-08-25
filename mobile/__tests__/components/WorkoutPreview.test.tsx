import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert, NativeModules } from 'react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'ps-1' }),
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: () => ({ cycleInfo: null }),
}));

jest.mock('@/lib/notifications', () => ({
  cancelTrainingReminderToday: jest.fn(),
}));

jest.mock('@/lib/strengthHistory', () => ({
  getLastLoggedWeights: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/exerciseSettings', () => ({
  getExerciseSettings: jest.fn().mockResolvedValue({}),
  DEFAULT_LOAD_TYPE: 'weighted',
}));

jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

// A strength session using real exercise-library names so getExerciseMeta
// returns tempo/description content.
const STRENGTH_ROW = {
  id: 'ps-1',
  session_label: 'Lower Body',
  modality: 'strength',
  strength_structure: {
    version: 1,
    session_type: 'lower',
    exercises: [
      { id: 'e1', name: 'Goblet Squat', primary_muscles: ['quads'],      target_sets: [{ reps: 8 }, { reps: 8 }], rest_seconds: 90  },
      { id: 'e2', name: 'Deadlift',     primary_muscles: ['hamstrings'], target_sets: [{ reps: 6 }],              rest_seconds: 120 },
    ],
    estimated_minutes: 45,
  },
  run_structure: null,
  cycle_reason_short: null,
  cycle_adjusted_pace_secs: null,
};

// A v2 (authored) session with a timed hold, so the logger offers a timer
// rather than expecting a number typed into the reps box.
const HOLD_ROW = {
  id: 'ps-1',
  session_label: 'Full Body',
  modality: 'strength',
  strength_structure: {
    version: 2,
    session_type: 'general',
    deload_note: null,
    sections: [
      {
        section: 'power_core',
        label:   'Power & Core',
        exercises: [
          { name: 'Hollow Hold', description: null, tempo: null, rest: '1 min', sets: 2, reps: '20-40 sec' },
        ],
      },
    ],
    estimated_minutes: 20,
  },
  run_structure: null,
  cycle_reason_short: null,
  cycle_adjusted_pace_secs: null,
};

const YOGA_ROW = {
  id: 'ps-1',
  session_label: 'Flow',
  modality: 'yoga',
  strength_structure: null,
  run_structure: null,
  cycle_reason_short: null,
  cycle_adjusted_pace_secs: null,
};

jest.mock('@/lib/supabase', () => {
  const mockSelectSingle = jest.fn();
  const mockUpdateEq     = jest.fn().mockResolvedValue({ data: null, error: null });
  const mockSelect = jest.fn(() => ({
    eq: jest.fn(() => ({ single: mockSelectSingle })),
  }));
  const inserts: Record<string, unknown[]> = {};
  const from = jest.fn((table: string) => ({
    select: mockSelect,
    insert: jest.fn((payload: unknown) => {
      (inserts[table] ||= []).push(payload);
      const result = { data: table === 'activities' ? { id: 'act-1' } : null, error: null };
      // Both awaitable (bare .insert(rows)) and chainable (.select().single()).
      return {
        select: () => ({ single: () => Promise.resolve(result) }),
        then: (resolve: (r: unknown) => void) => resolve(result),
      };
    }),
    update: jest.fn(() => ({ eq: mockUpdateEq })),
  }));
  return {
    supabase:       { from },
    __selectSingle: mockSelectSingle,
    __updateEq:     mockUpdateEq,
    __select:       mockSelect,
    __inserts:      inserts,
  };
});

NativeModules.AppleHealthKit = { saveWorkout: jest.fn((_opts: any, _cb: any) => {}) };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');

import WorkoutPreviewScreen from '@/app/(app)/workout-preview';

function clearInserts() {
  for (const k of Object.keys(supabaseMock.__inserts)) delete supabaseMock.__inserts[k];
}

describe('WorkoutPreviewScreen — strength logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearInserts();
    supabaseMock.__selectSingle.mockResolvedValue({ data: STRENGTH_ROW, error: null });
    supabaseMock.__updateEq.mockResolvedValue({ data: null, error: null });
  });

  it('renders session label and exercises in idle state', async () => {
    const { findByText } = render(<WorkoutPreviewScreen />);
    expect(await findByText(/lower body/i)).toBeTruthy();
    expect(await findByText(/goblet squat/i)).toBeTruthy();
    expect(await findByText(/deadlift/i)).toBeTruthy();
  });

  it('only selects columns that exist on planned_sessions', async () => {
    // Regression: selecting the runtime-computed cycle_reason_short /
    // cycle_adjusted_pace_secs errored the query, leaving every non-run
    // session stuck on a bare timer with no exercises.
    const { findByText } = render(<WorkoutPreviewScreen />);
    await findByText(/lower body/i);
    const selectArg = supabaseMock.__select.mock.calls[0][0] as string;
    expect(selectArg).not.toMatch(/cycle_reason_short/);
    expect(selectArg).not.toMatch(/cycle_adjusted_pace_secs/);
    expect(selectArg).toMatch(/strength_structure/);
  });

  it('shows per-set rep/weight inputs and exercise info once started', async () => {
    const { findByText, getAllByPlaceholderText, queryByLabelText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    // Goblet Squat has 2 target sets, Deadlift 1 → 3 weight inputs; 2 reps@8.
    expect(getAllByPlaceholderText('0').length).toBe(3);                 // weight (kg) fields
    expect(getAllByPlaceholderText('8').length).toBe(2);                 // Goblet Squat target reps
    expect(queryByLabelText('Goblet Squat description')).toBeTruthy();   // (i) button → meta resolved
    expect(await findByText('END WORKOUT')).toBeTruthy();
  });

  it('confirms before discarding a workout in progress, but backs out freely when idle', async () => {
    const { appAlert }   = require('@/components/ui/VirraAlert');
    const { router }     = require('expo-router');

    const { findByText, getByLabelText } = render(<WorkoutPreviewScreen />);
    await findByText(/lower body/i);

    // Idle: the chevron is a plain back.
    fireEvent.press(getByLabelText('Close'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(appAlert).not.toHaveBeenCalled();

    // Mid-workout: the chevron must ask first.
    fireEvent.press(await findByText(/let's go/i));
    fireEvent.press(getByLabelText('Close'));
    expect(router.back).toHaveBeenCalledTimes(1);          // still 1 — nothing discarded yet
    expect(appAlert).toHaveBeenCalledTimes(1);

    const buttons  = (appAlert as jest.Mock).mock.calls[0][2];
    const discard  = buttons.find((b: any) => b.style === 'destructive');
    expect(buttons.some((b: any) => b.style === 'cancel')).toBe(true);
    discard.onPress();
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it('starts the authored rest when a set is ticked, and skip dismisses it', async () => {
    const { findByText, getByLabelText, queryByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    expect(queryByText('RESTING')).toBeNull();

    // Goblet Squat carries 90s rest in the fixture.
    fireEvent.press(getByLabelText('Complete Goblet Squat set 1'));
    expect(await findByText('RESTING')).toBeTruthy();
    // Full 90s on the clock, and the bar names the movement you just finished.
    expect(getByLabelText('Resting, 1:30 remaining')).toBeTruthy();

    fireEvent.press(getByLabelText('Skip rest'));
    expect(queryByText('RESTING')).toBeNull();
  });

  it('does not start a rest when a set is un-ticked', async () => {
    const { findByText, getByLabelText, queryByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    fireEvent.press(getByLabelText('Complete Goblet Squat set 1'));   // tick
    fireEvent.press(getByLabelText('Skip rest'));                     // dismiss
    fireEvent.press(getByLabelText('Complete Goblet Squat set 1'));   // untick

    expect(queryByText('RESTING')).toBeNull();
  });

  it('hides the weight field on movements that never take a load', async () => {
    const { getExerciseSettings } = require('@/lib/exerciseSettings');
    getExerciseSettings.mockResolvedValueOnce({
      'Goblet Squat': { loadType: 'none',     defaultTempo: null },
      Deadlift:       { loadType: 'none',     defaultTempo: null },
    });

    const { findByText, queryAllByPlaceholderText, queryByText, queryByLabelText } =
      render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    await waitFor(() => expect(queryAllByPlaceholderText('0').length).toBe(0));   // no kg fields
    expect(queryByText('KG')).toBeNull();                                          // no kg column header
    expect(queryByLabelText('Add weight to Goblet Squat')).toBeNull();             // and nothing to reveal
    expect(queryAllByPlaceholderText('8').length).toBe(2);                         // reps still there
  });

  it('offers the weight field on bodyweight movements people load, and reveals it on tap', async () => {
    const { getExerciseSettings } = require('@/lib/exerciseSettings');
    getExerciseSettings.mockResolvedValueOnce({
      'Goblet Squat': { loadType: 'optional', defaultTempo: null },
      Deadlift:       { loadType: 'none',     defaultTempo: null },
    });

    const { findByText, queryAllByPlaceholderText, getByLabelText, queryByLabelText } =
      render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    const addWeight = await waitFor(() => getByLabelText('Add weight to Goblet Squat'));
    expect(queryAllByPlaceholderText('0').length).toBe(0);   // hidden until asked for

    fireEvent.press(addWeight);

    // Goblet Squat has 2 sets, so revealing gives 2 kg fields. Deadlift is
    // 'none' and stays without one.
    expect(queryAllByPlaceholderText('0').length).toBe(2);
    expect(queryByLabelText('Add weight to Goblet Squat')).toBeNull();
  });

  it('keeps the weight field on loaded movements, and when the lookup fails', async () => {
    const { getExerciseSettings } = require('@/lib/exerciseSettings');
    getExerciseSettings.mockResolvedValueOnce({});   // as if the query errored

    const { findByText, getAllByPlaceholderText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    // Falls back to showing kg on all three sets, i.e. the old behaviour.
    expect(getAllByPlaceholderText('0').length).toBe(3);
  });

  it('shows the exercise-level tempo when there is one, and the authored tempo otherwise', async () => {
    const { getExerciseSettings } = require('@/lib/exerciseSettings');
    // Goblet Squat's library tempo is 3-0-1; a corrected exercise-level tempo
    // must win, without the session being rescheduled.
    getExerciseSettings.mockResolvedValueOnce({
      'Goblet Squat': { loadType: 'weighted', defaultTempo: '2-1-2-1' },
      Deadlift:       { loadType: 'weighted', defaultTempo: null },
    });

    const { findByText, queryByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    // The tempo renders as "TEMPO <value>" in one node, so match on a fragment.
    await waitFor(() => expect(queryByText(/TEMPO 2·1·2·1/)).toBeTruthy());
    expect(queryByText(/TEMPO 3·0·1/)).toBeNull();     // the stale authored tempo is gone
  });

  it('offers a timer on a timed hold, and logs the seconds held', async () => {
    supabaseMock.__selectSingle.mockResolvedValue({ data: HOLD_ROW, error: null });
    jest.useFakeTimers();
    try {
      const { findByText, getByLabelText, queryByText } = render(<WorkoutPreviewScreen />);
      fireEvent.press(await findByText(/let's go/i));

      // The prescription is shown on the control rather than typed into a box.
      expect(queryByText(/TIME THIS HOLD/)).toBeTruthy();
      expect(queryByText(/20-40 SEC/)).toBeTruthy();

      fireEvent.press(getByLabelText('Time Hollow Hold'));
      act(() => { jest.advanceTimersByTime(24_000); });
      // eslint-disable-next-line no-console
      expect(queryByText(/^0:24\s+·\s+TAP TO STOP$/)).toBeTruthy();

      fireEvent.press(getByLabelText('Stop timing Hollow Hold'));

      // 24 seconds recorded against set 1, and the set ticked off.
      expect(queryByText(/TAP TO STOP/)).toBeNull();
      expect(getByLabelText('Complete Hollow Hold set 1')).toBeTruthy();
    } finally {
      jest.useRealTimers();
      supabaseMock.__selectSingle.mockResolvedValue({ data: STRENGTH_ROW, error: null });
    }
  });

  it('stops a hold by itself at the top of the range', async () => {
    supabaseMock.__selectSingle.mockResolvedValue({ data: HOLD_ROW, error: null });
    jest.useFakeTimers();
    try {
      const { findByText, getByLabelText, queryByText } = render(<WorkoutPreviewScreen />);
      fireEvent.press(await findByText(/let's go/i));
      fireEvent.press(getByLabelText('Time Hollow Hold'));

      // Past the 40s top of the range: it should have stopped on its own.
      act(() => { jest.advanceTimersByTime(45_000); });
      expect(queryByText(/TAP TO STOP/)).toBeNull();
    } finally {
      jest.useRealTimers();
      supabaseMock.__selectSingle.mockResolvedValue({ data: STRENGTH_ROW, error: null });
    }
  });

  it('leaves rep-counted exercises with a plain numeric box and no timer', async () => {
    const { findByText, queryByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    expect(queryByText(/TIME THIS HOLD/)).toBeNull();
  });

  it('finishing writes activity, per-set logs, strength details and marks the session done', async () => {
    const { findByText, getByLabelText, getByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));

    // Complete the first set (fills reps to target) then finish.
    fireEvent.press(getByLabelText('Complete Goblet Squat set 1'));
    fireEvent.press(getByText('END WORKOUT'));

    // RPE sheet
    fireEvent.press(await findByText('SAVE SESSION'));

    await waitFor(() => {
      expect(supabaseMock.__inserts.activities?.length).toBe(1);
      expect(supabaseMock.__inserts.strength_set_logs?.length).toBe(1); // one insert call...
      expect((supabaseMock.__inserts.strength_set_logs[0] as unknown[]).length).toBe(1); // ...with one set row
      expect(supabaseMock.__inserts.strength_details?.length).toBe(1);
      expect(supabaseMock.__updateEq).toHaveBeenCalled(); // planned session marked completed
    });

    const setRow = (supabaseMock.__inserts.strength_set_logs[0] as any[])[0];
    expect(setRow).toMatchObject({ exercise_name: 'Goblet Squat', set_index: 0, target_reps: 8, actual_reps: 8 });
  });
});

describe('WorkoutPreviewScreen — timer-only (no structure)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearInserts();
    supabaseMock.__selectSingle.mockResolvedValue({ data: YOGA_ROW, error: null });
    supabaseMock.__updateEq.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows timer and PAUSE/STOP when started', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    expect(getByText('00:00')).toBeTruthy();
    expect(getByText('PAUSE')).toBeTruthy();
    expect(getByText('STOP')).toBeTruthy();
  });

  it('advances the timer and freezes on PAUSE', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(5000); });
    fireEvent.press(getByText('PAUSE'));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(getByText('00:05')).toBeTruthy();
    expect(getByText('RESUME')).toBeTruthy();
  });

  it('saves a duration-only activity on stop + confirm', async () => {
    // The confirm is the themed dialog now, so drive that instead of Alert.
    // mockImplementationOnce keeps it scoped to this stop, so the tests that
    // assert on appAlert being called do not start auto-confirming.
    const { appAlert } = require('@/components/ui/VirraAlert');
    (appAlert as jest.Mock).mockImplementationOnce((_t: string, _m: string, buttons: any) => {
      buttons?.find((b: any) => b.style !== 'cancel')?.onPress?.();
    });
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    fireEvent.press(await findByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(10000); });
    fireEvent.press(getByText('STOP'));

    await waitFor(() => {
      expect(NativeModules.AppleHealthKit.saveWorkout).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Yoga' }),
        expect.any(Function),
      );
      expect(supabaseMock.__inserts.activities?.length).toBe(1);
      expect(supabaseMock.__inserts.strength_set_logs).toBeUndefined(); // no set logs for yoga
    });
  });
});
