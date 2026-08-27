import {
  composeWeek,
  hardSessionCount,
  hardTypesFor,
  MIN_HARD_SPACING_DAYS,
  type ComposeInput,
} from '@/lib/runProgramme/weekComposer';

const BASE: ComposeInput = {
  days:       [0, 2, 4, 6],   // Mon, Wed, Fri, Sun
  longRunDay: 6,
  phase:      'build',
  goal:       'half_marathon',
  difficulty: 'balanced',
};

const compose = (over: Partial<ComposeInput> = {}) => composeWeek({ ...BASE, ...over });

function gap(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 7 - raw);
}

describe('hardSessionCount', () => {
  it('gives a comfortable two-day week no hard sessions at all', () => {
    // Two runs a week cannot support a hard session and still leave anything easy.
    expect(hardSessionCount(2, 'comfortable', 'build')).toBe(0);
  });

  it('rises with difficulty', () => {
    expect(hardSessionCount(5, 'comfortable', 'build'))
      .toBeLessThan(hardSessionCount(5, 'balanced', 'build'));
    expect(hardSessionCount(5, 'balanced', 'build'))
      .toBeLessThan(hardSessionCount(5, 'challenging', 'build'));
  });

  it('rises with available days, up to a point', () => {
    expect(hardSessionCount(3, 'balanced', 'build'))
      .toBeLessThanOrEqual(hardSessionCount(5, 'balanced', 'build'));
  });

  it('holds one back in the base phase', () => {
    expect(hardSessionCount(5, 'balanced', 'base'))
      .toBe(hardSessionCount(5, 'balanced', 'build') - 1);
  });

  it('never goes negative in base, however gentle the week', () => {
    expect(hardSessionCount(2, 'comfortable', 'base')).toBe(0);
  });

  it('keeps the count through the taper — volume drops, sharpness does not', () => {
    expect(hardSessionCount(5, 'balanced', 'taper'))
      .toBe(hardSessionCount(5, 'balanced', 'build'));
  });

  it('clamps absurd day counts rather than returning undefined', () => {
    expect(hardSessionCount(0, 'balanced', 'build')).toBe(0);
    expect(hardSessionCount(99, 'balanced', 'build')).toBeGreaterThanOrEqual(0);
  });
});

describe('hardTypesFor', () => {
  it('gives a 5K plan intervals in the build phase and a marathon plan threshold', () => {
    expect(hardTypesFor('build', '5k', 1)).toEqual(['intervals']);
    expect(hardTypesFor('build', 'marathon', 1)).toEqual(['threshold']);
  });

  it('returns as many types as asked for', () => {
    expect(hardTypesFor('build', '5k', 2)).toHaveLength(2);
    expect(hardTypesFor('build', '5k', 3)).toHaveLength(3);
  });

  it('returns nothing for race week', () => {
    expect(hardTypesFor('race', 'marathon', 2)).toEqual([]);
  });

  it('returns nothing when none are wanted', () => {
    expect(hardTypesFor('build', '5k', 0)).toEqual([]);
  });
});

describe('composeWeek — shape', () => {
  it('produces exactly one session per training day', () => {
    const week = compose();
    expect(week).toHaveLength(4);
    expect(week.map((s) => s.day)).toEqual([0, 2, 4, 6]);
  });

  it('puts the long run on the requested day', () => {
    expect(compose().find((s) => s.isLong)!.day).toBe(6);
  });

  it('falls back to the last available day when the preferred one is not a running day', () => {
    expect(compose({ days: [1, 3, 5], longRunDay: 6 }).find((s) => s.isLong)!.day).toBe(5);
  });

  it('has exactly one long run', () => {
    expect(compose().filter((s) => s.isLong)).toHaveLength(1);
  });

  it('returns nothing for a week with no training days', () => {
    expect(compose({ days: [] })).toEqual([]);
  });

  it('handles a one-day week without falling over', () => {
    const week = compose({ days: [3], longRunDay: 6 });
    expect(week).toHaveLength(1);
    expect(week[0].isLong).toBe(true);
  });

  it('ignores duplicate days', () => {
    expect(compose({ days: [0, 0, 2, 2, 6] })).toHaveLength(3);
  });
});

describe('composeWeek — recovery rules', () => {
  it('never puts a hard session the day after the long run', () => {
    const week = compose({ days: [0, 1, 2, 4, 6], longRunDay: 6 });
    const dayAfterLong = 0; // Sunday long run, Monday after
    expect(week.find((s) => s.day === dayAfterLong)!.isHard).toBe(false);
  });

  it('keeps hard sessions apart', () => {
    const week = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'challenging' });
    const hard = week.filter((s) => s.isHard).map((s) => s.day);
    for (let i = 0; i < hard.length; i++) {
      for (let j = i + 1; j < hard.length; j++) {
        expect(gap(hard[i], hard[j])).toBeGreaterThanOrEqual(MIN_HARD_SPACING_DAYS);
      }
    }
  });

  it('keeps hard sessions away from the long run', () => {
    const week = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'challenging' });
    const long = week.find((s) => s.isLong)!.day;
    for (const h of week.filter((s) => s.isHard)) {
      expect(gap(h.day, long)).toBeGreaterThanOrEqual(MIN_HARD_SPACING_DAYS);
    }
  });

  it('places fewer hard sessions than asked for rather than placing a bad one', () => {
    // Three consecutive days cannot hold two properly spaced hard sessions
    // alongside a long run. Better none than one in the wrong place.
    const week = compose({ days: [4, 5, 6], longRunDay: 6, difficulty: 'challenging' });
    const hard = week.filter((s) => s.isHard).map((s) => s.day);
    expect(hard.length).toBeLessThanOrEqual(1);
    for (const h of hard) expect(gap(h, 6)).toBeGreaterThanOrEqual(MIN_HARD_SPACING_DAYS);
  });

  it('makes the day after hard work a recovery run in a full week', () => {
    const week = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'challenging' });
    for (const s of week) {
      const yesterday = week.find((x) => x.day === (s.day + 6) % 7);
      if (yesterday && (yesterday.isHard || yesterday.isLong) && !s.isHard && !s.isLong) {
        expect(s.type).toBe('recovery');
      }
    }
  });

  it('does not bother with recovery runs in a short week', () => {
    // With three runs a week the distinction between easy and recovery is noise.
    const week = compose({ days: [0, 2, 6], difficulty: 'balanced' });
    expect(week.some((s) => s.type === 'recovery')).toBe(false);
  });
});

describe('composeWeek — phases', () => {
  it('gives the base phase fewer hard sessions than the build phase', () => {
    const base  = compose({ phase: 'base',  days: [0, 1, 2, 4, 6] }).filter((s) => s.isHard);
    const build = compose({ phase: 'build', days: [0, 1, 2, 4, 6] }).filter((s) => s.isHard);
    expect(base.length).toBeLessThan(build.length);
  });

  it('turns race week into the race plus shakeouts', () => {
    const week = compose({ isRaceWeek: true, days: [0, 2, 4, 6], longRunDay: 6 });
    expect(week.find((s) => s.day === 6)!.type).toBe('race');
    for (const s of week.filter((x) => x.day !== 6)) {
      expect(s.type).toBe('easy');
    }
  });

  it('gives a 5K build week intervals and a marathon build week threshold', () => {
    const fiveK    = compose({ goal: '5k', days: [0, 2, 4, 6] }).filter((s) => s.isHard);
    const marathon = compose({ goal: 'marathon', days: [0, 2, 4, 6] }).filter((s) => s.isHard);
    expect(fiveK.map((s) => s.type)).toContain('intervals');
    expect(marathon.map((s) => s.type)).toContain('threshold');
  });
});

describe('composeWeek — day ranking', () => {
  it('uses the caller\'s ranking to break ties, for cycle-aware placement', () => {
    // Two equally-spaced candidate days; the ranker decides. This is the seam
    // anchorKeySession plugs into.
    const preferLate  = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'balanced', rankHardDay: (d) => -d });
    const preferEarly = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'balanced', rankHardDay: (d) => d });
    const hardDays = (w: typeof preferLate) => w.filter((s) => s.isHard).map((s) => s.day).sort((a, b) => a - b);
    expect(hardDays(preferLate)).not.toEqual(hardDays(preferEarly));
  });

  it('is deterministic without a ranker', () => {
    const a = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'challenging' });
    const b = compose({ days: [0, 1, 2, 3, 4, 5, 6], difficulty: 'challenging' });
    expect(a).toEqual(b);
  });
});

describe('composeWeek — golden fixture', () => {
  it('lays out a five-day balanced build week for a half marathon', () => {
    const week = compose({ days: [0, 1, 3, 4, 6], longRunDay: 6, difficulty: 'balanced' });
    // Sunday long run; Monday recovers from it. The primary hard session
    // (threshold) takes Thursday, the day furthest from everything else, and the
    // secondary one takes Tuesday. Friday recovers from Thursday.
    expect(week.map((s) => [s.day, s.type])).toEqual([
      [0, 'recovery'],
      [1, 'progression'],
      [3, 'threshold'],
      [4, 'recovery'],
      [6, 'long'],
    ]);
  });
});
