import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/WeightSteadyChart', () => ({ WeightSteadyChart: () => null }));
jest.mock('@/components/ui/CycleWeightChart', () => ({ CycleWeightChart: () => null }));
jest.mock('@/components/ui/AddWeightModal', () => ({ AddWeightModal: () => null }));

const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));
const mockProfile = {
  trackWeight: true, weightSteadyBaselineKg: 65, weightBaselineKg: null,
  weightPhaseBands: null, weightDataVersion: 0,
};
jest.mock('@/store/profile', () => ({ useProfileStore: (sel: any) => sel(mockProfile) }));
const mockCycle = { cycleProfile: 'natural', cycleInfo: null, periodStart: null, cycleLength: 28, periodDays: 5 };
jest.mock('@/store/cycle', () => ({ useCycleStore: (sel: any) => sel(mockCycle) }));

const mockNet = { offline: true };
const mockReadings = [{ recorded_on: '2026-09-18', weight_kg: 66.2 }];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => Promise.resolve(mockNet.offline
              ? { data: null, error: { message: 'TypeError: Network request failed' } }
              : { data: mockReadings, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import WeightScreen from '@/app/(app)/weight';

beforeEach(() => { mockNet.offline = true; });

/**
 * Card 7 (offline sweep). A failed read of body_weights fell through to
 * `data ?? []`, which left the pill reading CALIBRATING -- exactly the copy a
 * genuinely new, not-yet-baselined user sees, not "we couldn't reach the
 * server".
 */
describe('Weight screen with no signal', () => {
  it('says weight needs signal instead of showing CALIBRATING, and Try again reloads it', async () => {
    const utils = render(<WeightScreen />);
    await waitFor(() => expect(utils.getByText('Your weight needs signal to load.')).toBeTruthy());
    expect(utils.queryByText('CALIBRATING')).toBeNull();

    mockNet.offline = false;
    await act(async () => { fireEvent.press(utils.getByText('Try again')); });

    await waitFor(() => expect(utils.getByText('66.2 kg')).toBeTruthy());
    expect(utils.queryByText('Your weight needs signal to load.')).toBeNull();
  });

  it('with signal and genuinely no readings yet, still shows CALIBRATING', async () => {
    mockNet.offline = false;
    const readings = mockReadings.splice(0, mockReadings.length);
    const utils = render(<WeightScreen />);
    await waitFor(() => expect(utils.getByText('CALIBRATING')).toBeTruthy());
    expect(utils.queryByText('Your weight needs signal to load.')).toBeNull();
    mockReadings.push(...readings);
  });
});
