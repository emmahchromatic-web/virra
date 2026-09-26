import { toIso, todayIso, fromIso, shiftIso, daysAgo } from '@/lib/localDate';

describe('localDate', () => {
  it('reads the date the user is standing in, not the UTC one', () => {
    // A picker hands back local midnight. On BST that is 23:00 UTC the day
    // before, which is how `toISOString()` stored every picked date a day
    // early for seven months of the year (card 325).
    const picked = new Date(2026, 6, 15); // 15 July 2026, local midnight
    expect(toIso(picked)).toBe('2026-07-15');
    if (new Date(2026, 6, 15).getTimezoneOffset() < 0) {
      // Only east of UTC does the old idiom disagree; assert it really is the
      // bug this helper exists to stop, rather than trusting the comment.
      expect(picked.toISOString().split('T')[0]).toBe('2026-07-14');
    }
  });

  it('round-trips through local midnight', () => {
    expect(toIso(fromIso('2026-03-29'))).toBe('2026-03-29');
    expect(toIso(fromIso('2026-10-25'))).toBe('2026-10-25');
  });

  it('steps whole calendar days across a clock change', () => {
    // 29 Mar 2026 is the BST spring-forward: a 23-hour day. Adding
    // 86400000ms would land on the 30th at 01:00 and still read as the 30th,
    // but subtracting it from the 30th lands at 23:00 on the 29th -- the
    // asymmetry that makes millisecond arithmetic unsafe here.
    expect(shiftIso('2026-03-28', 1)).toBe('2026-03-29');
    expect(shiftIso('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftIso('2026-03-30', -1)).toBe('2026-03-29');
    expect(shiftIso('2026-10-25', -1)).toBe('2026-10-24'); // autumn, 25 hours
    expect(shiftIso('2026-09-26', -14)).toBe('2026-09-12');
  });

  it('counts whole days regardless of a clock change in the span', () => {
    expect(daysAgo('2026-03-29', '2026-03-30')).toBe(1);
    expect(daysAgo('2026-10-25', '2026-10-26')).toBe(1);
    expect(daysAgo('2026-09-12', '2026-09-26')).toBe(14);
    expect(daysAgo('2026-09-26', '2026-09-26')).toBe(0);
  });

  it('todayIso agrees with toIso(now)', () => {
    expect(todayIso()).toBe(toIso(new Date()));
  });
});
