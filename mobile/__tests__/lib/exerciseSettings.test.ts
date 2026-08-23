jest.mock('@/lib/supabase', () => {
  const inFn     = jest.fn();
  const selectFn = jest.fn(() => ({ in: inFn }));
  const fromFn   = jest.fn(() => ({ select: selectFn }));
  return { supabase: { from: fromFn }, __in: inFn, __from: fromFn };
});

import { getExerciseSettings, DEFAULT_LOAD_TYPE } from '@/lib/exerciseSettings';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sb = require('@/lib/supabase');

describe('getExerciseSettings', () => {
  beforeEach(() => {
    sb.__in.mockReset();
    sb.__from.mockClear();
  });

  it('maps exercise names to their load type and default tempo', async () => {
    sb.__in.mockResolvedValue({
      data: [
        { name: 'Barbell Box Squat', load_type: 'weighted', default_tempo: '2-1-2-1' },
        { name: 'Push-up',           load_type: 'optional', default_tempo: null },
        { name: 'Squat & Reach',     load_type: 'none',     default_tempo: null },
      ],
      error: null,
    });

    await expect(getExerciseSettings(['Barbell Box Squat', 'Push-up', 'Squat & Reach'])).resolves.toEqual({
      'Barbell Box Squat': { loadType: 'weighted', defaultTempo: '2-1-2-1' },
      'Push-up':           { loadType: 'optional', defaultTempo: null },
      'Squat & Reach':     { loadType: 'none',     defaultTempo: null },
    });
    expect(sb.__from).toHaveBeenCalledWith('exercises');
  });

  it('treats a blank default tempo as absent, so the authored tempo wins', async () => {
    sb.__in.mockResolvedValue({
      data: [{ name: 'DB Pullover', load_type: 'weighted', default_tempo: '' }],
      error: null,
    });
    await expect(getExerciseSettings(['DB Pullover'])).resolves.toEqual({
      'DB Pullover': { loadType: 'weighted', defaultTempo: null },
    });
  });

  it('falls back to the default load type rather than trusting an unrecognised value', async () => {
    sb.__in.mockResolvedValue({
      data: [
        { name: 'Push-up',  load_type: 'bodyweight', default_tempo: null },   // not one of ours
        { name: 'Deadlift', load_type: null,         default_tempo: null },
        { name: 'Squat',    load_type: 'none',       default_tempo: null },
      ],
      error: null,
    });

    await expect(getExerciseSettings(['Push-up', 'Deadlift', 'Squat'])).resolves.toEqual({
      'Push-up':  { loadType: 'weighted', defaultTempo: null },
      'Deadlift': { loadType: 'weighted', defaultTempo: null },
      'Squat':    { loadType: 'none',     defaultTempo: null },
    });
    expect(DEFAULT_LOAD_TYPE).toBe('weighted');
  });

  it('returns nothing on an error instead of throwing, so a workout still runs', async () => {
    sb.__in.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(getExerciseSettings(['Push-up'])).resolves.toEqual({});
  });

  it('does not query at all for an empty list', async () => {
    await expect(getExerciseSettings([])).resolves.toEqual({});
    expect(sb.__from).not.toHaveBeenCalled();
  });
});
