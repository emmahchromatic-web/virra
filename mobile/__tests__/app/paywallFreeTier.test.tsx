import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockReplace   = jest.fn();
const mockBack      = jest.fn();
let   mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    replace:   (...a: any[]) => mockReplace(...a),
    back:      (...a: any[]) => mockBack(...a),
    push:      jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/revenuecat', () => ({
  getOfferings:     jest.fn().mockResolvedValue([]),
  purchasePackage:  jest.fn(),
  restorePurchases: jest.fn(),
  getTrialEligibility: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/permissionsConfig', () => ({
  getPostAuthRoute: jest.fn().mockResolvedValue('/(app)/(tabs)'),
}));

import PaywallScreen from '@/app/(auth)/paywall';
import { useSubscriptionStore } from '@/store/subscription';

// Card 298. The paywall is no longer a wall. From onboarding it has a way
// through to the free tier; from a locked tile it has a way back.
describe('paywall on the free tier', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockParams = {};
    useSubscriptionStore.setState({ status: 'unknown', isActive: false, trialEnd: null });
  });

  it('from onboarding: "Continue with the free version" sets free and routes into the app', async () => {
    const { getByText } = render(<PaywallScreen />);
    expect(getByText('Start your free trial')).toBeTruthy();
    fireEvent.press(getByText('Continue with the free version'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)'));
    expect(useSubscriptionStore.getState().status).toBe('free');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('from a locked tile: names the feature and "Not now" goes back without touching the status', async () => {
    mockParams = { from: 'app', feature: 'recipes' };
    useSubscriptionStore.setState({ status: 'expired', isActive: false });
    const { getByText, queryByText } = render(<PaywallScreen />);
    expect(getByText('THE RECIPE BOOK · PART OF VIRRA PRO')).toBeTruthy();
    fireEvent.press(getByText('Not now'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useSubscriptionStore.getState().status).toBe('expired');
    expect(queryByText('Continue with the free version')).toBeNull();
  });

  it('does not promise a lapsed subscriber a trial', () => {
    useSubscriptionStore.setState({ status: 'expired', isActive: false });
    const { getByText, queryByText } = render(<PaywallScreen />);
    expect(getByText('Come back to Virra Pro')).toBeTruthy();
    expect(getByText('Subscribe to Virra Pro')).toBeTruthy();
    expect(queryByText('Start 14-day free trial')).toBeNull();
  });
});

describe('paywall lists what is free', () => {
  it('shows a FREE, ALWAYS list next to the Pro list', () => {
    useSubscriptionStore.setState({ status: 'unknown', isActive: false });
    const { getByText } = render(<PaywallScreen />);
    expect(getByText('VIRRA PRO')).toBeTruthy();
    expect(getByText('FREE, ALWAYS')).toBeTruthy();
    expect(getByText('Meal logging with daily totals')).toBeTruthy();
  });
});

describe('paywall close + Apple-led trial eligibility', () => {
  const rc = require('@/lib/revenuecat');

  it('has a close button at the top that does what "Not now" does', async () => {
    mockParams = { from: 'app', feature: 'plans' };
    useSubscriptionStore.setState({ status: 'free', isActive: false });
    mockBack.mockClear();
    const { getByLabelText } = render(<PaywallScreen />);
    fireEvent.press(getByLabelText('Close'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('drops the trial promise when Apple says she is not eligible, even on a "free" account', async () => {
    mockParams = {};
    useSubscriptionStore.setState({ status: 'free', isActive: false });
    rc.getOfferings.mockResolvedValueOnce([
      { identifier: 'm', product: { identifier: 'pro.month', title: 'Monthly', priceString: '£9.99' } },
    ]);
    rc.getTrialEligibility.mockResolvedValueOnce(false);
    const { findByText, queryByText } = render(<PaywallScreen />);
    expect(await findByText('Subscribe to Virra Pro')).toBeTruthy();
    expect(queryByText('Start 14-day free trial')).toBeNull();
  });
});
