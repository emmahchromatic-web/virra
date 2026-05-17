import { buildCycleCalendar } from '@/lib/cycleCalendar';

describe('buildCycleCalendar', () => {
  const start = new Date('2025-01-01');
  const cal28 = buildCycleCalendar(start, 28);

  it('returns one entry per day in the cycle', () => {
    expect(cal28).toHaveLength(28);
  });

  it('numbers days 1..cycleLength', () => {
    expect(cal28[0].dayOfCycle).toBe(1);
    expect(cal28[27].dayOfCycle).toBe(28);
  });

  it('marks days 1-5 as menstrual', () => {
    for (let i = 0; i < 5; i++) {
      expect(cal28[i].phase).toBe('menstrual');
      expect(cal28[i].isBleed).toBe(true);
    }
  });

  it('marks day 6 as follicular', () => {
    expect(cal28[5].phase).toBe('follicular');
    expect(cal28[5].isBleed).toBe(false);
  });

  it('marks day 14 (28-day cycle, ovulation = 28-14 = day 14) as ovulatory', () => {
    expect(cal28[13].phase).toBe('ovulatory');
  });

  it('marks the last day as luteal', () => {
    expect(cal28[27].phase).toBe('luteal');
  });

  it('exposes the absolute date for each day', () => {
    expect(cal28[0].date.toDateString()).toBe(start.toDateString());
    const dayThree = new Date(start);
    dayThree.setDate(start.getDate() + 2);
    expect(cal28[2].date.toDateString()).toBe(dayThree.toDateString());
  });

  it('works for a 35-day cycle', () => {
    const cal35 = buildCycleCalendar(start, 35);
    expect(cal35).toHaveLength(35);
    expect(cal35[20].phase).toBe('ovulatory');
  });
});
