import { resetCycleToToday } from '@/lib/resetCycle';

jest.mock('@/lib/supabase', () => {
  const insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: {
      from: jest.fn(() => ({ insert })),
    },
    __insert: insert,
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
const { __insert }         = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setPeriodStart } = require('@/store/cycle');

describe('resetCycleToToday', () => {
  beforeEach(() => {
    __insert.mockClear();
    __insert.mockResolvedValue({ data: null, error: null });
    __setPeriodStart.mockClear();
  });

  it('inserts a new cycle_logs row with today as period_start', async () => {
    const today = new Date('2026-05-17T10:00:00');
    await resetCycleToToday('user-1', today);
    expect(__insert).toHaveBeenCalledWith({
      user_id:           'user-1',
      period_start:      '2026-05-17',
      cycle_length_days: 28,
    });
  });

  it('updates the store so dayOfCycle becomes 1', async () => {
    const today = new Date('2026-05-17T10:00:00');
    await resetCycleToToday('user-1', today);
    expect(__setPeriodStart).toHaveBeenCalledTimes(1);
    const [calledDate] = __setPeriodStart.mock.calls[0];
    expect(calledDate.toDateString()).toBe(today.toDateString());
  });

  it('throws on Supabase error and does not mutate the store', async () => {
    __insert.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(resetCycleToToday('user-1', new Date('2026-05-17T10:00:00')))
      .rejects.toThrow('boom');
    expect(__setPeriodStart).not.toHaveBeenCalled();
  });
});
