import { weekStatus, expectedKmByNow, sessionsDue, type WeekProgressInput } from '@/lib/weekProgress';

// Dates verified against the calendar: Mon 14 · Tue 15 · Wed 16 · Sat 19 Sep 2026.
const MON = '2026-09-14', TUE = '2026-09-15', WED = '2026-09-16', SAT = '2026-09-19';
const WEEK = [MON, WED, SAT];

const input = (over: Partial<WeekProgressInput> = {}): WeekProgressInput => ({
  planComplete: false, hasWeek: true, isStrength: false,
  weekKm: 12, actualKm: 0, sessionDates: WEEK, todayISO: MON, ...over,
});

describe('the bug this replaces', () => {
  it('does not call a runner BEHIND on the first day of a plan', () => {
    // The old formula charged a seventh of the week the moment day one began.
    expect(weekStatus(input({ todayISO: MON, actualKm: 0 }))).toBe('ON TRACK');
  });

  it('does not count today\'s session as missed before the day is over', () => {
    expect(sessionsDue(WEEK, MON)).toBe(0);
  });

  it('does not count a rest day against the runner', () => {
    // Tuesday is a rest day; the only thing due is Monday's session.
    expect(expectedKmByNow(12, WEEK, TUE)).toBe(4);
  });
});

describe('when a session has actually gone by', () => {
  it('is BEHIND once a session passes with nothing logged', () => {
    expect(weekStatus(input({ todayISO: TUE, actualKm: 0 }))).toBe('BEHIND');
  });

  it('is ON TRACK when that session was run', () => {
    expect(weekStatus(input({ todayISO: TUE, actualKm: 4 }))).toBe('ON TRACK');
  });

  it('keeps the 80% tolerance: a little short is still on track', () => {
    // 4 km due, 3.2 is exactly 80%.
    expect(weekStatus(input({ todayISO: TUE, actualKm: 3.2 }))).toBe('ON TRACK');
    expect(weekStatus(input({ todayISO: TUE, actualKm: 3.1 }))).toBe('BEHIND');
  });

  it('expects two sessions\' worth once two have passed', () => {
    // Saturday: Monday and Wednesday are gone, Saturday itself is not.
    expect(expectedKmByNow(12, WEEK, SAT)).toBe(8);
  });
});

describe('the short first week card 281 now produces', () => {
  it('asks nothing of a week with no sessions in it', () => {
    // A Sunday start with no training day left: an empty first week.
    expect(weekStatus(input({ sessionDates: [], todayISO: '2026-09-20' }))).toBe('ON TRACK');
    expect(expectedKmByNow(12, [], '2026-09-20')).toBe(0);
  });

  it('judges a one-session week against that one session', () => {
    expect(expectedKmByNow(12, [SAT], '2026-09-20')).toBe(12);
  });
});

describe('the states that do not depend on the date', () => {
  it('reports WEEK DONE once the week\'s distance is covered', () => {
    expect(weekStatus(input({ actualKm: 12 }))).toBe('WEEK DONE');
  });

  it('reports PLAN COMPLETE ahead of everything', () => {
    expect(weekStatus(input({ planComplete: true, actualKm: 0, todayISO: SAT }))).toBe('PLAN COMPLETE');
  });

  it('says nothing for strength plans or when there is no week', () => {
    expect(weekStatus(input({ isStrength: true }))).toBeNull();
    expect(weekStatus(input({ hasWeek: false }))).toBeNull();
  });
});
