import {
  planStartOptions,
  sessionsInFirstWeek,
  describeFirstWeek,
  localISO,
} from '@/lib/planStart';

// Weekdays verified against the real calendar, not assumed:
//   Mon 7 · Tue 8 · Wed 9 · Thu 10 · Fri 11 · Sat 12 · Sun 13 · Mon 14 Sep 2026
// Training day indices are Monday = 0, matching generateSchedule.
const sep = (day: number, hour = 14) => new Date(2026, 8, day, hour, 0);
const MON_WED_SAT = [0, 2, 5];

describe('sessionsInFirstWeek', () => {
  it('counts only the sessions on or after the start', () => {
    // Saturday start: Monday and Wednesday are already gone, Saturday remains.
    expect(sessionsInFirstWeek(sep(12), MON_WED_SAT)).toBe(1);
  });

  it('gives a whole week from a Monday', () => {
    expect(sessionsInFirstWeek(sep(14), MON_WED_SAT)).toBe(3);
  });

  it('gives nothing from a Sunday when no training day is left', () => {
    expect(sessionsInFirstWeek(sep(13), MON_WED_SAT)).toBe(0);
  });

  it('keeps a session that falls on the start day itself', () => {
    // Tuesday start: Mon is past, Wed and Sat remain.
    expect(sessionsInFirstWeek(sep(8), MON_WED_SAT)).toBe(2);
  });

  it('counts a session on a Sunday start when Sunday is a training day', () => {
    expect(sessionsInFirstWeek(sep(13), [0, 6])).toBe(1);
  });
});

describe('planStartOptions', () => {
  it('offers today, tomorrow and Monday on a Saturday', () => {
    const opts = planStartOptions(sep(12), MON_WED_SAT);
    expect(opts.map((o) => o.label)).toEqual(['Today', 'Tomorrow', 'Monday']);
    expect(opts.map((o) => o.iso)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
  });

  it('says what each choice actually gives the runner', () => {
    const [today, tomorrow, monday] = planStartOptions(sep(12), MON_WED_SAT);
    expect(today.sessionsInFirstWeek).toBe(1);
    expect(tomorrow.sessionsInFirstWeek).toBe(0);
    expect(monday.fullWeek).toBe(true);
  });

  it('does not offer the same day twice on a Sunday, where tomorrow IS Monday', () => {
    const opts = planStartOptions(sep(13), MON_WED_SAT);
    expect(opts.map((o) => o.iso)).toEqual(['2026-09-13', '2026-09-14']);
    expect(new Set(opts.map((o) => o.iso)).size).toBe(opts.length);
  });

  it('on a Monday, "Monday" means next Monday, not today', () => {
    const opts = planStartOptions(sep(14), MON_WED_SAT);
    expect(opts.map((o) => o.iso)).toEqual(['2026-09-14', '2026-09-15', '2026-09-21']);
    expect(opts[0].fullWeek).toBe(true);
  });

  it('labels dates the way a runner reads them', () => {
    const [today] = planStartOptions(sep(12), MON_WED_SAT);
    expect(today.dateLabel).toBe('Sat 12 Sep');
  });

  it('never offers a date in the past', () => {
    for (let d = 7; d <= 20; d++) {
      const now = sep(d);
      for (const o of planStartOptions(now, MON_WED_SAT)) {
        expect(o.iso >= localISO(now)).toBe(true);
      }
    }
  });

  it('always offers at least two genuinely different choices', () => {
    for (let d = 7; d <= 20; d++) {
      expect(planStartOptions(sep(d), MON_WED_SAT).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('always includes a start that gives a whole first week', () => {
    // Whatever day it is, a runner who wants a clean week must be able to get one.
    for (let d = 7; d <= 20; d++) {
      expect(planStartOptions(sep(d), MON_WED_SAT).some((o) => o.fullWeek)).toBe(true);
    }
  });
});

describe('localISO', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 00:30 local. toISOString() would report the previous day in any timezone
    // ahead of UTC, which is the BST-after-midnight bug this avoids.
    expect(localISO(new Date(2026, 8, 13, 0, 30))).toBe('2026-09-13');
  });
});

describe('describeFirstWeek', () => {
  const opt = (n: number, full = false) =>
    ({ iso: '', label: '', dateLabel: '', sessionsInFirstWeek: n, fullWeek: full });

  it('reads naturally for each case', () => {
    expect(describeFirstWeek(opt(3, true))).toBe('Full first week');
    expect(describeFirstWeek(opt(0))).toBe('No sessions this week');
    expect(describeFirstWeek(opt(1))).toBe('1 session this week');
    expect(describeFirstWeek(opt(2))).toBe('2 sessions this week');
  });
});
