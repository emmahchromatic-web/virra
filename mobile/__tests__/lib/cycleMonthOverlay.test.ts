import { getCycleDayOverlay } from '@/lib/cycleMonthOverlay';

describe('getCycleDayOverlay', () => {
  const periodStart = new Date('2025-01-01');
  const len28       = 28;

  it('returns dayOfCycle=1 / menstrual / bleed for periodStart itself', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2025-01-01'));
    expect(o.dayOfCycle).toBe(1);
    expect(o.phase).toBe('menstrual');
    expect(o.isBleed).toBe(true);
  });

  it('returns dayOfCycle=5 still in bleed on day 5', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2025-01-05'));
    expect(o.dayOfCycle).toBe(5);
    expect(o.isBleed).toBe(true);
  });

  it('returns dayOfCycle=6 follicular on day 6 (no bleed)', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2025-01-06'));
    expect(o.dayOfCycle).toBe(6);
    expect(o.phase).toBe('follicular');
    expect(o.isBleed).toBe(false);
  });

  it('returns ovulatory on day 14 of a 28-day cycle', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2025-01-14'));
    expect(o.dayOfCycle).toBe(14);
    expect(o.phase).toBe('ovulatory');
  });

  it('wraps forward: day 29 maps to dayOfCycle=1 of next cycle', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2025-01-29'));
    expect(o.dayOfCycle).toBe(1);
    expect(o.phase).toBe('menstrual');
    expect(o.isBleed).toBe(true);
  });

  it('projects backward: day before periodStart is the last day of the previous cycle', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2024-12-31'));
    expect(o.dayOfCycle).toBe(28);
    expect(o.phase).toBe('luteal');
  });

  it('projects backward: 7 days before periodStart is dayOfCycle=22 (luteal)', () => {
    const o = getCycleDayOverlay(periodStart, len28, new Date('2024-12-25'));
    expect(o.dayOfCycle).toBe(22);
    expect(o.phase).toBe('luteal');
  });

  it('handles a 35-day cycle ovulation on day 21', () => {
    const o = getCycleDayOverlay(periodStart, 35, new Date('2025-01-21'));
    expect(o.dayOfCycle).toBe(21);
    expect(o.phase).toBe('ovulatory');
  });
});
