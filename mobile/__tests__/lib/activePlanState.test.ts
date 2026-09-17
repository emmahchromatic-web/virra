import {
  isLiveSession,
  sessionsForBlock,
  currentWeekIndex,
  planDurationWeeks,
  seedDaysFromSchedule,
  remainingWeeks,
  occupiedDaysExcept,
  assignDay,
  type ScheduledSession,
} from '@/lib/activePlanState';

const sess = (over: Partial<ScheduledSession> = {}): ScheduledSession => ({
  block_id: 'block-a', status: 'planned', week_number: 3, day_of_week: 1, ...over,
});

describe('which sessions count', () => {
  it('keeps planned and completed work', () => {
    expect(isLiveSession(sess({ status: 'planned' }))).toBe(true);
    expect(isLiveSession(sess({ status: 'completed' }))).toBe(true);
  });

  it('drops the ones the runner no longer has', () => {
    expect(isLiveSession(sess({ status: 'moved' }))).toBe(false);
    expect(isLiveSession(sess({ status: 'dropped' }))).toBe(false);
  });
});

describe('sessionsForBlock', () => {
  it('counts only this plan, not everything in the week', () => {
    const week = [
      sess({ block_id: 'block-a' }),
      sess({ block_id: 'block-b' }),   // the strength plan in the other slot
      sess({ block_id: 'block-a' }),
    ];
    expect(sessionsForBlock(week, 'block-a')).toHaveLength(2);
  });

  it('ignores moved and dropped sessions, so a rearranged week is not overcounted', () => {
    const week = [
      sess({ status: 'planned' }),
      sess({ status: 'moved' }),
      sess({ status: 'dropped' }),
    ];
    expect(sessionsForBlock(week, 'block-a')).toHaveLength(1);
  });

  it('returns nothing when the runner is not on a plan at all', () => {
    expect(sessionsForBlock([sess()], null)).toEqual([]);
  });
});

describe('currentWeekIndex', () => {
  it('believes the schedule over the calendar', () => {
    // Started eight weeks ago, but the schedule says week 3 — because weeks
    // were moved, or the plan was rebuilt. The schedule is what the runner has.
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString();
    expect(currentWeekIndex([sess({ week_number: 3 })], eightWeeksAgo)).toBe(2);
  });

  it('falls back to counting from the start date when the week is empty', () => {
    const twoWeeksAgo = new Date(Date.now() - 2 * 7 * 86_400_000).toISOString();
    expect(currentWeekIndex([], twoWeeksAgo)).toBe(2);
  });

  it('puts a plan that starts today in week 1, not week 2', () => {
    // The reported symptom: "It has jumped to week 2 of base for me?"
    const today = new Date().toISOString();
    expect(currentWeekIndex([], today)).toBe(0);
    expect(currentWeekIndex([sess({ week_number: 1 })], today)).toBe(0);
  });

  it('never returns a negative week for a plan starting in the future', () => {
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
    expect(currentWeekIndex([], nextWeek)).toBe(0);
  });

  it('reports no week at all when there is no plan', () => {
    expect(currentWeekIndex([], null)).toBe(-1);
  });

  it('ignores a nonsense week number rather than returning -1 from it', () => {
    const today = new Date().toISOString();
    expect(currentWeekIndex([sess({ week_number: 0 })], today)).toBe(0);
  });
});

describe('planDurationWeeks', () => {
  it('recovers the span the runner actually chose', () => {
    expect(planDurationWeeks('2026-01-01', '2026-04-02')).toBe(13);
  });

  it('returns null for an ongoing plan rather than pretending it is zero weeks', () => {
    expect(planDurationWeeks('2026-01-01', null)).toBeNull();
    expect(planDurationWeeks(null, '2026-04-02')).toBeNull();
  });

  it('returns null rather than a negative span if the dates are the wrong way round', () => {
    expect(planDurationWeeks('2026-04-02', '2026-01-01')).toBeNull();
  });

  it('survives an unparseable date', () => {
    expect(planDurationWeeks('not-a-date', '2026-04-02')).toBeNull();
  });
});

describe('seedDaysFromSchedule', () => {
  const slots = [{ key: 'easy_0', day: 1 }, { key: 'long_0', day: 5 }];

  it('moves the picker onto the days the runner actually trains', () => {
    const mine = [
      sess({ day_of_week: 2 }), sess({ day_of_week: 6 }),
    ];
    expect(seedDaysFromSchedule(slots, mine).map((s) => s.day)).toEqual([2, 6]);
  });

  it('puts them in day order rather than the order they came back in', () => {
    const mine = [sess({ day_of_week: 6 }), sess({ day_of_week: 2 })];
    expect(seedDaysFromSchedule(slots, mine).map((s) => s.day)).toEqual([2, 6]);
  });

  it('does not count a day twice when it holds two sessions', () => {
    const mine = [sess({ day_of_week: 2 }), sess({ day_of_week: 2 }), sess({ day_of_week: 6 })];
    expect(seedDaysFromSchedule(slots, mine).map((s) => s.day)).toEqual([2, 6]);
  });

  it('leaves a slot alone when the runner has fewer days than slots', () => {
    const mine = [sess({ day_of_week: 3 })];
    expect(seedDaysFromSchedule(slots, mine).map((s) => s.day)).toEqual([3, 5]);
  });

  it('changes nothing at all when there is no schedule to read', () => {
    expect(seedDaysFromSchedule(slots, [])).toEqual(slots);
  });
});

describe('remainingWeeks', () => {
  it('offers what is left, not another full plan', () => {
    // Halfway through twelve weeks: adjusting should propose six, not twelve.
    expect(remainingWeeks(12, 6)).toBe(6);
  });

  it('never proposes a zero-week plan at the very end', () => {
    expect(remainingWeeks(12, 12)).toBe(1);
    expect(remainingWeeks(12, 40)).toBe(1);
  });

  it('treats a week index of -1 (not started) as the whole plan', () => {
    expect(remainingWeeks(12, -1)).toBe(12);
  });

  it('has nothing to offer for an ongoing plan', () => {
    expect(remainingWeeks(null, 3)).toBeNull();
  });
});

describe('occupiedDaysExcept (cards 282, 303)', () => {
  const run  = (over: Partial<ScheduledSession>) => ({ ...sess(over), modality: 'run' as const });
  const lift = (over: Partial<ScheduledSession>) => ({ ...sess(over), modality: 'strength' as const });
  const week = [
    { sessions: [run({ block_id: 'mine',  day_of_week: 0 })] },
    { sessions: [lift({ block_id: 'other', day_of_week: 1 })] },
    { sessions: [run({ block_id: 'mine',  day_of_week: 2 }), lift({ block_id: 'other', day_of_week: 2 })] },
    { sessions: [lift({ block_id: 'other', day_of_week: 4, status: 'dropped' })] },
  ];
  const days = (m: Map<number, string[]>) => [...m.keys()];

  it('does not flag the adjusted plan\'s own sessions as clashes', () => {
    expect(days(occupiedDaysExcept(week, 'mine'))).toEqual([1, 2]);
  });

  it('still flags a day the plan shares with another plan', () => {
    // Wednesday holds one of mine and one of theirs: it is still a clash.
    expect(occupiedDaysExcept(week, 'mine').get(2)).toEqual(['strength']);
  });

  it('flags everything on a plan you are not on', () => {
    expect(days(occupiedDaysExcept(week, null))).toEqual([0, 1, 2]);
  });

  it('ignores dropped and moved sessions, as before', () => {
    expect(occupiedDaysExcept(week, null).has(4)).toBe(false);
  });

  it('says what kind of session is on each day, so a run dot is not orange', () => {
    expect(occupiedDaysExcept(week, 'other').get(0)).toEqual(['run']);
  });

  it('lists each kind once, in the order it appears, when two plans share a day', () => {
    const busy = [{ sessions: [
      run({ block_id: 'a', day_of_week: 5 }),
      lift({ block_id: 'b', day_of_week: 5 }),
      run({ block_id: 'a', day_of_week: 5 }),
    ] }];
    expect(occupiedDaysExcept(busy, null).get(5)).toEqual(['run', 'strength']);
  });
});

describe('assignDay (card 299)', () => {
  const slots = [
    { key: 'easy_0', label: 'easy', day: 0 },
    { key: 'easy_1', label: 'easy', day: 2 },
    { key: 'long_2', label: 'long', day: 5 },
  ];

  it('moves a session to a free day', () => {
    expect(assignDay(slots, 'easy_0', 1).map((s) => s.day)).toEqual([1, 2, 5]);
  });

  it('swaps with the session already on that day instead of doubling up', () => {
    expect(assignDay(slots, 'easy_0', 5).map((s) => s.day)).toEqual([5, 2, 0]);
  });

  it('can never put two sessions on one day, however many taps', () => {
    let s = slots;
    for (const [key, day] of [['easy_0', 2], ['long_2', 2], ['easy_1', 2], ['easy_0', 5]] as const) {
      s = assignDay(s, key, day);
      expect(new Set(s.map((x) => x.day)).size).toBe(s.length);
    }
  });

  it('leaves the week alone when the day is already the session\'s own', () => {
    expect(assignDay(slots, 'easy_1', 2)).toBe(slots);
  });
});
