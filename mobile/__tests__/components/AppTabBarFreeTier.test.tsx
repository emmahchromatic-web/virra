import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn() }));

import { AppTabBar } from '@/components/layout/AppTabBar';
import { EmptyWeekStrip } from '@/components/ui/EmptyWeekStrip';
import { useSubscriptionStore } from '@/store/subscription';

const routes = ['index', 'training', 'nutrition', 'recipes', 'profile'].map((name) => ({ key: name, name }));
const props  = (navigate = jest.fn()) =>
  ({ state: { index: 0, routes }, navigation: { navigate } } as any);

// Card 298 follow-up. Removing the Recipes tab left three tabs around a
// centred play button and the bar read as broken. It is greyed out instead.
describe('AppTabBar on the free tier', () => {
  afterEach(() => useSubscriptionStore.setState({ status: 'unknown', isActive: false, showProFeatures: true }));

  it('keeps all four tabs when Pro features are hidden, and marks Recipes as Pro', () => {
    useSubscriptionStore.setState({ status: 'free', isActive: false, showProFeatures: false });
    const { getByLabelText, queryByLabelText } = render(<AppTabBar {...props()} />);
    expect(getByLabelText('Dashboard')).toBeTruthy();
    expect(getByLabelText('Training')).toBeTruthy();
    expect(getByLabelText('Nutrition')).toBeTruthy();
    expect(getByLabelText('Recipes, part of Virra Pro')).toBeTruthy();
    expect(queryByLabelText('Recipes')).toBeNull();
  });

  it('the greyed tab is never a dead control: it still opens Recipes (the locked card)', () => {
    useSubscriptionStore.setState({ status: 'free', isActive: false, showProFeatures: false });
    const navigate = jest.fn();
    const { getByLabelText } = render(<AppTabBar {...props(navigate)} />);
    fireEvent.press(getByLabelText('Recipes, part of Virra Pro'));
    expect(navigate).toHaveBeenCalledWith('recipes');
  });

  it('is an ordinary tab for a subscriber and for a free user who shows Pro features', () => {
    useSubscriptionStore.setState({ status: 'active', isActive: true, showProFeatures: false });
    expect(render(<AppTabBar {...props()} />).getByLabelText('Recipes')).toBeTruthy();
    useSubscriptionStore.setState({ status: 'free', isActive: false, showProFeatures: true });
    expect(render(<AppTabBar {...props()} />).getByLabelText('Recipes')).toBeTruthy();
  });
});

describe('EmptyWeekStrip caption', () => {
  it('keeps the plan prompt by default and takes the free-tier line when given one', () => {
    expect(render(<EmptyWeekStrip todayIndex={2} />).getByText('No active plan, tap to pick one')).toBeTruthy();
    expect(
      render(<EmptyWeekStrip todayIndex={2} caption="Your planned week is part of Virra Pro" />)
        .getByText('Your planned week is part of Virra Pro'),
    ).toBeTruthy();
  });
});
