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
  const weights: any[] = [];
  const state = { firstPeriodStart: null as string | null };
  const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
  const update   = jest.fn(() => ({ eq: updateEq }));

  // Table-aware: computeBaseline now reads cycle_logs as well, to find the
  // earliest period start it has ever been told about. See MIN_LIVE_FOLLICULAR.
  const from = jest.fn((table: string) => {
    const builder: any = {
      update,
      select:      jest.fn(() => builder),
      eq:          jest.fn(() => builder),
      gte:         jest.fn(() => builder),
      order:       jest.fn(() => builder),
      limit:       jest.fn(() => builder),
      maybeSingle: jest.fn(async () =>
        table === 'cycle_logs'
          ? { data: state.firstPeriodStart ? { period_start: state.firstPeriodStart } : null, error: null }
          : { data: null, error: null }),
      then: (cb: any) => cb({ data: table === 'body_weights' ? weights : [], error: null }),
    };
    return builder;
  });

  return { supabase: { from }, __from: from, __data: weights, __update: update, __state: state };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');

/** Readings the app watched arrive: dated on or after the first known period start. */
const live = (weight_kg: number, phase: string) =>
  ({ weight_kg, cycle_phase_at_time: phase, recorded_on: '2026-08-10' });
/** Readings backfilled out of HealthKit, predating anything we knew about her cycle. */
const backfilled = (weight_kg: number, phase: string) =>
  ({ weight_kg, cycle_phase_at_time: phase, recorded_on: '2026-05-10' });

describe('computeBaseline (integration)', () => {
  beforeEach(() => {
    supabaseMock.__data.length = 0;
    supabaseMock.__state.firstPeriodStart = '2026-08-01';
    supabaseMock.__from.mockClear();
    supabaseMock.__update.mockClear();
  });

  it('writes null when not enough follicular data', async () => {
    supabaseMock.__data.push(live(60, 'follicular'), live(61, 'follicular'));
    const { baseline, bands } = await computeBaseline('user-1');
    expect(baseline).toBeNull();
    expect(bands).toBeNull();
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({ weight_baseline_kg: null, weight_phase_bands: null }));
  });

  it('writes the median when enough follicular data', async () => {
    supabaseMock.__data.push(
      live(60.0, 'follicular'), live(60.4, 'follicular'), live(60.8, 'follicular'),
      live(61.2, 'follicular'), live(61.6, 'follicular'),
    );
    const { baseline } = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.8);
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({
      weight_baseline_kg: 60.8,
    }));
  });

  it("learns a personal luteal band from the user's own readings", async () => {
    // Baseline = follicular median 60.0. Luteal readings cluster ~+0.2 kg, a
    // flat cycle, so the learned luteal band should sit near zero, NOT the
    // population +0.5..+2.0.
    supabaseMock.__data.push(
      live(59.8, 'follicular'), live(60.0, 'follicular'), live(60.0, 'follicular'),
      live(60.0, 'follicular'), live(60.2, 'follicular'),
      live(60.1, 'luteal'), live(60.2, 'luteal'), live(60.3, 'luteal'), live(60.2, 'luteal'),
    );
    const { baseline, bands } = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.0);
    expect(bands?.luteal).toBeDefined();
    expect(bands!.luteal!.lower).toBeLessThan(0.5);
    expect(bands!.luteal!.upper).toBeLessThan(2.0);
  });

  // Card 239: the case Emma actually reported. Opting into weight tracking
  // backfills a year of HealthKit history, every reading of it phase-stamped by
  // projecting one just-typed period start backwards. That used to clear the
  // five-reading minimum instantly and hand back a PERSONALISED band built
  // entirely on labels nobody observed.
  it('does not personalise the band from backfilled history alone', async () => {
    supabaseMock.__data.push(
      backfilled(59.8, 'follicular'), backfilled(60.0, 'follicular'),
      backfilled(60.0, 'follicular'), backfilled(60.0, 'follicular'),
      backfilled(60.2, 'follicular'),
      backfilled(60.1, 'luteal'), backfilled(60.2, 'luteal'),
      backfilled(60.3, 'luteal'), backfilled(60.2, 'luteal'),
    );
    const { baseline, bands } = await computeBaseline('user-1');
    // The chart still works: the baseline computes and the weight still plots.
    expect(baseline).toBeCloseTo(60.0);
    // But the band waits, and the population fallback covers the interim.
    expect(bands).toBeNull();
  });

  it('personalises once enough follicular readings were actually observed', async () => {
    supabaseMock.__data.push(
      backfilled(59.8, 'follicular'), backfilled(60.0, 'follicular'),
      live(60.0, 'follicular'), live(60.0, 'follicular'), live(60.2, 'follicular'),
      live(60.1, 'luteal'), live(60.2, 'luteal'), live(60.3, 'luteal'), live(60.2, 'luteal'),
    );
    const { bands } = await computeBaseline('user-1');
    expect(bands?.luteal).toBeDefined();
  });

  it('does not personalise when no period start has ever been logged', async () => {
    supabaseMock.__state.firstPeriodStart = null;
    supabaseMock.__data.push(
      live(59.8, 'follicular'), live(60.0, 'follicular'), live(60.0, 'follicular'),
      live(60.0, 'follicular'), live(60.2, 'follicular'), live(60.2, 'luteal'),
    );
    const { baseline, bands } = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.0);
    expect(bands).toBeNull();
  });
});
