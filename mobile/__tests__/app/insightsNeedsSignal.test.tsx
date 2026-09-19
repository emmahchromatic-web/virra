import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));
jest.mock('@/components/ui/ProScreen', () => ({ ProScreen: ({ children }: any) => children }));
jest.mock('@/components/ui/AddEventModal', () => ({ AddEventModal: () => null }));
jest.mock('@/components/ui/Shimmer', () => ({ Shimmer: () => null }));

const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));
const mockCycle = {
  cycleInfo: null, periodStart: null, cycleLength: 28, periodDays: 5,
  cycleProfile: 'natural', hasPlaceboWeek: false, cycleMode: 'flow', currentPackStart: null,
};
jest.mock('@/store/cycle', () => ({ useCycleStore: () => mockCycle }));
jest.mock('@/hooks/useDateRangeSessions', () => ({ useDateRangeSessions: () => ({ byDate: {} }) }));

const mockNet = { offline: true };
const mockMetrics = {
  streakDays: 4, weeklyKm: 12, monthlyKm: 40, yearKm: 300,
  trainingAdherencePct: 80, nutritionCompliancePct: 70, droppedByModality: null,
  phasePaces: [], symptomTrend: null, fuellingAlignment: null, weekStartISO: '2026-09-14',
};
jest.mock('@/lib/insightMetrics', () => ({
  ...jest.requireActual('@/lib/insightMetrics'),
  computeInsightMetrics: jest.fn(() => mockNet.offline
    ? Promise.reject(new Error('TypeError: Network request failed'))
    : Promise.resolve(mockMetrics)),
}));

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, any> = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'order']) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = () => Promise.resolve(mockNet.offline
        ? { data: null, error: { message: 'TypeError: Network request failed' } }
        : { data: null, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      return chain;
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import InsightsScreen from '@/app/(app)/insights';

beforeEach(() => {
  mockNet.offline = true;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(() => mockNet.offline
    ? Promise.resolve({ data: null, error: { message: 'Failed to send a request to the Edge Function' } })
    : Promise.resolve({ data: { overall_text: 'Fresh insight for your week.', training_text: null, nutrition_text: null, generated_at: '2026-09-19T00:00:00Z' }, error: null }));
});

/**
 * Card 7 (offline sweep). Two direct reads on this screen used to fail
 * silently: computeInsightMetrics's error was swallowed into null but the
 * tiles still rendered `?? 0` as if that were a real answer, and a failed
 * generate-insights invoke fell through to the same copy a genuinely new
 * account sees ("Log activities to unlock your personal insight.").
 */
describe('Insights screen with no signal', () => {
  it('says the narrative and numbers need signal, never a false zero or "log activities"', async () => {
    const utils = render(<InsightsScreen />);
    await waitFor(() => expect(utils.getByText("This week's insight needs signal to load.")).toBeTruthy());
    expect(utils.getByText('Your numbers need signal to load.')).toBeTruthy();
    expect(utils.queryByText('Log activities to unlock your personal insight.')).toBeNull();
    expect(utils.queryByText('0')).toBeNull();
  });

  it('with signal, shows the real narrative and numbers', async () => {
    mockNet.offline = false;
    const utils = render(<InsightsScreen />);
    await waitFor(() => expect(utils.getByText('Fresh insight for your week.')).toBeTruthy());
    expect(utils.getByText('4')).toBeTruthy(); // DAY STREAK
    expect(utils.queryByText("This week's insight needs signal to load.")).toBeNull();
    expect(utils.queryByText('Your numbers need signal to load.')).toBeNull();
  });

  it('retrying with signal restored clears both signals', async () => {
    const utils = render(<InsightsScreen />);
    await waitFor(() => expect(utils.getByText('Your numbers need signal to load.')).toBeTruthy());

    mockNet.offline = false;
    const retryButtons = utils.getAllByText('Try again');
    await act(async () => { fireEvent.press(retryButtons[0]); });

    await waitFor(() => expect(utils.queryByText('Your numbers need signal to load.')).toBeNull());
    expect(utils.queryByText("This week's insight needs signal to load.")).toBeNull();
    expect(utils.getByText('Fresh insight for your week.')).toBeTruthy();
  });
});
