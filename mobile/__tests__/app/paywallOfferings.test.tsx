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
  getOfferings:     jest.fn(),
  purchasePackage:  jest.fn(),
  restorePurchases: jest.fn(),
  getTrialEligibility: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/proEvents', () => ({ trackPro: jest.fn() }));
jest.mock('@/lib/permissionsConfig', () => ({
  getPostAuthRoute: jest.fn().mockResolvedValue('/(app)/(tabs)'),
}));

import PaywallScreen from '@/app/(auth)/paywall';
import { useSubscriptionStore } from '@/store/subscription';

const rc = require('@/lib/revenuecat');
const PKG = { identifier: 'm', product: { identifier: 'pro.month', title: 'Monthly', priceString: '£9.99' } };

// Card 284/J3c. getOfferings() failing offline used to render an empty
// package list with no explanation and a CTA that silently no-op'd when
// tapped -- the exact "dead button on the one screen that takes money"
// failure the InlineError pattern already exists to prevent elsewhere on
// this screen.
describe('paywall offerings failure handling', () => {
  beforeEach(() => {
    mockParams = {};
    useSubscriptionStore.setState({ status: 'unknown', isActive: false });
  });

  it('shows an honest NeedsSignal-style failure, not a blank list, when getOfferings fails', async () => {
    rc.getOfferings.mockResolvedValueOnce({ packages: [], failed: true });
    const { findByText } = render(<PaywallScreen />);
    expect(await findByText("Couldn't load your options")).toBeTruthy();
    expect(await findByText(/We couldn't reach the App Store/)).toBeTruthy();
  });

  it('shows different, non-"check your connection" copy for a genuinely empty (non-failed) offering', async () => {
    rc.getOfferings.mockResolvedValueOnce({ packages: [], failed: false });
    const { findByText, queryByText } = render(<PaywallScreen />);
    expect(await findByText('No plans available right now')).toBeTruthy();
    expect(queryByText(/We couldn't reach the App Store/)).toBeNull();
  });

  it('disables the CTA so a tap cannot fire when there is no package selected', async () => {
    rc.getOfferings.mockResolvedValueOnce({ packages: [], failed: true });
    const { findByLabelText } = render(<PaywallScreen />);
    const cta = await findByLabelText('Start 14-day free trial');
    fireEvent.press(cta);
    // purchasePackage must never be called for a disabled tap -- confirms the
    // Pressable's own disabled prop, not just app-level logic, blocked it.
    await new Promise((r) => setTimeout(r, 0));
    expect(rc.purchasePackage).not.toHaveBeenCalled();
  });

  it('retrying re-fetches offerings and recovers to the normal picker on success', async () => {
    rc.getOfferings
      .mockResolvedValueOnce({ packages: [], failed: true })
      .mockResolvedValueOnce({ packages: [PKG], failed: false });
    const { findByText, getByText, queryByText } = render(<PaywallScreen />);
    expect(await findByText("Couldn't load your options")).toBeTruthy();
    fireEvent.press(getByText('Try again'));
    await waitFor(() => expect(queryByText("Couldn't load your options")).toBeNull());
    expect(await findByText('Monthly · £9.99')).toBeTruthy();
  });

  it('the CTA is enabled once a real package has loaded and selected', async () => {
    rc.getOfferings.mockResolvedValueOnce({ packages: [PKG], failed: false });
    rc.purchasePackage.mockResolvedValue({ success: false, cancelled: false, error: 'unexpected' });
    const { findByText, findByLabelText } = render(<PaywallScreen />);
    // Wait for the package card itself, not just the CTA (which is always
    // rendered, disabled or not) -- both `packages` and `selected` land in
    // the same state update, so this guarantees `selected` is set.
    await findByText('Monthly · £9.99');
    const cta = await findByLabelText('Start 14-day free trial');
    fireEvent.press(cta);
    await waitFor(() => expect(rc.purchasePackage).toHaveBeenCalledWith(PKG));
  });
});
