import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'tmpl-5k' }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPicker: { props: any } = { props: null };
jest.mock('@react-native-community/datetimepicker', () => (props: any) => { mockPicker.props = props; return null; });
jest.mock('@/components/ui/ProScreen', () => ({ ProScreen: ({ children }: any) => children }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));
const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));
const mockProfile = { workoutPreference: 'gym_full', save: jest.fn() };
jest.mock('@/store/profile', () => ({ useProfileStore: (sel: any) => sel(mockProfile) }));
const mockWeek = { days: [] };
jest.mock('@/hooks/useWeekSessions', () => ({ useWeekSessions: () => mockWeek }));
jest.mock('@/lib/runProgramme/runnerModel', () => ({ loadRunnerModel: jest.fn().mockResolvedValue(null) }));

const mockAddBlock = jest.fn().mockResolvedValue('block-new');
jest.mock('@/lib/trainingBlocks', () => ({
  ...jest.requireActual('@/lib/trainingBlocks'),
  getActiveBlocks: jest.fn().mockResolvedValue([]),
  getOpenBlocks:   jest.fn().mockResolvedValue([]),
  clearSlot:       jest.fn().mockResolvedValue([]),
  addBlock:        (...a: unknown[]) => mockAddBlock(...a),
}));

const mockInserts: Array<Record<string, unknown>> = [];
const mockTemplate = {
  id: 'tmpl-5k', name: 'Beginner 5K', sport_type: 'run', distance_goal: '5k', duration_weeks: 8,
  description: 'Couch to 5K', archetype_key: null,
  sessions_json: Array.from({ length: 8 }, (_, i) => ({ week: i + 1, sessions: ['easy', 'easy', 'long'] })),
};
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, any> = {};
      for (const m of ['select', 'eq', 'order', 'gte', 'lt']) chain[m] = jest.fn(() => chain);
      chain.single      = () => Promise.resolve({ data: mockTemplate, error: null });
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then        = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      chain.insert      = (row: Record<string, unknown>) => { mockInserts.push({ table, ...row }); return Promise.resolve({ error: null }); };
      return chain;
    },
  },
}));

import PlanDetail from '@/app/(app)/plan/[id]';
import { localISO, addDaysISO, raceStart } from '@/lib/planStart';

const todayISO = localISO(new Date());
const raceDate = (inDays: number) => {
  const [y, m, d] = addDaysISO(todayISO, inDays).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

async function setUp(weeks: number, raceInDays: number) {
  const utils = render(<PlanDetail />);
  await waitFor(() => expect(utils.getByText('8w')).toBeTruthy());
  for (let i = 8; i < weeks; i++) fireEvent.press(utils.getByLabelText('Longer'));
  expect(utils.getByText(`${weeks}w`)).toBeTruthy();

  fireEvent.press(utils.getByText('Add a race to reverse-engineer this plan'));
  fireEvent.changeText(utils.getByPlaceholderText('Race name (e.g. Yorkshire Marathon)'), 'Winter 5K');
  fireEvent.press(utils.getByText('Select race date'));
  await act(async () => { mockPicker.props.onChange({}, raceDate(raceInDays)); });
  return utils;
}

beforeEach(() => { mockInserts.length = 0; mockAddBlock.mockClear(); });

/**
 * Card 301, at the screen: the length chosen on the DURATION stepper has to
 * reach the start date, the hint, the user_plans row and the block. The dates
 * themselves are raceStart's, tested in planStart.test.ts; this checks they get
 * there. Written by the session that also built 301 (~/dev/virra-301).
 */
describe('plan detail: a race goal with a chosen length', () => {
  it('starts 12 weeks before the race when 12 weeks are chosen, not the template 8', async () => {
    const raceInDays = 12 * 7 + 20;
    const utils = await setUp(12, raceInDays);
    const raceISO  = addDaysISO(todayISO, raceInDays);
    const startISO = raceStart(raceDate(raceInDays), 12, new Date()).start;
    // Not the template's 8 weeks, and not today.
    expect(startISO > addDaysISO(todayISO, 7)).toBe(true);

    const [sy, sm, sd] = startISO.split('-').map(Number);
    const hint = new Date(sy, sm - 1, sd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    expect(utils.getByText(`Plan starts ${hint}`)).toBeTruthy();

    await act(async () => { fireEvent.press(utils.getByText('Start training for Winter 5K')); });

    const row = mockInserts.find((r) => r.table === 'user_plans');
    expect(row).toMatchObject({ start_date: startISO, goal_date: raceISO });
    expect(mockAddBlock.mock.calls[0][1]).toMatchObject({ startsOn: startISO, endsOn: raceISO, maxWeeks: 12 });
  });

  it('starts today and says how many weeks are left when the race is closer than the length chosen', async () => {
    const utils = await setUp(12, 30);
    const { weeks } = raceStart(raceDate(30), 12, new Date());
    expect(weeks).toBeGreaterThanOrEqual(4);
    expect(weeks).toBeLessThanOrEqual(6);
    expect(utils.getByText(`Starting today · you'll get ${weeks} of 12 weeks`)).toBeTruthy();

    await act(async () => { fireEvent.press(utils.getByText('Start training for Winter 5K')); });
    expect(mockInserts.find((r) => r.table === 'user_plans')).toMatchObject({ start_date: todayISO });
    expect(mockAddBlock.mock.calls[0][1]).toMatchObject({ startsOn: todayISO, endsOn: addDaysISO(todayISO, 30), maxWeeks: weeks });
  });
});
