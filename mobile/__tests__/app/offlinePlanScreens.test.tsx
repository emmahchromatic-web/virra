import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Every Supabase read fails the way it does with no signal: supabase-js does not
// throw, it resolves with data null and an error.
const mockNet = { offline: true };
const mockTemplates = [{ id: 't1', name: 'Beginner 5K', sport_type: 'run', distance_goal: '5k', duration_weeks: 8, description: '', tagline: null, archetype_key: null }];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, any> = {};
      for (const m of ['select', 'eq', 'lte', 'gte', 'lt', 'or', 'order', 'limit', 'in']) chain[m] = jest.fn(() => chain);
      const answer = () => mockNet.offline
        ? { data: null, error: { message: 'TypeError: Network request failed' } }
        : { data: table === 'plan_templates' ? mockTemplates : [], error: null };
      chain.maybeSingle = () => Promise.resolve(mockNet.offline ? answer() : { data: null, error: null });
      chain.single      = chain.maybeSingle;
      chain.then        = (resolve: (v: unknown) => void) => resolve(answer());
      return chain;
    },
  },
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  Swipeable: ({ children }: any) => children,
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));
jest.mock('@/components/ui/ProScreen', () => ({ ProScreen: ({ children }: any) => children }));
const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));
const mockCycle = { cycleInfo: null, periodStart: null, cycleLength: 28, cycleMode: 'flow', currentPackStart: null };
jest.mock('@/store/cycle', () => ({ useCycleStore: () => mockCycle }));
const mockProfile = { workoutPreference: 'gym_full', isLoaded: true, save: jest.fn() };
jest.mock('@/store/profile', () => ({ useProfileStore: (sel: any) => sel(mockProfile) }));
jest.mock('@/lib/pro', () => ({ useProGate: () => ({ isPro: true, showLocked: false }), paywallRoute: () => '/paywall' }));
jest.mock('@/lib/mobilitySchedule', () => ({
  topUpMobilitySchedule: jest.fn().mockResolvedValue(0),
  attachMobilityLabels:  jest.fn(async (b: unknown) => b),
}));
jest.mock('@/components/ui/SeasonTimeline', () => ({ SeasonTimeline: () => null }));
jest.mock('@/components/ui/MonthCalendar', () => ({ MonthCalendar: () => null }));
jest.mock('@/components/ui/TodaysSessionHero', () => ({ TodaysSessionHero: () => null }));
jest.mock('@/lib/todaysSession', () => ({ enrichTodaysSessions: jest.fn().mockResolvedValue([]) }));

// This week as the phone saved it (virra:sessions:v1).
const mockWeek = {
  days: [
    { date: '2026-09-14', sessions: [{ id: 's1', session_label: 'Easy run', modality: 'run', status: 'completed', block_id: 'b1' }] },
    { date: '2026-09-16', sessions: [{ id: 's2', session_label: 'Tempo', modality: 'run', status: 'planned', block_id: 'b1' }] },
  ],
  isFetching: false,
};
jest.mock('@/hooks/useWeekSessions', () => ({ useWeekSessions: () => mockWeek }));
jest.mock('@/hooks/useTodaySessions', () => ({ useTodaySessions: () => mockEmpty }));
const mockEmpty: unknown[] = [];

import TrainingScreen from '@/app/(app)/(tabs)/training';
import BrowsePlans from '@/app/(app)/plans/browse';

beforeEach(() => { mockNet.offline = true; });

/**
 * Card 295. With no signal the app opened, but Training said you had no plan
 * and Browse said Virra had no plans. A failed read is not an empty result.
 */
describe('Training tab with no signal', () => {
  it('says it needs signal and shows the saved week, never "no active plan"', async () => {
    const utils = render(<TrainingScreen />);
    await waitFor(() => expect(utils.getByText('Your plan needs signal to load.')).toBeTruthy());
    expect(utils.queryByText("You don't have an active plan yet.")).toBeNull();
    expect(utils.getByText('THIS WEEK')).toBeTruthy();
    expect(utils.getByText('Easy run')).toBeTruthy();
    expect(utils.getByText('Tempo')).toBeTruthy();
    expect(utils.getByText('DONE')).toBeTruthy();
  });

  it('with signal and genuinely no plan, still offers to browse', async () => {
    mockNet.offline = false;
    const utils = render(<TrainingScreen />);
    await waitFor(() => expect(utils.getByText("You don't have an active plan yet.")).toBeTruthy());
    expect(utils.queryByText('Your plan needs signal to load.')).toBeNull();
  });
});

describe('Browse Plans with no signal', () => {
  it('says plans need signal instead of "No plans available yet", and Try again loads them', async () => {
    const utils = render(<BrowsePlans />);
    await waitFor(() => expect(utils.getByText('Plans need signal to load.')).toBeTruthy());
    expect(utils.queryByText('No plans available yet.')).toBeNull();

    mockNet.offline = false;
    await act(async () => { fireEvent.press(utils.getByText('Try again')); });
    await waitFor(() => expect(utils.getByText('Beginner 5K')).toBeTruthy());
    expect(utils.queryByText('Plans need signal to load.')).toBeNull();
  });
});
