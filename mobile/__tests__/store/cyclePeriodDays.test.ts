import { act } from '@testing-library/react-native';

type Result = { data: unknown; error: { message: string; code?: string } | null };
const mockResults: { cycle: Result; profile: Result; lengths: Result } = {
  cycle:   { data: null, error: null },
  profile: { data: null, error: null },
  lengths: { data: [], error: null },
};

// A chain where .maybeSingle() answers the single-row reads and awaiting the
// chain itself answers the list read, which is how the store tells them apart.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(() => Promise.resolve(table === 'cycle_logs' ? mockResults.cycle : mockResults.profile));
      chain.then = (resolve: (r: Result) => void) => resolve(mockResults.lengths);
      return chain;
    }),
  },
}));

import { useCycleStore } from '@/store/cycle';

const today = new Date(2026, 8, 4);   // day 4 of a period starting 1 Sep

beforeEach(() => {
  useCycleStore.setState({
    cycleProfile: 'natural', cycleMode: 'flow', periodStart: null, cycleLength: 28,
    periodDays: 5, periodDaysLogged: false, recentPeriodDays: [], cycleInfo: null,
    hasPlaceboWeek: null, currentPackStart: null, contraceptionType: null,
  });
  mockResults.cycle   = { data: { period_start: '2026-09-01', cycle_length_days: 28 }, error: null };
  mockResults.profile = { data: { cycle_profile: 'natural' }, error: null };
  mockResults.lengths = { data: [], error: null };
});

/** Card 304: where the period length comes from, and when it changes. */
describe('cycle store period length', () => {
  it('loads a logged length for the current period', async () => {
    mockResults.lengths = { data: [{ period_start: '2026-09-01', period_length_days: 3 }], error: null };
    await act(async () => { await useCycleStore.getState().loadFromSupabase('u', today); });
    const s = useCycleStore.getState();
    expect(s.periodDays).toBe(3);
    expect(s.periodDaysLogged).toBe(true);
    expect(s.cycleInfo?.phase).toBe('follicular');
  });

  it('assumes the average of recent periods when this one has no end yet', async () => {
    mockResults.lengths = {
      data: [
        { period_start: '2026-09-01', period_length_days: null },
        { period_start: '2026-08-04', period_length_days: 3 },
        { period_start: '2026-07-07', period_length_days: 4 },
        { period_start: '2026-06-09', period_length_days: 3 },
      ],
      error: null,
    };
    await act(async () => { await useCycleStore.getState().loadFromSupabase('u', today); });
    expect(useCycleStore.getState().periodDays).toBe(3);
    expect(useCycleStore.getState().periodDaysLogged).toBe(false);
  });

  it('still loads the cycle, at 5 days, when the length column does not exist yet', async () => {
    mockResults.lengths = { data: null, error: { message: 'column does not exist', code: '42703' } };
    await act(async () => { await useCycleStore.getState().loadFromSupabase('u', today); });
    const s = useCycleStore.getState();
    expect(s.periodStart).not.toBeNull();
    expect(s.periodDays).toBe(5);
    expect(s.cycleInfo?.phase).toBe('menstrual');
  });

  it('logging an end moves today straight to follicular', () => {
    useCycleStore.getState().setPeriodStart(new Date(2026, 8, 1), today);
    expect(useCycleStore.getState().cycleInfo?.phase).toBe('menstrual');
    useCycleStore.getState().setLoggedPeriodDays(3, today);
    expect(useCycleStore.getState().cycleInfo?.phase).toBe('follicular');
  });

  it('saving the same start date keeps the logged length; moving it clears it', () => {
    const st = useCycleStore.getState();
    st.setPeriodStart(new Date(2026, 8, 1), today);
    st.setLoggedPeriodDays(3, today);
    useCycleStore.getState().setPeriodStart(new Date(2026, 8, 1, 12), today);
    expect(useCycleStore.getState().periodDaysLogged).toBe(true);
    useCycleStore.getState().setPeriodStart(new Date(2026, 8, 2), today);
    expect(useCycleStore.getState().periodDaysLogged).toBe(false);
    expect(useCycleStore.getState().periodDays).toBe(5);
  });

  it('a new period carries the finished one into the assumed length', () => {
    const st = useCycleStore.getState();
    st.setPeriodStart(new Date(2026, 8, 1), today);
    st.setLoggedPeriodDays(3, today);
    useCycleStore.getState().startNewPeriod(new Date(2026, 8, 29), new Date(2026, 8, 29));
    const s = useCycleStore.getState();
    expect(s.recentPeriodDays).toEqual([3]);
    expect(s.periodDays).toBe(3);
    expect(s.periodDaysLogged).toBe(false);
  });

  it('a second "period started" tap on the same day is not a new period', () => {
    const st = useCycleStore.getState();
    st.setPeriodStart(new Date(2026, 8, 1), today);
    st.setLoggedPeriodDays(3, today);
    useCycleStore.getState().startNewPeriod(new Date(2026, 8, 1, 9), today);
    expect(useCycleStore.getState().recentPeriodDays).toEqual([]);
    expect(useCycleStore.getState().periodDaysLogged).toBe(true);
  });
});
