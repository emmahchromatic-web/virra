import { medianAll, computeSteadyBaseline } from '@/lib/weightBaselineSteady';

describe('medianAll (pure)', () => {
  it('returns null with fewer than 7 readings', () => {
    const rows = [60, 60.2, 60.1, 60.0, 60.3, 60.1].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeNull();
  });

  it('returns the median of all readings (odd count)', () => {
    const rows = [60.0, 60.1, 60.2, 60.3, 60.4, 60.5, 60.6].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeCloseTo(60.3);
  });

  it('returns the average of middle two values (even count)', () => {
    const rows = [60.0, 60.1, 60.2, 60.3, 60.4, 60.5, 60.6, 60.7].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeCloseTo(60.35);
  });

  it('handles out-of-order rows by sorting', () => {
    const rows = [61.0, 59.8, 60.0, 60.5, 60.2, 60.3, 60.1].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeCloseTo(60.2);
  });
});

jest.mock('@/lib/supabase', () => {
  const data: any[] = [];
  const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
  const update   = jest.fn(() => ({ eq: updateEq }));
  const select = jest.fn().mockReturnThis();
  const eq     = jest.fn().mockReturnThis();
  const gte    = jest.fn().mockReturnThis();
  const builder: any = {
    select, eq, gte, update,
    then: (cb: any) => cb({ data, error: null }),
  };
  const from = jest.fn(() => builder);
  return {
    supabase: { from },
    __from: from,
    __data: data,
    __update: update,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');

describe('computeSteadyBaseline (integration)', () => {
  beforeEach(() => {
    supabaseMock.__data.length = 0;
    supabaseMock.__from.mockClear();
    supabaseMock.__update.mockClear();
  });

  it('writes null when fewer than 7 readings exist', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0 },
      { weight_kg: 60.1 },
      { weight_kg: 60.2 },
    );
    const baseline = await computeSteadyBaseline('user-1');
    expect(baseline).toBeNull();
    expect(supabaseMock.__update).toHaveBeenCalledWith(
      expect.objectContaining({ weight_steady_baseline_kg: null }),
    );
  });

  it('writes the median when 7+ readings exist', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0 }, { weight_kg: 60.1 }, { weight_kg: 60.2 },
      { weight_kg: 60.3 }, { weight_kg: 60.4 }, { weight_kg: 60.5 },
      { weight_kg: 60.6 },
    );
    const baseline = await computeSteadyBaseline('user-1');
    expect(baseline).toBeCloseTo(60.3);
    expect(supabaseMock.__update).toHaveBeenCalledWith(
      expect.objectContaining({ weight_steady_baseline_kg: 60.3 }),
    );
  });
});
