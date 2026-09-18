import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { ProScreen } from '@/components/ui/ProScreen';
import { useSubscriptionStore } from '@/store/subscription';

describe('ProScreen', () => {
  it('renders the screen for a subscriber', () => {
    useSubscriptionStore.setState({ status: 'active', isActive: true });
    const { getByText, queryByText } = render(
      <ProScreen feature="insights"><Text>the real screen</Text></ProScreen>,
    );
    expect(getByText('the real screen')).toBeTruthy();
    expect(queryByText('VIRRA PRO')).toBeNull();
  });

  it('renders the screen while the entitlement is still unknown (no padlock flash on launch)', () => {
    useSubscriptionStore.setState({ status: 'unknown', isActive: false });
    const { getByText } = render(
      <ProScreen feature="insights"><Text>the real screen</Text></ProScreen>,
    );
    expect(getByText('the real screen')).toBeTruthy();
  });

  it('renders the locked card, not the screen, for a free user', () => {
    useSubscriptionStore.setState({ status: 'free', isActive: false });
    const { getByText, queryByText } = render(
      <ProScreen feature="insights"><Text>the real screen</Text></ProScreen>,
    );
    expect(queryByText('the real screen')).toBeNull();
    expect(getByText('VIRRA PRO')).toBeTruthy();
    expect(getByText('Start 14-day free trial')).toBeTruthy();
  });
});
