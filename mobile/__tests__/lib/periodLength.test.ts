import {
  getCycleInfo, phaseForCycleDay, effectivePeriodDays, clampPeriodDays, DEFAULT_PERIOD_DAYS,
} from '@/lib/cycleEngine';
import { getCycleDayOverlay } from '@/lib/cycleMonthOverlay';
import { periodEndChoices, periodDaysEndingOn } from '@/lib/periodEnd';
import { splitPeriodLengths } from '@/store/cycle';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const start = new Date(2026, 8, 1);                      // 1 Sep, local midnight
const dayN  = (n: number) => new Date(2026, 8, n);       // day n of the cycle

/** Card 304: the menstrual phase lasts as long as the period did. */
describe('period length in the engine', () => {
  it('a 3-day period makes day 4 follicular', () => {
    expect(getCycleInfo(start, 28, dayN(3), 3).phase).toBe('menstrual');
    expect(getCycleInfo(start, 28, dayN(4), 3).phase).toBe('follicular');
  });

  it('the old 5 days still reads the same', () => {
    expect(getCycleInfo(start, 28, dayN(5), 5).phase).toBe('menstrual');
    expect(getCycleInfo(start, 28, dayN(6), 5).phase).toBe('follicular');
  });

  it('a 7-day period extends the menstrual phase', () => {
    expect(getCycleInfo(start, 28, dayN(7), 7).phase).toBe('menstrual');
    expect(getCycleInfo(start, 28, dayN(8), 7).phase).toBe('follicular');
  });

  it('does not move ovulation or the luteal phase', () => {
    for (const len of [3, 5, 7]) {
      expect(phaseForCycleDay(14, 28, len)).toBe('ovulatory');
      expect(phaseForCycleDay(16, 28, len)).toBe('luteal');
    }
  });

  it('applies to later cycles projected from the same start', () => {
    // Day 4 of the next cycle.
    expect(getCycleInfo(start, 28, dayN(32), 3).phase).toBe('follicular');
  });
});

describe('the calendar overlay', () => {
  it('stops the bleed dots after the logged length', () => {
    expect(getCycleDayOverlay(start, 28, dayN(3), 3).isBleed).toBe(true);
    expect(getCycleDayOverlay(start, 28, dayN(4), 3).isBleed).toBe(false);
    expect(getCycleDayOverlay(start, 28, dayN(4), 3).phase).toBe('follicular');
  });
});

describe('effectivePeriodDays', () => {
  it("uses this period's logged length first", () => {
    expect(effectivePeriodDays(3, [6, 6, 6])).toEqual({ days: 3, logged: true });
  });

  it('otherwise averages the last three logged periods', () => {
    expect(effectivePeriodDays(null, [3, 4, 3])).toEqual({ days: 3, logged: false });
    expect(effectivePeriodDays(null, [4, 5, 5, 1])).toEqual({ days: 5, logged: false }); // 4.67, 4th ignored
  });

  it('falls back to 5 with no history', () => {
    expect(effectivePeriodDays(null, [])).toEqual({ days: DEFAULT_PERIOD_DAYS, logged: false });
    expect(effectivePeriodDays(undefined, [null, null])).toEqual({ days: 5, logged: false });
  });

  it('keeps any length within 1 to 10', () => {
    expect(clampPeriodDays(0)).toBe(1);
    expect(clampPeriodDays(14)).toBe(10);
  });
});

describe('periodEndChoices', () => {
  it('offers today, yesterday and two days ago on day 3', () => {
    expect(periodEndChoices(start, dayN(3))).toEqual([
      { label: 'Today · day 3',      periodDays: 3 },
      { label: 'Yesterday · day 2',  periodDays: 2 },
      { label: '2 days ago · day 1', periodDays: 1 },
    ]);
  });

  it('never offers a day before the period started', () => {
    expect(periodEndChoices(start, dayN(1)).map((c) => c.periodDays)).toEqual([1]);
    expect(periodEndChoices(start, new Date(2026, 7, 31))).toEqual([]);
  });

  it('is offered through day 10 and not after', () => {
    expect(periodEndChoices(start, dayN(10))[0].periodDays).toBe(10);
    expect(periodEndChoices(start, dayN(11))).toEqual([]);
  });

  it('counts the start day as day 1', () => {
    expect(periodDaysEndingOn(start, dayN(3))).toBe(3);
  });
});

describe('splitPeriodLengths', () => {
  it("separates this period's length from earlier ones, first row per date winning", () => {
    const rows = [
      { period_start: '2026-09-01', period_length_days: 3 },
      { period_start: '2026-09-01', period_length_days: 6 },   // older duplicate
      { period_start: '2026-08-04', period_length_days: 4 },
      { period_start: '2026-07-07', period_length_days: null },
      { period_start: '2026-06-09', period_length_days: 5 },
    ];
    expect(splitPeriodLengths(rows, '2026-09-01')).toEqual({ current: 3, recent: [4, 5] });
  });
});
