import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'tmpl-5k' }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@/components/ui/ProScreen', () => ({ ProScreen: ({ children }: any) => children }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));
const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));
const mockProfile = { workoutPreference: 'gym_full', save: jest.fn() };
jest.mock('@/store/profile', () => ({ useProfileStore: (sel: any) => sel(mockProfile) }));
const mockWeek = { days: [] };
jest.mock('@/hooks/useWeekSessions', () => ({ useWeekSessions: () => mockWeek }));
jest.mock('@/lib/runProgramme/runnerModel', () => ({ loadRunnerModel: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/trainingBlocks', () => ({
  ...jest.requireActual('@/lib/trainingBlocks'),
  getActiveBlocks: jest.fn().mockResolvedValue([]),
  getOpenBlocks:   jest.fn().mockResolvedValue([]),
  clearSlot:       jest.fn().mockResolvedValue([]),
  addBlock:        jest.fn().mockResolvedValue('block-new'),
}));

const mockNet = { offline: true };
const mockTemplate = {
  id: 'tmpl-5k', name: 'Beginner 5K', sport_type: 'run', distance_goal: '5k', duration_weeks: 8,
  description: 'Couch to 5K', archetype_key: null,
  sessions_json: Array.from({ length: 8 }, (_, i) => ({ week: i + 1, sessions: ['easy', 'easy', 'long'] })),
};
// Every Supabase read fails the way it does with no signal: supabase-js does not
// throw, it resolves with data null and an error.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, any> = {};
      for (const m of ['select', 'eq', 'order', 'gte', 'lt']) chain[m] = jest.fn(() => chain);
      chain.single = () => Promise.resolve(mockNet.offline
        ? { data: null, error: { message: 'TypeError: Network request failed' } }
        : { data: mockTemplate, error: null });
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then        = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      chain.insert      = () => Promise.resolve({ error: null });
      return chain;
    },
  },
}));

import PlanDetail from '@/app/(app)/plan/[id]';

beforeEach(() => { mockNet.offline = true; });

/**
 * Card 7 (offline sweep). The `plan_templates` read backing this screen used to
 * fail silently into `!plan`, which rendered "Plan not found." -- a 404 message
 * for what was actually a network failure. A genuinely missing template (a bad
 * id, no error) must still say "Plan not found."; only a failed read says so.
 */
describe('plan detail with no signal', () => {
  it('says the plan needs signal instead of claiming it does not exist, and Try again reloads it', async () => {
    const utils = render(<PlanDetail />);
    await waitFor(() => expect(utils.getByText('This plan needs signal to load.')).toBeTruthy());
    expect(utils.queryByText('Plan not found.')).toBeNull();

    mockNet.offline = false;
    await act(async () => { fireEvent.press(utils.getByText('Try again')); });

    await waitFor(() => expect(utils.getByText('Beginner 5K')).toBeTruthy());
    expect(utils.queryByText('This plan needs signal to load.')).toBeNull();
  });

  it('with signal and a genuinely missing template, still says the plan was not found', async () => {
    mockNet.offline = false;
    // Simulate a real 404: no error, but no row either (a bad or deleted id).
    const supa = jest.requireMock('@/lib/supabase').supabase;
    const originalFrom = supa.from;
    supa.from = (table: string) => {
      const chain = originalFrom(table);
      if (table === 'plan_templates') chain.single = () => Promise.resolve({ data: null, error: null });
      return chain;
    };
    const utils = render(<PlanDetail />);
    await waitFor(() => expect(utils.getByText('Plan not found.')).toBeTruthy());
    expect(utils.queryByText('This plan needs signal to load.')).toBeNull();
    supa.from = originalFrom;
  });
});
