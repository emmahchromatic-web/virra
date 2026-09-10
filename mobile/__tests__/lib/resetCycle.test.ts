import { resetCycleToToday } from '@/lib/resetCycle';

jest.mock('@/lib/supabase', () => {
  const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: {
      from: jest.fn(() => ({ upsert })),
    },
    __upsert: upsert,
  };
});

jest.mock('@/store/cycle', () => {
  const setPeriodStart = jest.fn();
  return {
    useCycleStore: {
      getState: () => ({ cycleLength: 28, setPeriodStart }),
    },
    __setPeriodStart: setPeriodStart,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __upsert }         = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setPeriodStart } = require('@/store/cycle');

describe('resetCycleToToday', () => {
  beforeEach(() => {
    __upsert.mockClear();
    __upsert.mockResolvedValue({ data: null, error: null });
    __setPeriodStart.mockClear();
  });

  // Upsert, not insert. Tapping "my period started today" twice used to leave
  // two rows for one date, and the store resolves the latest period_start with
  // no reliable tiebreaker, so which cycle length the app used came down to the
  // query planner. A second tap is a correction, not a second cycle.
  it('upserts today as period_start, keyed so a second tap corrects the first', async () => {
    const today = new Date('2026-05-17T10:00:00');
    await resetCycleToToday('user-1', today);
    expect(__upsert).toHaveBeenCalledWith(
      {
        user_id:           'user-1',
        period_start:      '2026-05-17',
        cycle_length_days: 28,
      },
      { onConflict: 'user_id,period_start' },
    );
  });

  it('is idempotent: tapping twice writes the same row twice, never two rows', async () => {
    const today = new Date('2026-05-17T10:00:00');
    await resetCycleToToday('user-1', today);
    await resetCycleToToday('user-1', today);
    expect(__upsert).toHaveBeenCalledTimes(2);
    const [first]  = __upsert.mock.calls[0];
    const [second] = __upsert.mock.calls[1];
    expect(second).toEqual(first);
  });

  it('updates the store so dayOfCycle becomes 1', async () => {
    const today = new Date('2026-05-17T10:00:00');
    await resetCycleToToday('user-1', today);
    expect(__setPeriodStart).toHaveBeenCalledTimes(1);
    const [calledDate] = __setPeriodStart.mock.calls[0];
    expect(calledDate.toDateString()).toBe(today.toDateString());
  });

  it('throws on Supabase error and does not mutate the store', async () => {
    __upsert.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(resetCycleToToday('user-1', new Date('2026-05-17T10:00:00')))
      .rejects.toThrow('boom');
    expect(__setPeriodStart).not.toHaveBeenCalled();
  });
});
