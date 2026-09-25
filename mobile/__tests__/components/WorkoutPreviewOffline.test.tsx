import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

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
jest.mock('@/lib/strengthHistory', () => ({
  getLastLoggedWeights: jest.fn().mockRejectedValue(new Error('offline')),
  getLastLoggedHolds:   jest.fn().mockRejectedValue(new Error('offline')),
}));
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
    // The finish-workout write, exercised below: `.insert(...).select('id').single()`.
    // Rejecting it the same way every other call in this file rejects is what
    // drives `saveSession` into the offline/queue branch.
    insert: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue(offline) })) })),
  }));
  return { supabase: { from } };
});

const mockById: Record<string, unknown> = {};
// applyLocalCompletion is the thing under test below (offline-completion call
// site), so it has to be a real spy, not a no-op returned inline — the other
// two tests in this file never touch it and don't care that it now exists.
const mockApplyLocalCompletion = jest.fn();
jest.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => ({ byId: mockById, applyLocalCompletion: mockApplyLocalCompletion }) },
  // The REAL constant, not a copy of it: the `local_` prefix is the entire
  // contract between `applyLocalCompletion` (this screen) and
  // `revertLocalCompletion`/`refresh` (the store). A hardcoded literal here
  // would keep passing against its own stale copy if that contract ever moved.
  //
  // Taken from `@/store/localActivity`, where card 319 moved it: requiring the
  // actual STORE for one string drags in the network stack and the outbox, and
  // re-enters this very module while it is still initialising.
  LOCAL_ACTIVITY_PREFIX: jest.requireActual('@/store/localActivity').LOCAL_ACTIVITY_PREFIX,
}));

const { LOCAL_ACTIVITY_PREFIX } = jest.requireActual<typeof import('@/store/localActivity')>('@/store/localActivity');

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
  beforeEach(async () => {
    // This screen exercises the real workoutDrafts and outbox modules (only
    // @/lib/supabase is mocked here), which write real AsyncStorage as their
    // local-first store. Clear it so a draft or queued completion left by one
    // test doesn't leak into the next through that layer.
    await AsyncStorage.clear();
    for (const k of Object.keys(mockById)) delete mockById[k];
  });

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

/**
 * Task 5 of the J1 hardening plan. `saveSession`'s offline branch (the
 * `activities` insert fails, so the whole completion is queued to the
 * outbox) also calls `useSessionStore.getState().applyLocalCompletion(...)`
 * so the session flips to completed on-screen immediately, without waiting
 * for a drain. That call site had no test asserting on it directly — this
 * closes that gap by driving the screen through start → finish → save with
 * the same "every network call fails" mock the file already uses.
 */
describe('finishing a workout with no signal', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    for (const k of Object.keys(mockById)) delete mockById[k];
    mockApplyLocalCompletion.mockClear();
  });

  it('applies a local completion for the finished session when the write is queued offline', async () => {
    mockById['ps-1'] = CACHED_ROW;

    const { getByText } = render(<WorkoutPreviewScreen />);

    // Loads from cache (card 258's path), then start, finish and save it.
    await waitFor(() => expect(getByText(/Goblet Squat/i)).toBeTruthy());

    fireEvent.press(getByText("LET'S GO"));
    await waitFor(() => expect(getByText('END WORKOUT')).toBeTruthy());

    fireEvent.press(getByText('END WORKOUT'));
    await waitFor(() => expect(getByText('SAVE SESSION')).toBeTruthy());

    fireEvent.press(getByText('SAVE SESSION'));

    // The `activities` insert rejects (mocked offline above), which is what
    // routes `saveSession` into the queue-and-complete-locally branch.
    await waitFor(() => expect(mockApplyLocalCompletion).toHaveBeenCalledTimes(1));

    const [sessionIdArg, activityIdArg] = mockApplyLocalCompletion.mock.calls[0];
    expect(sessionIdArg).toBe('ps-1');
    // The `local_` prefix is the contract: `refresh()` preserves the row and
    // `revertLocalCompletion` is willing to undo it only while the id still
    // carries it. Asserted against the real exported constant so this screen's
    // producer output stays tied to the consumer's expectation.
    expect(typeof activityIdArg).toBe('string');
    expect(activityIdArg.startsWith(LOCAL_ACTIVITY_PREFIX)).toBe(true);
    expect(activityIdArg.length).toBeGreaterThan(LOCAL_ACTIVITY_PREFIX.length);
  });
});
