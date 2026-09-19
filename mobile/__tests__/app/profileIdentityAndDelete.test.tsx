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

// Not mounted here (only <ProfileScreen /> renders, not a <VirraAlertHost />),
// so appAlert is mocked directly to inspect what it was called with and to
// simulate pressing one of its buttons.
jest.mock('@/components/ui/VirraAlert', () => {
  const appAlert = jest.fn();
  return { appAlert, __appAlert: appAlert };
});

jest.mock('@/lib/outbox', () => {
  const readOutbox = jest.fn().mockResolvedValue([]);
  const drain      = jest.fn().mockResolvedValue({ sent: 0, left: 0, failed: 0 });
  return { readOutbox, drain, __readOutbox: readOutbox, __drain: drain };
});

jest.mock('@/store/network', () => {
  // `state` is a shared, mutable object so tests can flip `isOnline` and have
  // `useNetworkStore.getState()` (a static-property access, not a hook call,
  // from profile.tsx's non-component code) see the change immediately.
  const state = { isOnline: true };
  const useNetworkStore = Object.assign(() => state, { getState: () => state });
  return { useNetworkStore, __networkState: state };
});

jest.mock('@/store/auth', () => {
  // A stable, capturable mock so sign-out-guard tests can assert whether it
  // was called — a fresh jest.fn() per render (the old pattern) can't be
  // inspected after the fact.
  const signOut = jest.fn().mockResolvedValue(undefined);
  return {
    useAuthStore: () => ({ session: { user: { id: 'user-1', email: 'a@b.com' } }, signOut }),
    __signOut: signOut,
  };
});
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const signOut     = require('@/store/auth').__signOut;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appAlertMock = require('@/components/ui/VirraAlert').__appAlert;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const outboxMock  = require('@/lib/outbox');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const networkState = require('@/store/network').__networkState;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router');

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

describe('Profile — sign-out guard', () => {
  beforeEach(() => {
    signOut.mockClear();
    appAlertMock.mockClear();
    router.replace.mockClear();
    outboxMock.readOutbox.mockReset().mockResolvedValue([]);
    outboxMock.drain.mockReset().mockResolvedValue({ sent: 0, left: 0, failed: 0 });
    networkState.isOnline = true;
  });

  it('warns before signing out with unsynced changes, and cancelling keeps them', async () => {
    networkState.isOnline = false; // offline: drain must be skipped
    outboxMock.readOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'completeWorkout', payload: {}, createdAt: new Date().toISOString(), attempts: 0 },
    ]);

    const utils = await renderProfile();
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Sign out' })); });

    expect(outboxMock.drain).not.toHaveBeenCalled();
    expect(appAlertMock).toHaveBeenCalledTimes(1);
    const [, message, buttons] = appAlertMock.mock.calls[0];
    expect(message).toMatch(/1/);
    // Singular takes "hasn't": one change hasn't synced, several haven't.
    expect(message).toBe("1 change hasn't synced yet. Signing out will discard it.");
    expect(signOut).not.toHaveBeenCalled();

    // Cancel is a no-op: no onPress at all, so pressing it leaves the user signed in.
    const cancelBtn = buttons.find((b: { text: string }) => b.text === 'Cancel');
    cancelBtn.onPress?.();
    expect(signOut).not.toHaveBeenCalled();

    const signOutAnywayBtn = buttons.find((b: { text: string }) => b.text === 'Sign Out Anyway');
    await act(async () => { await signOutAnywayBtn.onPress(); });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(auth)');
  });

  it('uses the plural form when more than one change is waiting', async () => {
    networkState.isOnline = false;
    outboxMock.readOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'completeWorkout', payload: {}, createdAt: new Date().toISOString(), attempts: 0 },
      { id: 'ob_2', kind: 'completeWorkout', payload: {}, createdAt: new Date().toISOString(), attempts: 0 },
    ]);

    const utils = await renderProfile();
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Sign out' })); });

    const [, message] = appAlertMock.mock.calls[0];
    expect(message).toBe("2 changes haven't synced yet. Signing out will discard them.");
  });

  it('signs out immediately with no alert when the outbox is empty', async () => {
    outboxMock.readOutbox.mockResolvedValue([]);

    const utils = await renderProfile();
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Sign out' })); });

    expect(appAlertMock).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(auth)');
  });
});
