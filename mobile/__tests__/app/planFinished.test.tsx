import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

/**
 * Card 255. Emma's run plan ended on 26 August and nothing told her: she
 * reported the empty calendar as a bug. Worse than silence, the Training tab
 * went on calling the plan ACTIVE and counting weeks past its end.
 */
const mockState = {
  openBlocks: [] as Array<{ template_id: string | null; ends_on: string | null }>,
  writes:     [] as Array<{ table: string; patch: Record<string, unknown> }>,
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, any> = { _not: false, _patch: null as Record<string, unknown> | null };
      for (const m of ['select', 'eq', 'lte', 'gte', 'lt', 'or', 'order', 'limit', 'in']) {
        chain[m] = jest.fn(() => chain);
      }
      chain.not    = jest.fn(() => { chain._not = true; return chain; });
      chain.update = jest.fn((patch: Record<string, unknown>) => { chain._patch = patch; return chain; });
      const rows = () => {
        if (chain._patch) { mockState.writes.push({ table, patch: chain._patch }); return []; }
        if (table === 'training_blocks') {
          // `.not('ends_on', 'is', null)` is the finished-block read; the other
          // is getOpenBlocks.
          return chain._not
            ? [{ id: 'block-1', ends_on: '2026-08-26' }]
            : mockState.openBlocks;
        }
        if (table === 'user_plans') {
          return [{ template_id: 't1', start_date: '2026-06-29' }];
        }
        if (table === 'plan_templates') {
          return [{ id: 't1', name: 'Path to parkrun', sport_type: 'run', distance_goal: '5k',
                    duration_weeks: 9, description: 'Walk breaks included.', tagline: null,
                    archetype_key: 'path_to_parkrun', sort_order: 0, is_active: true }];
        }
        if (table === 'planned_sessions') {
          return [
            ...Array.from({ length: 21 }, (_, i) => ({ status: 'completed', scheduled_date: `2026-08-${(i % 28) + 1}` })),
            ...Array.from({ length: 6 },  () => ({ status: 'planned',   scheduled_date: '2026-08-20' })),
            { status: 'dropped', scheduled_date: '2026-08-21' },
          ];
        }
        return [];
      };
      chain.maybeSingle = () => Promise.resolve({
        data: table === 'user_plans'
          ? { id: 'up1', template_id: 't1', start_date: '2026-06-29', goal_date: '2026-08-26',
              template: { id: 't1', name: 'Path to parkrun', sport_type: 'run', distance_goal: '5k', duration_weeks: 9, description: '', tagline: null } }
          : null,
        error: null,
      });
      chain.single = chain.maybeSingle;
      chain.then   = (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
      return chain;
    },
  },
}));

// Defined inside the factory: jest hoists the mock above any const, so a
// variable referenced here would still be undefined when it runs.
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
const mockRouter = (jest.requireMock('expo-router') as { router: { push: jest.Mock } }).router;
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  Swipeable: ({ children }: any) => children,
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));
jest.mock('@/components/ui/ProScreen', () => ({ ProScreen: ({ children }: any) => children }));
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/store/cycle', () => ({ useCycleStore: () => ({ cycleInfo: null, periodStart: null, cycleLength: 28, periodDays: 5, cycleMode: 'flow', currentPackStart: null }) }));
jest.mock('@/store/profile', () => ({ useProfileStore: (sel: any) => sel({ workoutPreference: 'gym_full', isLoaded: true, save: jest.fn() }) }));
jest.mock('@/lib/pro', () => ({ useProGate: () => ({ isPro: true, showLocked: false }), paywallRoute: () => '/paywall' }));
jest.mock('@/lib/mobilitySchedule', () => ({
  topUpMobilitySchedule: jest.fn().mockResolvedValue(0),
  attachMobilityLabels:  jest.fn(async (b: unknown) => b),
}));
jest.mock('@/components/ui/SeasonTimeline', () => ({ SeasonTimeline: () => null }));
jest.mock('@/components/ui/MonthCalendar', () => ({ MonthCalendar: () => null }));
jest.mock('@/components/ui/TodaysSessionHero', () => ({ TodaysSessionHero: () => null }));
jest.mock('@/lib/todaysSession', () => ({ enrichTodaysSessions: jest.fn().mockResolvedValue([]) }));
const mockWeekSessions = { days: [], isFetching: false };
jest.mock('@/hooks/useWeekSessions', () => ({ useWeekSessions: () => mockWeekSessions }));
const mockToday: unknown[] = [];
jest.mock('@/hooks/useTodaySessions', () => ({ useTodaySessions: () => mockToday }));

import TrainingScreen from '@/app/(app)/(tabs)/training';
import BrowsePlans from '@/app/(app)/plans/browse';

beforeEach(() => {
  mockState.openBlocks = [];
  mockState.writes = [];
  mockRouter.push.mockClear();
});

describe('a plan that has reached its end', () => {
  it('says it finished, when it ended, and how much of it was done', async () => {
    const { getByText } = render(<TrainingScreen />);
    await waitFor(() => expect(getByText('PLAN FINISHED')).toBeTruthy());
    expect(getByText('Path to parkrun')).toBeTruthy();
    expect(getByText('Your plan ran to Wed 26 Aug.')).toBeTruthy();
    // 21 done of 27 owed: the dropped session counts on neither side.
    expect(getByText('You did 21 of its 27 sessions.')).toBeTruthy();
  });

  it('offers the next plan, and stops the finished one being "your plan"', async () => {
    const { getByText } = render(<TrainingScreen />);
    await waitFor(() => expect(getByText('PLAN FINISHED')).toBeTruthy());

    await act(async () => { fireEvent.press(getByText('Find your next plan')); });

    expect(mockState.writes).toContainEqual({ table: 'user_plans', patch: { is_active: false } });
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/plans/browse');
  });

  it('says nothing of the sort while a block of the plan is still open', async () => {
    mockState.openBlocks = [{ template_id: 't1', ends_on: '2026-10-30' }];
    const { queryByText } = render(<TrainingScreen />);
    await act(async () => {});
    expect(queryByText('PLAN FINISHED')).toBeNull();
  });

  it('Browse does not say you are on a plan that has finished', async () => {
    const { queryByText, getByText } = render(<BrowsePlans />);
    await waitFor(() => expect(getByText('Path to parkrun')).toBeTruthy());
    expect(queryByText('YOU ARE ON THIS PLAN')).toBeNull();
  });

  it('Browse still marks a plan whose block is open', async () => {
    mockState.openBlocks = [{ template_id: 't1', ends_on: '2026-10-30' }];
    const { getByText } = render(<BrowsePlans />);
    await waitFor(() => expect(getByText('YOU ARE ON THIS PLAN')).toBeTruthy());
  });
});
