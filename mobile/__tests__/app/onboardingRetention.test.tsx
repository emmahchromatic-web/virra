import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
}));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { OnboardingProvider } from '@/context/OnboardingContext';
import ProfileOnboardingScreen from '@/app/(onboarding)/profile';

/**
 * Build 14: entering a name, moving on, then stepping BACK to this screen
 * showed empty fields and made the user type everything again.
 *
 * The context was holding the answers the whole time. The screen just never
 * read them: it initialised its local state from '' on every mount, and going
 * back a step remounts it. Rendering twice inside one provider is exactly that
 * journey.
 */
describe('onboarding keeps what you already entered', () => {
  it('restores the profile step when you navigate back to it', () => {
    let mounted: ReturnType<typeof render>;

    // One provider for the whole journey, as the onboarding layout gives.
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <OnboardingProvider>{children}</OnboardingProvider>
    );

    mounted = render(<ProfileOnboardingScreen />, { wrapper: Wrapper });
    // Fails without the fix: nothing has been written to the context yet,
    // because the old screen only recorded on Continue.
    act(() => {
      fireEvent.changeText(mounted.getByPlaceholderText('Your first name'), 'Emma');
      fireEvent.changeText(mounted.getByPlaceholderText('Your last name'), 'Harrison');
    });

    expect(mounted.getByPlaceholderText('Your first name').props.value).toBe('Emma');

    // Leaving the step and coming back remounts the screen. The provider above
    // it stays mounted, which is why the answers are still reachable.
    act(() => { mounted.rerender(<></>); });
    act(() => { mounted.rerender(<ProfileOnboardingScreen />); });

    expect(mounted.getByPlaceholderText('Your first name').props.value).toBe('Emma');
    expect(mounted.getByPlaceholderText('Your last name').props.value).toBe('Harrison');
  });
});
