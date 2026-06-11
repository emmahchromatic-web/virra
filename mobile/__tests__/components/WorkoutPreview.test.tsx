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

jest.mock('@/lib/supabase', () => {
  const mockSelectSingle = jest.fn().mockResolvedValue({
    data: {
      id: 'ps-1',
      session_label: 'Lower Body',
      modality: 'strength',
      strength_structure: {
        version: 1,
        session_type: 'lower',
        exercises: [
          { id: 'e1', name: 'Squat',    primary_muscles: ['quads'],       target_sets: [{ reps: 8 }], rest_seconds: 90  },
          { id: 'e2', name: 'Deadlift', primary_muscles: ['hamstrings'],  target_sets: [{ reps: 6 }], rest_seconds: 120 },
        ],
        estimated_minutes: 45,
      },
      run_structure: null,
      cycle_reason_short: null,
      cycle_adjusted_pace_secs: null,
    },
    error: null,
  });
  const mockInsertSingle = jest.fn().mockResolvedValue({ data: { id: 'act-1' }, error: null });
  const mockUpdateEq    = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ single: mockSelectSingle })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({ single: mockInsertSingle })),
        })),
        update: jest.fn(() => ({
          eq: mockUpdateEq,
        })),
      })),
    },
    __selectSingle: mockSelectSingle,
    __insertSingle: mockInsertSingle,
    __updateEq:     mockUpdateEq,
  };
});

NativeModules.AppleHealthKit = { saveWorkout: jest.fn((_opts: any, _cb: any) => {}) };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');

import WorkoutPreviewScreen from '@/app/(app)/workout-preview';

describe('WorkoutPreviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    supabaseMock.__selectSingle.mockResolvedValue({
      data: {
        id: 'ps-1',
        session_label: 'Lower Body',
        modality: 'strength',
        strength_structure: {
          version: 1,
          session_type: 'lower',
          exercises: [
            { id: 'e1', name: 'Squat',    primary_muscles: ['quads'],       target_sets: [{ reps: 8 }], rest_seconds: 90  },
            { id: 'e2', name: 'Deadlift', primary_muscles: ['hamstrings'],  target_sets: [{ reps: 6 }], rest_seconds: 120 },
          ],
          estimated_minutes: 45,
        },
        run_structure: null,
        cycle_reason_short: null,
        cycle_adjusted_pace_secs: null,
      },
      error: null,
    });
    supabaseMock.__insertSingle.mockResolvedValue({ data: { id: 'act-1' }, error: null });
    supabaseMock.__updateEq.mockResolvedValue({ data: null, error: null });
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

  it("shows timer when LET'S GO is pressed", async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    expect(getByText('00:00')).toBeTruthy();
  });

  it('shows PAUSE and STOP buttons in active state', async () => {
    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
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
    act(() => { jest.advanceTimersByTime(3000); });
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
      expect(supabaseMock.__insertSingle).toHaveBeenCalled();
      expect(supabaseMock.__updateEq).toHaveBeenCalled();
    });
  });

  it('correctly saves when STOP is pressed from paused state', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons: any) => {
      const confirm = buttons?.find((b: any) => b.style !== 'cancel');
      confirm?.onPress?.();
    });

    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(5000); });
    fireEvent.press(getByText('PAUSE'));
    act(() => { jest.advanceTimersByTime(3000); }); // 3s of paused time, should not count
    fireEvent.press(getByText('STOP'));

    await waitFor(() => {
      expect(NativeModules.AppleHealthKit.saveWorkout).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TraditionalStrengthTraining', duration: 5 }),
        expect.any(Function),
      );
    });
  });

  it('resumes timer when stop alert is cancelled', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons: any) => {
      const cancel = buttons?.find((b: any) => b.style === 'cancel');
      cancel?.onPress?.();
    });

    const { findByText, getByText } = render(<WorkoutPreviewScreen />);
    await findByText(/let's go/i);
    fireEvent.press(getByText(/let's go/i));
    act(() => { jest.advanceTimersByTime(3000); });
    fireEvent.press(getByText('STOP'));
    // Timer should resume after cancel
    act(() => { jest.advanceTimersByTime(2000); });
    expect(getByText('00:05')).toBeTruthy();
  });
});
