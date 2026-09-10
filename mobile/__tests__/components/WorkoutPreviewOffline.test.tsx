import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'ps-1' }),
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/store/cycle', () => ({ useCycleStore: () => ({ cycleInfo: null }) }));
jest.mock('@/lib/notifications', () => ({
  cancelTrainingReminderToday: jest.fn(),
  scheduleRestComplete: jest.fn(),
  cancelRestComplete: jest.fn(),
}));
jest.mock('@/lib/strengthHistory', () => ({ getLastLoggedWeights: jest.fn().mockRejectedValue(new Error('offline')) }));
jest.mock('@/lib/exerciseSettings', () => ({
  getExerciseSettings: jest.fn().mockRejectedValue(new Error('offline')),
  DEFAULT_LOAD_TYPE: 'weighted',
}));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

// Every network read fails, which is the whole point: this is a gym basement.
jest.mock('@/lib/supabase', () => {
  const offline = { data: null, error: { message: 'Network request failed' } };
  // .eq() has to be chainable: the screen filters symptom_logs on user AND
  // date, so a mock that only supports one .eq() makes a perfectly normal
  // two-filter query look like a product bug.
  const eqResult: () => Record<string, unknown> = () => ({
    eq:          jest.fn(eqResult),
    single:      jest.fn().mockResolvedValue(offline),
    maybeSingle: jest.fn().mockResolvedValue(offline),
  });
  const from = jest.fn(() => ({
    select: jest.fn(() => ({ eq: jest.fn(eqResult) })),
    update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue(offline) })),
    upsert: jest.fn().mockResolvedValue(offline),
    delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue(offline) })),
  }));
  return { supabase: { from } };
});

const mockById: Record<string, unknown> = {};
jest.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => ({ byId: mockById }) },
}));

const CACHED_ROW = {
  id: 'ps-1',
  scheduled_date: '2026-09-10',
  modality: 'strength',
  session_label: 'Lower Body',
  status: 'planned',
  block_id: null,
  activity_id: null,
  moved_to_id: null,
  week_number: 3,
  day_of_week: 4,
  strength_structure: {
    version: 1,
    session_type: 'lower',
    exercises: [
      { id: 'e1', name: 'Goblet Squat', primary_muscles: ['quads'], target_sets: [{ reps: 8 }], rest_seconds: 90 },
    ],
  },
};

import WorkoutPreviewScreen from '@/app/(app)/workout-preview';

/**
 * Card 258. `workout-preview` handled its query inside `if (!error && data)`
 * with nothing after it, so with no signal the screen never populated and said
 * nothing at all. Card 253 made FINISHING a workout work offline; starting it
 * was still impossible, and failed silently.
 */
describe('starting a workout with no signal', () => {
  beforeEach(() => { for (const k of Object.keys(mockById)) delete mockById[k]; });

  it('falls back to the session the store already holds', async () => {
    mockById['ps-1'] = CACHED_ROW;

    const { getByText, queryByText } = render(<WorkoutPreviewScreen />);

    // The session opens from cache, with its exercises.
    await waitFor(() => expect(getByText(/Goblet Squat/i)).toBeTruthy());
    // And says where it came from, so a stale structure is explainable.
    expect(getByText(/OFFLINE/)).toBeTruthy();
    expect(queryByText(/Could not open this session/i)).toBeNull();
  });

  it('says so when neither the network nor the phone has it', async () => {
    // Store empty: this session was never loaded while there was signal.
    const { getByText } = render(<WorkoutPreviewScreen />);

    await waitFor(() => expect(getByText(/Could not open this session/i)).toBeTruthy());
  });
});
