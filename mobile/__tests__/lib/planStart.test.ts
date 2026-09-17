import {
  planStartOptions,
  sessionsInFirstWeek,
  describeFirstWeek,
  localISO,
  addDaysISO,
  raceStart,
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

describe('addDaysISO', () => {
  // Expected values computed with Python's datetime, not by hand.
  it('adds a plan\'s length to its start', () => {
    expect(addDaysISO('2026-09-14', 63)).toBe('2026-11-16');
  });

  it('crosses a month and a year', () => {
    expect(addDaysISO('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDaysISO('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('ends the plan after its final race, not before it', () => {
    // The regression: on Tuesday 15 Sep the runner picks next Monday, 21 Sep.
    // Counted from "now" the plan ended Tue 17 Nov; week 9's parkrun is Sat
    // 21 Nov, so the plan vanished from active blocks four days before it.
    const chosenStart = '2026-09-21';
    const raceDay     = addDaysISO(chosenStart, 8 * 7 + 5);  // week 9, Saturday
    const planEnd     = addDaysISO(chosenStart, 9 * 7);
    expect(raceDay).toBe('2026-11-21');
    expect(planEnd).toBe('2026-11-23');
    expect(planEnd >= raceDay).toBe(true);

    const oldEnd = addDaysISO('2026-09-15', 9 * 7);  // counted from the Tuesday
    expect(oldEnd < raceDay).toBe(true);
  });
});

describe('raceStart (card 301)', () => {
  // Thu 17 Sep 2026. Races are Sundays: Sun 13 Dec (race week starts Mon 7 Dec)
  // and Sun 29 Nov (race week starts Mon 23 Nov).
  const now = sep(17);
  const dec13 = new Date(2026, 11, 13, 9, 0);
  const nov29 = new Date(2026, 10, 29, 9, 0);

  it('counts back by the length the runner chose, not the template\'s', () => {
    // Emma's case: Beginner 5K set to 12 weeks, a December race. The template's
    // 8 weeks started it in October.
    expect(raceStart(dec13, 12, now)).toEqual({ start: '2026-09-21', weeks: 12, startsToday: false });
    expect(raceStart(dec13, 8, now).start).toBe('2026-10-19');
  });

  it('ends in race week: the last of the weeks is the week of the race', () => {
    const { start, weeks } = raceStart(dec13, 12, now);
    expect(addDaysISO(start, (weeks - 1) * 7)).toBe('2026-12-07');
  });

  it('starts today with the weeks that are left when the full length no longer fits', () => {
    // 12 weeks back from Mon 23 Nov is Mon 7 Sep, already gone. Mon 14 Sep's
    // week to race week is 11 weeks.
    expect(raceStart(nov29, 12, now)).toEqual({ start: '2026-09-17', weeks: 11, startsToday: true });
  });

  it('keeps the full length when the start falls earlier in this same week', () => {
    // 11 weeks back from Mon 23 Nov is Mon 14 Sep, the Monday just gone.
    expect(raceStart(nov29, 11, now)).toEqual({ start: '2026-09-17', weeks: 11, startsToday: true });
  });

  it('never offers fewer than one week', () => {
    expect(raceStart(sep(20), 8, now).weeks).toBe(1);
  });
});
