import { tracksCycle, deriveCycleMode } from '@/lib/cycleEngine';
import { withinRetroPhaseWindow, RETRO_PHASE_WINDOW_DAYS } from '@/lib/healthKitWeight';
import { countLiveFollicular, MIN_LIVE_FOLLICULAR } from '@/lib/weightBaseline';

describe('tracksCycle — card 238', () => {
  it('treats perimenopause as still cycling', () => {
    // The whole point: perimenopause means cycles are CHANGING, not absent.
    expect(tracksCycle('perimenopause')).toBe(true);
    expect(deriveCycleMode('perimenopause', null)).toBe('flow');
  });

  it('keeps the profiles that genuinely have no cycle on steady', () => {
    for (const p of ['menopause', 'pregnant_postpartum', 'prefer_not_to_say'] as const) {
      expect(tracksCycle(p)).toBe(false);
      expect(deriveCycleMode(p, null)).toBe('steady');
    }
  });

  it('leaves the existing profiles exactly as they were', () => {
    expect(deriveCycleMode('natural', null)).toBe('flow');
    expect(deriveCycleMode('irregular', null)).toBe('flow');
    expect(deriveCycleMode('hormonal', true)).toBe('pack');
    expect(deriveCycleMode('hormonal', false)).toBe('steady');
  });

  it('is null-safe, since callers read it off a store that loads late', () => {
    expect(tracksCycle(null)).toBe(false);
    expect(tracksCycle(undefined)).toBe(false);
  });
});

describe('withinRetroPhaseWindow — card 239', () => {
  const periodStart = new Date('2026-08-01T00:00:00Z');
  const daysBefore = (n: number) =>
    new Date(periodStart.getTime() - n * 86400000);

  it('stamps a reading just inside the window', () => {
    expect(withinRetroPhaseWindow(daysBefore(RETRO_PHASE_WINDOW_DAYS - 1), periodStart)).toBe(true);
  });

  it('refuses a reading well before it — a year of backfill must not be labelled', () => {
    expect(withinRetroPhaseWindow(daysBefore(365), periodStart)).toBe(false);
    expect(withinRetroPhaseWindow(daysBefore(RETRO_PHASE_WINDOW_DAYS + 1), periodStart)).toBe(false);
  });

  it('never caps readings after the period start — those project forward', () => {
    const later = new Date(periodStart.getTime() + 400 * 86400000);
    expect(withinRetroPhaseWindow(later, periodStart)).toBe(true);
  });
});

describe('countLiveFollicular — card 239', () => {
  const rows = [
    { weight_kg: 60, cycle_phase_at_time: 'follicular' as const, recorded_on: '2026-05-01' }, // backfilled
    { weight_kg: 61, cycle_phase_at_time: 'follicular' as const, recorded_on: '2026-08-02' },
    { weight_kg: 62, cycle_phase_at_time: 'follicular' as const, recorded_on: '2026-08-03' },
    { weight_kg: 63, cycle_phase_at_time: 'luteal'     as const, recorded_on: '2026-08-10' },
  ];

  it('counts only follicular readings from a cycle we knew about', () => {
    expect(countLiveFollicular(rows, '2026-08-01')).toBe(2);
  });

  it('counts nothing when no period start has ever been logged', () => {
    // Without one, every phase label was manufactured, so none is observed.
    expect(countLiveFollicular(rows, null)).toBe(0);
  });

  it('does not count a reading with no date', () => {
    const undated = [{ weight_kg: 60, cycle_phase_at_time: 'follicular' as const }];
    expect(countLiveFollicular(undated, '2026-01-01')).toBe(0);
  });

  it('a fresh opt-in with a year of scale history does not reach the threshold', () => {
    // The exact case Emma reported: instant "calibrated" off backfilled data.
    const backfillOnly = Array.from({ length: 40 }, (_, i) => ({
      weight_kg: 60,
      cycle_phase_at_time: 'follicular' as const,
      recorded_on: `2026-0${1 + (i % 6)}-15`,
    }));
    expect(countLiveFollicular(backfillOnly, '2026-08-01')).toBeLessThan(MIN_LIVE_FOLLICULAR);
  });
});
