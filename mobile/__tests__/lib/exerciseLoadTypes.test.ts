jest.mock('@/lib/supabase', () => {
  const inFn     = jest.fn();
  const selectFn = jest.fn(() => ({ in: inFn }));
  const fromFn   = jest.fn(() => ({ select: selectFn }));
  return { supabase: { from: fromFn }, __in: inFn, __from: fromFn };
});

import { getLoadTypes, DEFAULT_LOAD_TYPE } from '@/lib/exerciseLoadTypes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sb = require('@/lib/supabase');

describe('getLoadTypes', () => {
  beforeEach(() => {
    sb.__in.mockReset();
    sb.__from.mockClear();
  });

  it('maps exercise names to their load type', async () => {
    sb.__in.mockResolvedValue({
      data: [
        { name: 'Barbell Box Squat', load_type: 'weighted' },
        { name: 'Push-up',           load_type: 'optional' },
        { name: 'Squat & Reach',     load_type: 'none' },
      ],
      error: null,
    });

    await expect(getLoadTypes(['Barbell Box Squat', 'Push-up', 'Squat & Reach'])).resolves.toEqual({
      'Barbell Box Squat': 'weighted',
      'Push-up':           'optional',
      'Squat & Reach':     'none',
    });
    expect(sb.__from).toHaveBeenCalledWith('exercises');
  });

  it('skips rows with an unrecognised load type rather than trusting them', async () => {
    sb.__in.mockResolvedValue({
      data: [
        { name: 'Push-up',  load_type: 'bodyweight' },   // not one of ours
        { name: 'Deadlift', load_type: null },
        { name: 'Squat',    load_type: 'none' },
      ],
      error: null,
    });

    // Absent names fall back to the default at the call site, which preserves
    // the old always-show-kg behaviour.
    await expect(getLoadTypes(['Push-up', 'Deadlift', 'Squat'])).resolves.toEqual({ Squat: 'none' });
    expect(DEFAULT_LOAD_TYPE).toBe('weighted');
  });

  it('returns nothing on an error instead of throwing, so a workout still runs', async () => {
    sb.__in.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(getLoadTypes(['Push-up'])).resolves.toEqual({});
  });

  it('does not query at all for an empty list', async () => {
    await expect(getLoadTypes([])).resolves.toEqual({});
    expect(sb.__from).not.toHaveBeenCalled();
  });
});
