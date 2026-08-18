import { medianFollicular, computeBaseline } from '@/lib/weightBaseline';

describe('medianFollicular (pure)', () => {
  it('returns null with fewer than 5 follicular readings', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 62, cycle_phase_at_time: 'follicular' as const },
    ];
    expect(medianFollicular(rows)).toBeNull();
  });

  it('returns median of follicular readings, ignoring other phases', () => {
    const rows = [
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60.4, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60.8, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61.2, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61.6, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 63.0, cycle_phase_at_time: 'luteal'     as const },
      { weight_kg: 59.0, cycle_phase_at_time: 'menstrual'  as const },
    ];
    expect(medianFollicular(rows)).toBeCloseTo(60.8);
  });

  it('returns null when no follicular readings exist', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 61, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 62, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
    ];
    expect(medianFollicular(rows)).toBeNull();
  });

  it('handles even number of follicular readings (average of middle two)', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 62, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 63, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 64, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 65, cycle_phase_at_time: 'follicular' as const },
    ];
    expect(medianFollicular(rows)).toBeCloseTo(62.5);
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

describe('computeBaseline (integration)', () => {
  beforeEach(() => {
    supabaseMock.__data.length = 0;
    supabaseMock.__from.mockClear();
    supabaseMock.__update.mockClear();
  });

  it('writes null when not enough follicular data', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' },
    );
    const { baseline, bands } = await computeBaseline('user-1');
    expect(baseline).toBeNull();
    expect(bands).toBeNull();
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({ weight_baseline_kg: null, weight_phase_bands: null }));
  });

  it('writes the median when enough follicular data', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.4, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.8, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61.2, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61.6, cycle_phase_at_time: 'follicular' },
    );
    const { baseline } = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.8);
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({
      weight_baseline_kg: 60.8,
    }));
  });

  it('learns a personal luteal band from the user\'s own readings', async () => {
    // Baseline = follicular median 60.0. Luteal readings cluster ~+0.2 kg — a
    // flat cycle, so the learned luteal band should sit near zero, NOT the
    // population +0.5..+2.0.
    supabaseMock.__data.push(
      { weight_kg: 59.8, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.2, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.1, cycle_phase_at_time: 'luteal' },
      { weight_kg: 60.2, cycle_phase_at_time: 'luteal' },
      { weight_kg: 60.3, cycle_phase_at_time: 'luteal' },
      { weight_kg: 60.2, cycle_phase_at_time: 'luteal' },
    );
    const { baseline, bands } = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.0);
    expect(bands?.luteal).toBeDefined();
    // Flat luteal → band centred near 0, well below the population +0.5 floor.
    expect(bands!.luteal!.lower).toBeLessThan(0.5);
    expect(bands!.luteal!.upper).toBeLessThan(2.0);
  });
});
