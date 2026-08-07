import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

jest.mock('@/lib/trainingBlocks', () => ({ getActiveBlocks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/healthKitWeight', () => ({
  enableWeightTracking:     jest.fn().mockResolvedValue(0),
  readWeightSyncDiagnostic: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/components/ui/BreakModal', () => ({ BreakModal: () => null }));
jest.mock('@/components/ui/WeightExplainerModal', () => ({ WeightExplainerModal: () => null }));

jest.mock('@/store/auth', () => ({
  useAuthStore: () => ({ session: { user: { id: 'user-1', email: 'a@b.com' } }, signOut: jest.fn() }),
}));
jest.mock('@/store/subscription', () => ({ useSubscriptionStore: () => ({ status: 'active' }) }));
jest.mock('@/store/cycle', () => ({
  useCycleStore: () => ({
    cycleInfo: null, periodStart: null, cycleLength: 28,
    setCycleLength: jest.fn(), setPeriodStart: jest.fn(), cycleProfile: 'hormonal',
  }),
}));

jest.mock('@/store/profile', () => {
  const save = jest.fn().mockResolvedValue(undefined);
  return {
    useProfileStore: () => ({
      firstName: 'Emma', lastName: 'Harrison', avatarUrl: null,
      stepsTarget: 8000, workoutPreference: 'gym_full',
      save, trackWeight: false,
      weightExplainerDismissedAt: null, bumpWeightDataVersion: jest.fn(),
    }),
    __save: save,
  };
});

jest.mock('@/lib/supabase', () => {
  const invoke = jest.fn().mockResolvedValue({ error: null });
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
          }),
        }),
      }),
      auth:      { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }) },
      functions: { invoke },
    },
    __invoke: invoke,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const saveProfile = require('@/store/profile').__save;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const invoke      = require('@/lib/supabase').__invoke;

import ProfileScreen from '@/app/(app)/(tabs)/profile';

async function renderProfile() {
  const utils = render(<ProfileScreen />);
  // Flush the mount effects (break lookup, training blocks) before asserting.
  await act(async () => {});
  return utils;
}

describe('Profile — identity card', () => {
  beforeEach(() => { saveProfile.mockClear(); });

  it('shows the current name', async () => {
    const utils = await renderProfile();
    expect(utils.getByText('Emma Harrison')).toBeTruthy();
  });

  // The sketch's identity card is "with ability to update both name & photo".
  // The photo was already editable; the name was display-only.
  it('opens a name editor from the identity card and saves both names', async () => {
    const utils = await renderProfile();

    fireEvent.press(utils.getByLabelText('Edit your name'));
    await waitFor(() => utils.getByPlaceholderText('First'));

    fireEvent.changeText(utils.getByPlaceholderText('First'), 'Emmeline');
    fireEvent.changeText(utils.getByPlaceholderText('Last'),  'Harrison-Smith');
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'SAVE' })); });

    expect(saveProfile).toHaveBeenCalledWith('user-1', {
      firstName: 'Emmeline', lastName: 'Harrison-Smith',
    });
  });

  it('refuses to save an empty first name', async () => {
    const utils = await renderProfile();

    fireEvent.press(utils.getByLabelText('Edit your name'));
    await waitFor(() => utils.getByPlaceholderText('First'));

    fireEvent.changeText(utils.getByPlaceholderText('First'), '   ');
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'SAVE' })); });

    expect(saveProfile).not.toHaveBeenCalled();
    expect(utils.getByText(/ENTER AT LEAST A FIRST NAME/i)).toBeTruthy();
  });
});

describe('Profile — delete account', () => {
  beforeEach(() => { invoke.mockClear(); });

  // The card asks for a second confirmation. The first step has to explain what
  // is lost and what survives before the user can reach the type-to-confirm step.
  it('explains what goes and what stays before asking to confirm', async () => {
    const utils = await renderProfile();

    fireEvent.press(utils.getByText('DELETE ACCOUNT'));
    await waitFor(() => utils.getByText(/permanently erases your Virra account/i));

    expect(utils.getByText(/stays in Apple Health/i)).toBeTruthy();
    // The destructive confirmation must not be reachable on the first step.
    expect(utils.queryByPlaceholderText('DELETE')).toBeNull();
  });

  it('requires the typed confirmation on the second step', async () => {
    const utils = await renderProfile();

    fireEvent.press(utils.getByText('DELETE ACCOUNT'));
    await waitFor(() => utils.getByRole('button', { name: 'Continue' }));
    fireEvent.press(utils.getByRole('button', { name: 'Continue' }));

    await waitFor(() => utils.getByPlaceholderText('DELETE'));
    const deleteBtn = utils.getByRole('button', { name: 'Delete my account' });

    // Wrong text must not delete anything.
    fireEvent.changeText(utils.getByPlaceholderText('DELETE'), 'delete me');
    await act(async () => { fireEvent.press(deleteBtn); });
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.changeText(utils.getByPlaceholderText('DELETE'), 'DELETE');
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Delete my account' })); });
    expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
  });

  it('lets the user step back out of the confirmation', async () => {
    const utils = await renderProfile();

    fireEvent.press(utils.getByText('DELETE ACCOUNT'));
    await waitFor(() => utils.getByRole('button', { name: 'Continue' }));
    fireEvent.press(utils.getByRole('button', { name: 'Continue' }));

    await waitFor(() => utils.getByPlaceholderText('DELETE'));
    fireEvent.press(utils.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(utils.queryByPlaceholderText('DELETE')).toBeNull());
    expect(utils.getByText(/permanently erases your Virra account/i)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
