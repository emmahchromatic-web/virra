import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton:      () => null,
  AppleAuthenticationButtonType:  { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0 },
  AppleAuthenticationScope:       { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'user-1' } }) }) }),
    })),
    auth: {
      signInWithPassword: jest.fn(),
      signInWithIdToken:  jest.fn(),
    },
  },
  // Real signature: true only for supabase-js's AuthRetryableFetchError.
  // Tests opt individual errors into "network failure" via mockReturnValueOnce.
  isAuthNetworkError: jest.fn().mockReturnValue(false),
}));

jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn() }));
jest.mock('@/store/cycle', () => ({ useCycleStore: { getState: () => ({ setPeriodStart: jest.fn() }) } }));
jest.mock('@/lib/permissionsConfig', () => ({ getPostAuthRoute: jest.fn().mockResolvedValue('/(app)/(tabs)') }));

import SignInScreen from '@/app/(auth)/sign-in';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase, isAuthNetworkError } = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { appAlert } = require('@/components/ui/VirraAlert');

/** Walk the screen to a filled-in email/password form and submit it. */
async function submitSignInForm() {
  const utils = render(<SignInScreen />);
  fireEvent.press(utils.getByRole('button', { name: 'Sign in with email instead' }));
  fireEvent.changeText(utils.getByPlaceholderText('Email'), 'runner@example.com');
  fireEvent.changeText(utils.getByPlaceholderText('Password'), 'hunter2hunter2');
  await act(async () => {
    fireEvent.press(utils.getByRole('button', { name: 'Sign in' }));
  });
  return utils;
}

describe('SignInScreen — offline copy (card 284/J3c)', () => {
  beforeEach(() => {
    router.replace.mockClear();
    supabase.auth.signInWithPassword.mockReset();
    supabase.auth.signInWithIdToken.mockReset();
    appAlert.mockClear();
    isAuthNetworkError.mockReturnValue(false);
  });

  it('shows on-brand "no signal" copy, not the raw fetch error, when email sign-in fails due to a network error', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null }, error: { message: 'Network request failed' },
    });
    isAuthNetworkError.mockReturnValue(true);

    await submitSignInForm();

    await waitFor(() => {
      expect(appAlert).toHaveBeenCalledWith('No signal', 'We couldn\'t reach the server. Check your connection and try again.');
    });
  });

  it('still shows the real error message for a genuine (non-network) sign-in failure', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null }, error: { message: 'Invalid login credentials' },
    });
    isAuthNetworkError.mockReturnValue(false);

    await submitSignInForm();

    await waitFor(() => {
      expect(appAlert).toHaveBeenCalledWith('Sign in failed', 'Invalid login credentials');
    });
  });

  it('routes into the app on a successful sign-in', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } }, error: null,
    });

    await submitSignInForm();

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(appAlert).not.toHaveBeenCalled();
  });
});
