jest.mock('@/lib/supabase', () => {
  const orderFn  = jest.fn();
  const notFn    = jest.fn(() => ({ order: orderFn }));
  const inFn     = jest.fn(() => ({ not: notFn }));
  const eqUnitFn = jest.fn(() => ({ in: inFn }));
  const eqUserFn = jest.fn(() => ({ eq: eqUnitFn }));
  const selectFn = jest.fn(() => ({ eq: eqUserFn }));
  const fromFn   = jest.fn(() => ({ select: selectFn }));
  return { supabase: { from: fromFn }, __order: orderFn, __eqUnit: eqUnitFn, __select: selectFn };
});

import { getLastLoggedHolds } from '@/lib/strengthHistory';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sb = require('@/lib/supabase');

const USER = 'user-1';

describe('getLastLoggedHolds', () => {
  beforeEach(() => {
    sb.__order.mockReset();
    sb.__eqUnit.mockClear();
    sb.__select.mockClear();
  });

  it('reads only sets logged in seconds', async () => {
    sb.__order.mockResolvedValue({ data: [], error: null });
    await getLastLoggedHolds(USER, ['Plank']);
    expect(sb.__eqUnit).toHaveBeenCalledWith('unit', 'seconds');
  });

  it('takes the BEST set of the last session, not the last set', async () => {
    // Newest first, as the query orders them. The last session (18th) went
    // 52s, 44s, 31s: the number to beat is 52, not the 31 she finished on.
    sb.__order.mockResolvedValue({
      data: [
        { exercise_name: 'Plank', actual_reps: 52, completed_at: '2026-09-18T09:02:00Z' },
        { exercise_name: 'Plank', actual_reps: 44, completed_at: '2026-09-18T09:05:00Z' },
        { exercise_name: 'Plank', actual_reps: 31, completed_at: '2026-09-18T09:08:00Z' },
        { exercise_name: 'Plank', actual_reps: 90, completed_at: '2026-09-11T09:02:00Z' },
      ],
      error: null,
    });
    expect(await getLastLoggedHolds(USER, ['Plank'])).toEqual({ Plank: 52 });
  });

  it('ignores earlier sessions, even when they were longer', async () => {
    // A 90s hold a week ago must not be presented as "last time": progressing
    // against a session you did not just do is how a plateau looks like failure.
    sb.__order.mockResolvedValue({
      data: [
        { exercise_name: 'Hollow Hold', actual_reps: 20, completed_at: '2026-09-18T09:02:00Z' },
        { exercise_name: 'Hollow Hold', actual_reps: 90, completed_at: '2026-09-04T09:02:00Z' },
      ],
      error: null,
    });
    expect(await getLastLoggedHolds(USER, ['Hollow Hold'])).toEqual({ 'Hollow Hold': 20 });
  });

  it('keeps each exercise on its own last session', async () => {
    sb.__order.mockResolvedValue({
      data: [
        { exercise_name: 'Plank',       actual_reps: 40, completed_at: '2026-09-18T09:02:00Z' },
        { exercise_name: 'Side Plank',  actual_reps: 25, completed_at: '2026-09-15T09:02:00Z' },
        { exercise_name: 'Side Plank',  actual_reps: 60, completed_at: '2026-09-08T09:02:00Z' },
      ],
      error: null,
    });
    expect(await getLastLoggedHolds(USER, ['Plank', 'Side Plank'])).toEqual({ Plank: 40, 'Side Plank': 25 });
  });

  it('is best-effort: a failed read costs the hint, not the workout', async () => {
    sb.__order.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await getLastLoggedHolds(USER, ['Plank'])).toEqual({});
  });

  it('does not query at all for a session with no exercises', async () => {
    expect(await getLastLoggedHolds(USER, [])).toEqual({});
    expect(sb.__select).not.toHaveBeenCalled();
  });
});
