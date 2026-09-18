import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: any[]) => mockPush(...a) } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { ProLockedCard } from '@/components/ui/ProLockedCard';
import { useSubscriptionStore } from '@/store/subscription';

// Card 298. A free user never meets an empty state or a dead control where
// a Pro feature would be: she meets this card.
describe('ProLockedCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useSubscriptionStore.setState({ status: 'free', isActive: false });
  });

  it('says what the feature does and offers the trial to a free user', () => {
    const { getByText } = render(<ProLockedCard feature="plans" />);
    expect(getByText('VIRRA PRO')).toBeTruthy();
    expect(getByText('Training plans')).toBeTruthy();
    expect(getByText(/adjusted to where you are in your cycle/)).toBeTruthy();
    expect(getByText('Start 14-day free trial')).toBeTruthy();
  });

  it('does not promise a trial to a lapsed subscriber', () => {
    useSubscriptionStore.setState({ status: 'expired', isActive: false });
    const { getByText, queryByText } = render(<ProLockedCard feature="plans" note="Your plan is saved." />);
    expect(getByText('Subscribe to Virra Pro')).toBeTruthy();
    expect(queryByText('Start 14-day free trial')).toBeNull();
    expect(getByText('Your plan is saved.')).toBeTruthy();
  });

  it('opens the paywall naming the feature, from the app', () => {
    const { getByText } = render(<ProLockedCard feature="recipes" />);
    fireEvent.press(getByText('Start 14-day free trial'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/paywall?from=app&feature=recipes');
  });

  it('compact tile opens the paywall on tap', () => {
    const { getByLabelText } = render(<ProLockedCard feature="insights" compact />);
    fireEvent.press(getByLabelText('Insights, part of Virra Pro'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/paywall?from=app&feature=insights');
  });
});

// "Show Pro features" off in Profile hides the tiles; a whole-screen gate
// still has to say something, so `always` wins.
describe('ProLockedCard with Pro features hidden', () => {
  beforeEach(() => useSubscriptionStore.setState({ status: 'free', isActive: false, showProFeatures: false }));
  afterAll(() => useSubscriptionStore.setState({ showProFeatures: true }));

  it('renders nothing by default', () => {
    const { queryByText } = render(<ProLockedCard feature="plans" />);
    expect(queryByText('VIRRA PRO')).toBeNull();
  });

  it('still renders when told to', () => {
    const { getByText } = render(<ProLockedCard feature="plans" always />);
    expect(getByText('VIRRA PRO')).toBeTruthy();
  });
});
