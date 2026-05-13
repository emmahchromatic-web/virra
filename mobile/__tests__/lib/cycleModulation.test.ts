import { modulateForCycle, anchorKeySession } from '@/lib/cycleModulation';

const baseTempo = { pace_seconds_per_km: 275, intensity_label: 'Threshold' }; // 4:35/km

describe('modulateForCycle', () => {
  test('tempo in luteal slows the pace and surfaces a reason', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(295);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('tempo in follicular is baseline (no modulation)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'follicular', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('tempo in ovulatory speeds up slightly (peak power)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'ovulatory', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(275);
    expect(r.reason).toContain('peak power');
  });

  test('hormonal cycle profile bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal');
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBeNull();
  });

  test('menopause cycle profile bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'menopause');
    expect(r.reason).toBeNull();
  });

  test('irregular cycle profile uses conservative half-magnitude modifiers', () => {
    const luteal_natural   = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural');
    const luteal_irregular = modulateForCycle(baseTempo, 'tempo', 'luteal', 'irregular');
    const natural_delta   = luteal_natural.adjusted_target.pace_seconds_per_km!   - 275;
    const irregular_delta = luteal_irregular.adjusted_target.pace_seconds_per_km! - 275;
    expect(irregular_delta).toBeLessThan(natural_delta);
    expect(irregular_delta).toBeGreaterThan(0);
    expect(luteal_irregular.reason).toContain('estimated');
  });

  test('long run in menstrual gets walk-friendly slower pace', () => {
    const baseLong = { pace_seconds_per_km: 330, intensity_label: 'Easy long' };
    const r = modulateForCycle(baseLong, 'long', 'menstrual', 'natural');
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
});
