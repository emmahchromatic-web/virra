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
jest.mock('@/lib/strengthHistory', () => ({ getLastLoggedWeights: jest.fn() }));
jest.mock('@/lib/exerciseSettings', () => ({
  getExerciseSettings: jest.fn().mockResolvedValue({}), DEFAULT_LOAD_TYPE: 'weighted',
}));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

const SQUAT_ROW = {
  id: 'ps-1', session_label: 'Lower Body', modality: 'strength', week_number: 1, block_id: null,
  run_structure: null,
  strength_structure: {
    version: 1, session_type: 'lower',
    exercises: [{ id: 'e1', name: 'Goblet Squat', primary_muscles: ['quads'], target_sets: [{ reps: 8 }, { reps: 8 }], rest_seconds: 90 }],
  },
};

// An authored hold logs seconds in the reps field, so it needs a higher limit.
const HOLD_ROW = {
  id: 'ps-1', session_label: 'Full Body', modality: 'strength', week_number: 1, block_id: null,
  run_structure: null,
  strength_structure: {
    version: 2, session_type: 'general', deload_note: null, estimated_minutes: 20,
    sections: [{
      section: 'power_core', label: 'Power & Core',
      exercises: [{ name: 'Hollow Hold', description: null, tempo: null, rest: '1 min', sets: 2, reps: '20-40 sec' }],
    }],
  },
};

let mockRow: Record<string, unknown> = SQUAT_ROW;
const inserted: Record<string, unknown[]> = {};
jest.mock('@/lib/supabase', () => {
  const eqResult: () => Record<string, unknown> = () => ({
    eq:          jest.fn(eqResult),
    single:      jest.fn(() => Promise.resolve({ data: mockRow, error: null })),
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
import { appAlert } from '@/components/ui/VirraAlert';
import { getLastLoggedWeights } from '@/lib/strengthHistory';

const alertMock   = appAlert as jest.Mock;
const lastWeights = getLastLoggedWeights as jest.Mock;

async function open(lastKg: Record<string, number> = {}) {
  lastWeights.mockResolvedValue(lastKg);
  const utils = render(<WorkoutPreviewScreen />);
  fireEvent.press(await utils.findByText(/let's go/i));
  return utils;
}

/** Type a value one keystroke at a time, the way the field actually receives it. */
function typeInto(utils: ReturnType<typeof render>, label: string, text: string) {
  const input = utils.getByLabelText(label);
  input.props.value && fireEvent.changeText(input, '');
  let sofar = '';
  for (const ch of text) {
    const current = utils.getByLabelText(label).props.value ?? '';
    sofar = current + ch;
    fireEvent.changeText(utils.getByLabelText(label), sofar);
  }
}

beforeEach(() => {
  mockRow = SQUAT_ROW;
  alertMock.mockClear();
  for (const k of Object.keys(inserted)) delete inserted[k];
});

/** Card 297: limits on what a set row accepts. */
describe('set row limits', () => {
  it('stops reps at 50 and says why', async () => {
    const utils = await open();
    await waitFor(() => expect(utils.getByLabelText('Goblet Squat set 1 reps')).toBeTruthy());

    typeInto(utils, 'Goblet Squat set 1 reps', '51');
    expect(utils.getByLabelText('Goblet Squat set 1 reps').props.value).toBe('5');
    expect(utils.getByText('MAX 50 REPS')).toBeTruthy();

    // The next accepted keystroke clears the hint.
    typeInto(utils, 'Goblet Squat set 1 reps', '50');
    expect(utils.getByLabelText('Goblet Squat set 1 reps').props.value).toBe('50');
    expect(utils.queryByText('MAX 50 REPS')).toBeNull();
  });

  it('stops 2500 kg at 250 and will not take a second decimal point', async () => {
    const utils = await open();
    const label = 'Goblet Squat set 1 weight in kilograms';
    await waitFor(() => expect(utils.getByLabelText(label)).toBeTruthy());

    typeInto(utils, label, '2500');
    expect(utils.getByLabelText(label).props.value).toBe('250');
    expect(utils.getByText('MAX 250 KG')).toBeTruthy();

    typeInto(utils, label, '12.5.5');
    expect(utils.getByLabelText(label).props.value).toBe('12.55');
  });

  it('lets a hold log 90 seconds but not 301', async () => {
    mockRow = HOLD_ROW;
    const utils = await open();
    const label = 'Hollow Hold set 1 seconds';
    await waitFor(() => expect(utils.getByLabelText(label)).toBeTruthy());

    typeInto(utils, label, '90');
    expect(utils.getByLabelText(label).props.value).toBe('90');

    typeInto(utils, label, '301');
    expect(utils.getByLabelText(label).props.value).toBe('30');
    expect(utils.getByText('MAX 300 S')).toBeTruthy();
  });

  it('does not pre-fill a saved weight the field would refuse', async () => {
    const utils = await open({ 'Goblet Squat': 800 });
    const label = 'Goblet Squat set 1 weight in kilograms';
    await waitFor(() => expect(lastWeights).toHaveBeenCalled());
    await act(async () => {});
    expect(utils.getByLabelText(label).props.value).toBe('');
  });
});

describe('big jump from last time', () => {
  const W1 = 'Goblet Squat set 1 weight in kilograms';

  async function openAt40() {
    const utils = await open({ 'Goblet Squat': 40 });
    await waitFor(() => expect(utils.getByLabelText(W1).props.value).toBe('40'));
    return utils;
  }

  it('asks before ticking 85 kg, and Fix it leaves the set unlogged', async () => {
    const utils = await openAt40();
    typeInto(utils, W1, '85');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 1')); });

    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertMock.mock.calls[0];
    expect(title).toBe('More than double last time');
    expect(message).toBe('Last time you logged 40 kg for Goblet Squat. Log 85 kg?');
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Fix it', 'Log it']);

    await act(async () => { buttons[0].onPress(); });

    // Nothing was ticked, so ending saves no sets.
    await act(async () => { fireEvent.press(utils.getByText('END WORKOUT')); });
    await act(async () => { fireEvent.press(await utils.findByText('SAVE SESSION')); });
    await waitFor(() => expect(inserted['activities']).toBeTruthy());
    expect(inserted['strength_set_logs']).toBeUndefined();
  });

  it('Log it saves the weight, and a second set at that weight does not ask again', async () => {
    const utils = await openAt40();
    typeInto(utils, W1, '85');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 1')); });
    await act(async () => { alertMock.mock.calls[0][2][1].onPress(); });

    // Set 2 was pre-filled with last time's 40, so ticking set 1 does not
    // carry 85 down; the user types it again.
    typeInto(utils, 'Goblet Squat set 2 weight in kilograms', '85');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 2')); });
    expect(alertMock).toHaveBeenCalledTimes(1);

    await act(async () => { fireEvent.press(utils.getByText('END WORKOUT')); });
    await act(async () => { fireEvent.press(await utils.findByText('SAVE SESSION')); });
    await waitFor(() => expect(inserted['strength_set_logs']).toBeTruthy());
    const rows = inserted['strength_set_logs']![0] as Record<string, unknown>[];
    expect(rows.map((r) => r.weight_kg)).toEqual([85, 85]);
  });

  it('does not ask for ordinary progress, a drop, or an exercise with no history', async () => {
    let utils = await openAt40();
    typeInto(utils, W1, '50');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 1')); });
    typeInto(utils, 'Goblet Squat set 2 weight in kilograms', '20');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 2')); });
    expect(alertMock).not.toHaveBeenCalled();
    utils.unmount();

    utils = await open({});
    await waitFor(() => expect(utils.getByLabelText(W1)).toBeTruthy());
    typeInto(utils, W1, '200');
    await act(async () => { fireEvent.press(utils.getByLabelText('Complete Goblet Squat set 1')); });
    expect(alertMock).not.toHaveBeenCalled();
  });
});
