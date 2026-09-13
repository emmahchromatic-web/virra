import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'ps-1' }),
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/store/cycle', () => ({ useCycleStore: () => ({ cycleInfo: null }) }));
jest.mock('@/lib/notifications', () => ({
  cancelTrainingReminderToday: jest.fn(), scheduleRestComplete: jest.fn(), cancelRestComplete: jest.fn(),
}));
jest.mock('@/lib/strengthHistory', () => ({ getLastLoggedWeights: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/exerciseSettings', () => ({
  getExerciseSettings: jest.fn().mockResolvedValue({}), DEFAULT_LOAD_TYPE: 'weighted',
}));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

const STRENGTH_ROW = {
  id: 'ps-1', session_label: 'Lower Body', modality: 'strength', week_number: 1, block_id: null,
  run_structure: null,
  strength_structure: {
    version: 1, session_type: 'lower',
    exercises: [{ id: 'e1', name: 'Goblet Squat', primary_muscles: ['quads'], target_sets: [{ reps: 8 }, { reps: 8 }], rest_seconds: 90 }],
  },
};

const inserted: Record<string, unknown[]> = {};
jest.mock('@/lib/supabase', () => {
  const eqResult: () => Record<string, unknown> = () => ({
    eq:          jest.fn(eqResult),
    single:      jest.fn().mockResolvedValue({ data: STRENGTH_ROW, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  });
  return {
    supabase: {
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({ eq: jest.fn(eqResult) })),
        insert: jest.fn((payload: unknown) => {
          (inserted[table] ||= []).push(payload);
          const result = { data: table === 'activities' ? { id: 'act-1' } : null, error: null };
          return { select: () => ({ single: () => Promise.resolve(result) }), then: (r: (v: unknown) => void) => r(result) };
        }),
        update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
      })),
    },
  };
});

import WorkoutPreviewScreen from '@/app/(app)/workout-preview';

/**
 * Card 285. The plan prescribes two sets of Goblet Squat; the user does three.
 * Before this there was nowhere to record the third, so she either overwrote a
 * set or lost it.
 */
describe('adding a set beyond the plan', () => {
  beforeEach(() => { for (const k of Object.keys(inserted)) delete inserted[k]; });

  async function startSession(utils: ReturnType<typeof render>) {
    fireEvent.press(await utils.findByText(/let's go/i));
    await waitFor(() => expect(utils.getByLabelText('Add another set of Goblet Squat')).toBeTruthy());
  }

  it('adds a third set and logs it alongside the prescribed two', async () => {
    const utils = render(<WorkoutPreviewScreen />);
    await startSession(utils);

    await act(async () => { fireEvent.press(utils.getByLabelText('Add another set of Goblet Squat')); });
    await waitFor(() => expect(utils.getByLabelText('Complete Goblet Squat set 3')).toBeTruthy());

    for (const i of [1, 2, 3]) {
      await act(async () => { fireEvent.press(utils.getByLabelText(`Complete Goblet Squat set ${i}`)); });
    }
    await act(async () => { fireEvent.press(utils.getByText('END WORKOUT')); });
    // Ending opens the RPE sheet; saveSession runs from inside it.
    await act(async () => { fireEvent.press(await utils.findByText('SAVE SESSION')); });

    await waitFor(() => expect(inserted['strength_set_logs']).toBeTruthy());
    const rows = (inserted['strength_set_logs']![0] as Record<string, unknown>[]);
    expect(rows).toHaveLength(3);

    // The two prescribed sets carry their target; the added one carries NULL,
    // because nothing was prescribed and 0 would claim the plan asked for none.
    expect(rows[0].target_reps).toBe(8);
    expect(rows[1].target_reps).toBe(8);
    expect(rows[2].target_reps).toBeNull();
    expect(rows[2].set_index).toBe(2);
  });

  it('lets an added set be removed again, and never offers that for a prescribed one', async () => {
    const utils = render(<WorkoutPreviewScreen />);
    await startSession(utils);

    expect(utils.queryByLabelText(/Remove extra set 1 of Goblet Squat/)).toBeNull();
    expect(utils.queryByLabelText(/Remove extra set 2 of Goblet Squat/)).toBeNull();

    await act(async () => { fireEvent.press(utils.getByLabelText('Add another set of Goblet Squat')); });
    await waitFor(() => expect(utils.getByLabelText('Remove extra set 3 of Goblet Squat')).toBeTruthy());

    await act(async () => { fireEvent.press(utils.getByLabelText('Remove extra set 3 of Goblet Squat')); });
    await waitFor(() => expect(utils.queryByLabelText('Complete Goblet Squat set 3')).toBeNull());
  });
});
