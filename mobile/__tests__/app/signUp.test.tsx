import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton:      () => null,
  AppleAuthenticationButtonType:  { SIGN_UP: 0, SIGN_IN: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0 },
  AppleAuthenticationScope:       { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp:             jest.fn(),
      signInWithPassword: jest.fn(),
      resend:             jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { router } = require('expo-router');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('@/lib/supabase');

import SignUpScreen from '@/app/(auth)/sign-up';

const SESSION = { access_token: 'a', user: { id: 'user-1' } };

/** Walk the screen to a filled-in email/password form and submit it. */
async function submitSignUpForm(utils: ReturnType<typeof render>) {
  fireEvent.press(utils.getByRole('button', { name: 'Sign up with email instead' }));
  fireEvent.changeText(utils.getByPlaceholderText('Email'), 'runner@example.com');
  fireEvent.changeText(utils.getByPlaceholderText('Password'), 'hunter2hunter2');
  await act(async () => {
    fireEvent.press(utils.getByRole('button', { name: 'Create account' }));
  });
}

describe('SignUpScreen — email confirmation', () => {
  beforeEach(() => {
    router.replace.mockClear();
    supabase.auth.signUp.mockReset();
    supabase.auth.signInWithPassword.mockReset();
    supabase.auth.resend.mockClear();
  });

  it('enters onboarding when signUp returns a session', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: SESSION }, error: null,
    });

    const utils = render(<SignUpScreen />);
    await submitSignUpForm(utils);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(onboarding)/welcome');
    });
  });

  // The bug: signUp with email confirmation on returns no session, and the old
  // screen navigated into onboarding anyway, leaving the final save a silent no-op.
  it('holds the user on a "check your email" state when signUp returns no session', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: null }, error: null,
    });

    const utils = render(<SignUpScreen />);
    await submitSignUpForm(utils);

    await waitFor(() => {
      expect(utils.getByText('Check your email')).toBeTruthy();
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(utils.getByText(/runner@example\.com/)).toBeTruthy();
  });

  it('enters onboarding once the confirmed address can sign in', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: null }, error: null,
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: SESSION.user, session: SESSION }, error: null,
    });

    const utils = render(<SignUpScreen />);
    await submitSignUpForm(utils);
    await waitFor(() => utils.getByText('Check your email'));

    fireEvent.press(utils.getByRole('button', { name: "I've confirmed my email" }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'runner@example.com',
        password: 'hunter2hunter2',
      });
      expect(router.replace).toHaveBeenCalledWith('/(onboarding)/welcome');
    });
  });

  it('explains that the address is still unconfirmed instead of failing silently', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: null }, error: null,
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });

    const utils = render(<SignUpScreen />);
    await submitSignUpForm(utils);
    await waitFor(() => utils.getByText('Check your email'));

    fireEvent.press(utils.getByRole('button', { name: "I've confirmed my email" }));

    await waitFor(() => {
      expect(utils.getByText(/not confirmed yet/i)).toBeTruthy();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('resends the confirmation email on request', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: null }, error: null,
    });

    const utils = render(<SignUpScreen />);
    await submitSignUpForm(utils);
    await waitFor(() => utils.getByText('Check your email'));

    fireEvent.press(utils.getByRole('button', { name: 'Resend email' }));

    await waitFor(() => {
      expect(supabase.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'runner@example.com',
      });
    });
  });
});
