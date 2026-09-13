import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  // Stack.Screen has to exist: the layout renders four of them, and a mock
  // without it throws during render, which looks exactly like the routing bug
  // this file is meant to catch.
  const Stack = () => null;
  (Stack as unknown as { Screen: () => null }).Screen = () => null;
  return { router: { replace: (...a: unknown[]) => mockReplace(...a) }, Stack };
});

// Fonts are not what this test is about, and a pending font load would gate
// routing just as surely as a pending session.
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync:            jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/revenuecat', () => ({ configureRevenueCat: jest.fn() }));
// Pulled in for its side effect of registering a background task, which needs a
// native module the test environment has no business providing.
jest.mock('@/lib/backgroundLocationTask', () => ({}));
jest.mock('@/lib/sentry', () => ({ initSentry: jest.fn() }));
jest.mock('@/components/ui/VirraAlert', () => ({ VirraAlertHost: () => null, appAlert: jest.fn() }));
jest.mock('@/lib/permissionsConfig', () => ({
  getPostAuthRoute: jest.fn().mockResolvedValue('/(app)/(tabs)'),
}));

const mockGetSession = jest.fn();
const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
    }),
  },
}));

const KEY = 'sb-elebuieojodsjmghwjub-auth-token';
const SESSION = { access_token: 'a', user: { id: 'user-1' } };

import RootLayout from '@/app/_layout';

/**
 * Card 283, the two faults Emma hit: the app not opening with no signal, and an
 * offline user being sent to onboarding as though her account were gone.
 */
describe('launching with no signal', () => {
  beforeEach(async () => {
    jest.useRealTimers();
    mockReplace.mockClear();
    await AsyncStorage.clear();
    mockMaybeSingle.mockResolvedValue({ data: { id: 'user-1' }, error: null });
  });

  it('opens on the persisted session when getSession rejects', async () => {
    // The exact offline failure: the stored JWT needs refreshing, the refresh
    // cannot reach the network, and the promise rejects. This used to leave the
    // splash up forever because there was no catch.
    await AsyncStorage.setItem(KEY, JSON.stringify(SESSION));
    mockGetSession.mockRejectedValue(new Error('Network request failed'));

    render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)');
  });

  it('does not send an offline user to onboarding when the profile read fails', async () => {
    // A failed query and "no such profile" both arrive as data: null. Treating
    // the first as the second told a signed-in woman to start onboarding, which
    // reads as her account having been deleted.
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(onboarding)/welcome');
  });

  it('still sends a genuinely new user to onboarding', async () => {
    // The other half of the same branch: a SUCCESSFUL query that found nothing
    // is real evidence of no profile, and must still route to onboarding.
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/welcome'));
  });

  it('opens on the persisted session when getSession never settles at all', async () => {
    // A hang rather than a rejection: no catch can save this one, only the
    // timeout. This is the case that produced a permanently dark screen.
    await AsyncStorage.setItem(KEY, JSON.stringify(SESSION));
    mockGetSession.mockReturnValue(new Promise(() => {}));

    jest.useFakeTimers();
    render(<RootLayout />);
    await act(async () => { jest.advanceTimersByTime(5000); });
    jest.useRealTimers();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)'));
  });

  it('sends a signed-out user to auth, offline or not', async () => {
    // Nothing persisted and nothing returned: genuinely signed out.
    mockGetSession.mockRejectedValue(new Error('Network request failed'));

    render(<RootLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)'));
  });
});
