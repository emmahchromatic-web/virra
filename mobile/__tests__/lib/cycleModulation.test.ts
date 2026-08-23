import { modulateForCycle, anchorKeySession } from '@/lib/cycleModulation';

const baseTempo = { pace_seconds_per_km: 275, intensity_label: 'Threshold' };

describe('modulateForCycle', () => {
  test('tempo in luteal slows the pace and surfaces a reason', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(295);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('tempo in follicular is baseline (no modulation)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'follicular', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBe('follicular');
  });

  test('tempo in ovulatory speeds up slightly (peak power)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'ovulatory', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(275);
    expect(r.reason).toContain('peak power');
  });

  test('hormonal + no placebo week → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', false);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBeNull();
  });

  test('hormonal + null placebo week → steady (legacy / unanswered)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('hormonal + has_placebo_week true → pack, applies full modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', true);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('pregnant_postpartum → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'pregnant_postpartum', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('prefer_not_to_say → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'prefer_not_to_say', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('menopause → steady, bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'menopause', null);
    expect(r.reason).toBeNull();
  });

  test('irregular cycle profile uses conservative half-magnitude modifiers', () => {
    const luteal_natural   = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural', null);
    const luteal_irregular = modulateForCycle(baseTempo, 'tempo', 'luteal', 'irregular', null);
    const natural_delta    = luteal_natural.adjusted_target.pace_seconds_per_km!   - 275;
    const irregular_delta  = luteal_irregular.adjusted_target.pace_seconds_per_km! - 275;
    expect(irregular_delta).toBeLessThan(natural_delta);
    expect(irregular_delta).toBeGreaterThan(0);
    expect(luteal_irregular.reason).toContain('estimated');
  });

  test('long run in menstrual gets walk-friendly slower pace', () => {
    const baseLong = { pace_seconds_per_km: 330, intensity_label: 'Easy long' };
    const r = modulateForCycle(baseLong, 'long', 'menstrual', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(330);
    expect(r.reason).toContain('walk');
  });
});

describe('anchorKeySession', () => {
  test('long run anchors to follicular over luteal', () => {
    const result = anchorKeySession([
      { date: '2026-04-28', cycle_phase: 'luteal'     },
      { date: '2026-04-29', cycle_phase: 'follicular' },
      { date: '2026-05-01', cycle_phase: 'menstrual'  },
    ], 'long');
    expect(result).toBe('2026-04-29');
  });

  test('intervals anchor to ovulatory over follicular', () => {
    const result = anchorKeySession([
      { date: '2026-05-04', cycle_phase: 'follicular' },
      { date: '2026-05-06', cycle_phase: 'ovulatory'  },
      { date: '2026-05-08', cycle_phase: 'luteal'     },
    ], 'intervals');
    expect(result).toBe('2026-05-06');
  });

  test('non-key sessions return the first candidate (no anchoring)', () => {
    const result = anchorKeySession([
      { date: '2026-05-04', cycle_phase: 'luteal'     },
      { date: '2026-05-05', cycle_phase: 'follicular' },
    ], 'easy');
    expect(result).toBe('2026-05-04');
  });

  test('ties on rank break by earliest date', () => {
    const result = anchorKeySession([
      { date: '2026-05-05', cycle_phase: 'follicular' },
      { date: '2026-05-04', cycle_phase: 'follicular' },
    ], 'long');
    expect(result).toBe('2026-05-04');
  });

  test('strength anchors to ovulatory over follicular', () => {
    const result = anchorKeySession([
      { date: '2026-05-04', cycle_phase: 'follicular' },
      { date: '2026-05-06', cycle_phase: 'ovulatory'  },
      { date: '2026-05-08', cycle_phase: 'luteal'     },
    ], 'strength');
    expect(result).toBe('2026-05-06');
  });

  test('null cycle_phase candidates fall back to earliest date', () => {
    const result = anchorKeySession([
      { date: '2026-05-06', cycle_phase: null },
      { date: '2026-05-04', cycle_phase: null },
      { date: '2026-05-05', cycle_phase: null },
    ], 'long');
    expect(result).toBe('2026-05-04');
  });
});


// The session card shows a shortened reason, derived in todaysSession.ts by
// splitting on the first "." or ":". That split is load-bearing: the reasons
// used to lead with "<phase> — ..." and now lead with "<phase>: ...", so this
// guards the phrasing that keeps the short reason readable.
describe('reason phrasing feeds the short reason on the session card', () => {
  const shorten = (reason: string) => reason.split(/[.:]/)[0]?.trim() ?? '';

  const CASES = [
    ['easy',      'menstrual', 'Menstrual phase'],
    ['tempo',     'luteal',    'Luteal phase'],
    ['intervals', 'ovulatory', 'Ovulatory phase'],
    ['strength',  'menstrual', 'Menstrual phase'],
    ['race',      'menstrual', 'Race day in your menstrual phase'],
  ] as const;

  it.each(CASES)('%s in the %s phase shortens to "%s"', (type, phase, expected) => {
    const result = modulateForCycle({ intensity_label: 'Session' }, type, phase, 'natural', null);
    expect(result.reason).toBeTruthy();
    expect(shorten(result.reason!)).toBe(expected);
  });

  it('carries no em-dashes in any reason copy', () => {
    const types  = ['easy', 'tempo', 'intervals', 'long', 'race', 'strength'] as const;
    const phases = ['menstrual', 'follicular', 'ovulatory', 'luteal'] as const;
    for (const t of types) {
      for (const ph of phases) {
        const { reason } = modulateForCycle({ intensity_label: 'Session' }, t, ph, 'natural', null);
        if (reason) expect(reason).not.toMatch(/\u2014/);
      }
    }
  });
});
