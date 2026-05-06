import { getCyclePhase } from '@/lib/cycleEngine';

const day = (n: number, from: Date) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
};

describe('getCyclePhase', () => {
  const start = new Date('2025-01-01');
  const len28 = 28;

  // ── Menstrual (days 1–5) ──────────────────────────────────────────
  it('returns menstrual on day 1 (period start)', () => {
    expect(getCyclePhase(start, len28, start)).toBe('menstrual');
  });

  it('returns menstrual on day 5 (last bleed day)', () => {
    expect(getCyclePhase(start, len28, day(4, start))).toBe('menstrual');
  });

  // ── Follicular (days 6 – ovulation-2) ───────────────────────────
  it('returns follicular on day 6', () => {
    expect(getCyclePhase(start, len28, day(5, start))).toBe('follicular');
  });

  it('returns follicular on day 12 (day before ovulatory window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(11, start))).toBe('follicular');
  });

  // ── Ovulatory (ovulation day ±1, ovulation = cycleLength − 14) ───
  it('returns ovulatory on day 13 (start of window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(12, start))).toBe('ovulatory');
  });

  it('returns ovulatory on day 14 (peak, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(13, start))).toBe('ovulatory');
  });

  it('returns ovulatory on day 15 (end of window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(14, start))).toBe('ovulatory');
  });

  // ── Luteal (after ovulatory → end of cycle) ──────────────────────
  it('returns luteal on day 16', () => {
    expect(getCyclePhase(start, len28, day(15, start))).toBe('luteal');
  });

  it('returns luteal on day 28 (last day of cycle)', () => {
    expect(getCyclePhase(start, len28, day(27, start))).toBe('luteal');
  });

  // ── Multi-cycle wrapping ──────────────────────────────────────────
  it('wraps into next cycle correctly (day 29 = day 1 of cycle 2)', () => {
    expect(getCyclePhase(start, len28, day(28, start))).toBe('menstrual');
  });

  it('handles 3 full cycles elapsed', () => {
    expect(getCyclePhase(start, len28, day(84, start))).toBe('menstrual');
  });

  // ── Non-standard cycle lengths ────────────────────────────────────
  it('returns ovulatory at correct window for 30-day cycle (ovulation = day 16)', () => {
    expect(getCyclePhase(start, 30, day(15, start))).toBe('ovulatory');
  });

  it('returns luteal from day 18 in a 30-day cycle', () => {
    expect(getCyclePhase(start, 30, day(17, start))).toBe('luteal');
  });

  it('returns follicular correctly in a 35-day cycle', () => {
    expect(getCyclePhase(start, 35, day(10, start))).toBe('follicular');
  });
});
