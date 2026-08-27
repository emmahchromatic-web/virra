import {
  buildVolumeCurve,
  curveTotalKm,
  defaultDownWeeks,
  TIER_LIMITS,
  VOLUME_PRESETS,
  GOAL_LONG_CAP_KM,
  LONG_RUN_SHARE_BY_GOAL,
  LONG_RUN_HARD_SHARE,
  GOAL_LONG_TARGET_KM,
  DOWN_WEEK_FRACTION,
  type CurveInput,
} from '@/lib/runProgramme/volumeCurve';

const BASE: CurveInput = {
  weeks:               12,
  tier:                'intermediate',
  preset:              'steady',
  goal:                'half_marathon',
  currentWeeklyKm:     30,
  currentLongestRunKm: 10,
  hasRace:             true,
};

const build = (over: Partial<CurveInput> = {}) => buildVolumeCurve({ ...BASE, ...over });

describe('defaultDownWeeks', () => {
  it('backs off every fourth week', () => {
    expect(defaultDownWeeks(12)).toEqual([4, 8, 12]);
  });

  it('produces none for a plan too short to need one', () => {
    expect(defaultDownWeeks(3)).toEqual([]);
  });
});

describe('buildVolumeCurve — shape', () => {
  it('returns one entry per week', () => {
    expect(build({ weeks: 12 })).toHaveLength(12);
    expect(build({ weeks: 8 })).toHaveLength(8);
  });

  it('numbers weeks from 1 with no gaps', () => {
    const curve = build();
    expect(curve.map((w) => w.week)).toEqual([...Array(12)].map((_, i) => i + 1));
  });

  it('starts at the runner\'s current volume', () => {
    expect(build({ currentWeeklyKm: 30 })[0].km).toBe(30);
  });

  it('lifts a runner below the tier floor up to it rather than starting absurdly low', () => {
    expect(build({ tier: 'intermediate', currentWeeklyKm: 4 })[0].km).toBe(TIER_LIMITS.intermediate.floorKm);
  });

  it('treats a missing current volume as the tier floor', () => {
    expect(build({ currentWeeklyKm: 0 })[0].km).toBe(TIER_LIMITS.intermediate.floorKm);
  });

  it('ends with a race week when there is a race', () => {
    const curve = build();
    expect(curve[curve.length - 1].kind).toBe('race');
  });

  it('has no taper at all without a race', () => {
    const curve = build({ hasRace: false, goal: 'general' });
    expect(curve.some((w) => w.kind === 'taper' || w.kind === 'race')).toBe(false);
  });
});

describe('buildVolumeCurve — the double constraint', () => {
  it('never raises a week by more than the percentage rate', () => {
    const curve = build({ preset: 'steady', tier: 'advanced' });
    const rate = VOLUME_PRESETS.steady.rate;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].kind !== 'build' || curve[i - 1].kind !== 'build') continue;
      expect(curve[i].km).toBeLessThanOrEqual(curve[i - 1].km * (1 + rate) + 0.05);
    }
  });

  it('never raises a week by more than the tier\'s absolute step', () => {
    // A high-volume advanced runner is where the percentage would run away, so
    // this is the case the absolute cap exists for.
    const curve = build({ tier: 'advanced', currentWeeklyKm: 80, goal: 'marathon', preset: 'progressive' });
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].kind !== 'build' || curve[i - 1].kind !== 'build') continue;
      expect(curve[i].km - curve[i - 1].km).toBeLessThanOrEqual(TIER_LIMITS.advanced.absStepKm + 0.05);
    }
  });

  it('applies whichever constraint is more conservative', () => {
    // 8% of 30km is 2.4km, which is under the intermediate 5km step, so the
    // percentage should be the binding one here.
    const curve = build({ tier: 'intermediate', currentWeeklyKm: 30, preset: 'steady' });
    expect(curve[1].km).toBeCloseTo(32.4, 1);
  });

  it('never exceeds the tier ceiling', () => {
    const curve = build({ tier: 'beginner', currentWeeklyKm: 30, weeks: 30, preset: 'progressive', hasRace: false, goal: 'general' });
    for (const w of curve) expect(w.km).toBeLessThanOrEqual(TIER_LIMITS.beginner.ceilingKm);
  });

  it('never exceeds the preset\'s multiple of where the runner started', () => {
    const curve = build({ weeks: 40, hasRace: false, goal: 'general', preset: 'gradual', currentWeeklyKm: 30 });
    const cap = 30 * VOLUME_PRESETS.gradual.maxMultiple;
    for (const w of curve) expect(w.km).toBeLessThanOrEqual(cap + 0.05);
  });
});

describe('buildVolumeCurve — down weeks', () => {
  it('backs off on the fourth week', () => {
    const curve = build();
    expect(curve[3].kind).toBe('down');
    expect(curve[3].km).toBeLessThan(curve[2].km);
  });

  it('cuts to the intended fraction of what the week would have been', () => {
    const curve = build();
    expect(curve[3].km).toBeCloseTo(curve[2].km * DOWN_WEEK_FRACTION, 1);
  });

  it('does not cost the runner the ground they gained', () => {
    // The week after a down week resumes from the progression, not from the
    // reduced volume — otherwise every down week would be a step backwards.
    const curve = build();
    expect(curve[4].km).toBeGreaterThan(curve[3].km);
    expect(curve[4].km).toBeGreaterThanOrEqual(curve[2].km);
  });

  it('accepts caller-supplied down weeks, for cycle alignment', () => {
    const curve = build({ downWeeks: [3, 7] });
    expect(curve[2].kind).toBe('down');
    expect(curve[6].kind).toBe('down');
    expect(curve[3].kind).toBe('build');
  });

  it('never grows the long run in a down week', () => {
    const curve = build();
    expect(curve[3].longRunKm).toBeLessThanOrEqual(curve[2].longRunKm);
  });
});

describe('buildVolumeCurve — the long run track', () => {
  it('starts from what the runner can already do', () => {
    expect(build({ currentLongestRunKm: 10 })[0].longRunKm).toBe(10);
  });

  it('never lets the long run exceed its share of the week during a build', () => {
    const curve = build({ weeks: 16, goal: 'marathon', tier: 'advanced', currentWeeklyKm: 50 });
    for (const w of curve) {
      if (w.kind !== 'build') continue;
      expect(w.longRunKm).toBeLessThanOrEqual(w.km * LONG_RUN_HARD_SHARE + 0.05);
    }
  });

  it('never exceeds the goal\'s long-run cap', () => {
    const curve = build({ weeks: 20, goal: 'marathon', tier: 'advanced', currentWeeklyKm: 60, currentLongestRunKm: 25 });
    for (const w of curve) {
      if (w.kind === 'race') continue; // race week's long effort IS the race
      expect(w.longRunKm).toBeLessThanOrEqual(GOAL_LONG_CAP_KM.marathon);
    }
  });

  it('caps a 5K plan\'s long run far below a marathon plan\'s', () => {
    const fiveK    = build({ goal: '5k', weeks: 16, tier: 'advanced', currentWeeklyKm: 50 });
    const marathon = build({ goal: 'marathon', weeks: 16, tier: 'advanced', currentWeeklyKm: 50 });
    const longest = (c: ReturnType<typeof build>) =>
      Math.max(...c.filter((w) => w.kind !== 'race').map((w) => w.longRunKm));
    expect(longest(fiveK)).toBeLessThan(longest(marathon));
    expect(longest(fiveK)).toBeLessThanOrEqual(GOAL_LONG_CAP_KM['5k']);
  });

  it('rises by no more than the tier\'s long-run step', () => {
    const curve = build({ tier: 'beginner', goal: '5k', currentWeeklyKm: 12, currentLongestRunKm: 4 });
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].longRunKm - curve[i - 1].longRunKm)
        .toBeLessThanOrEqual(TIER_LIMITS.beginner.longStepKm + 0.05);
    }
  });

  it('is not dragged up by weekly volume — the whole point of a separate track', () => {
    // Weekly volume rises 5km a week for an advanced runner; the long run must
    // not follow it up at that rate.
    const curve = build({ tier: 'advanced', goal: 'marathon', weeks: 16, currentWeeklyKm: 60, currentLongestRunKm: 20 });
    const weekJumps = curve.slice(1).map((w, i) => w.km - curve[i].km);
    const longJumps = curve.slice(1).map((w, i) => w.longRunKm - curve[i].longRunKm);
    expect(Math.max(...longJumps)).toBeLessThan(Math.max(...weekJumps));
  });
});

describe('buildVolumeCurve — taper', () => {
  it('gives a marathon three taper weeks and a 5K one', () => {
    const marathon = build({ goal: 'marathon', weeks: 16 });
    const fiveK    = build({ goal: '5k', weeks: 8 });
    expect(marathon.filter((w) => w.kind === 'taper' || w.kind === 'race')).toHaveLength(3);
    expect(fiveK.filter((w) => w.kind === 'taper' || w.kind === 'race')).toHaveLength(1);
  });

  it('descends through the taper weeks', () => {
    // Race week is excluded deliberately: it is dominated by the race itself,
    // and for a runner whose peak week is not much bigger than the race, its
    // volume is necessarily higher than the week before it.
    const curve = build({ goal: 'marathon', weeks: 16 });
    const taper = curve.filter((w) => w.kind === 'taper');
    expect(taper.length).toBeGreaterThan(0);
    for (let i = 1; i < taper.length; i++) {
      expect(taper[i].km).toBeLessThan(taper[i - 1].km);
    }
  });

  it('never asks for a race week smaller than the race', () => {
    // A beginner on a 10K plan can peak low enough that the taper fraction
    // alone would put race week below 10km, which cannot be right.
    for (const goal of ['5k', '10k', 'half_marathon', 'marathon'] as const) {
      const curve = build({ goal, weeks: 12, tier: 'beginner', currentWeeklyKm: 10 });
      const race  = curve[curve.length - 1];
      expect(race.kind).toBe('race');
      expect(race.km).toBeGreaterThanOrEqual(race.longRunKm);
    }
  });

  it('drops below the peak build week', () => {
    const curve = build({ goal: 'marathon', weeks: 16 });
    const peak  = Math.max(...curve.filter((w) => w.kind === 'build').map((w) => w.km));
    for (const w of curve.filter((x) => x.kind === 'taper' || x.kind === 'race')) {
      expect(w.km).toBeLessThan(peak);
    }
  });

  it('makes race week\'s long effort the race itself', () => {
    expect(build({ goal: 'marathon', weeks: 16 }).slice(-1)[0].longRunKm).toBe(42.2);
    expect(build({ goal: '5k', weeks: 8 }).slice(-1)[0].longRunKm).toBe(5);
  });

  it('shortens the taper rather than losing the build when the plan is very short', () => {
    const curve = build({ goal: 'marathon', weeks: 2 });
    expect(curve).toHaveLength(2);
    expect(curve.filter((w) => w.kind === 'build' || w.kind === 'down').length).toBeGreaterThanOrEqual(1);
    expect(curve.slice(-1)[0].kind).toBe('race');
  });

  it('survives a one-week plan', () => {
    const curve = build({ weeks: 1 });
    expect(curve).toHaveLength(1);
    expect(curve[0].km).toBeGreaterThan(0);
  });
});

describe('buildVolumeCurve — presets and tiers behave as advertised', () => {
  it('builds more total volume on progressive than on gradual', () => {
    const gradual     = curveTotalKm(build({ preset: 'gradual' }));
    const progressive = curveTotalKm(build({ preset: 'progressive' }));
    expect(progressive).toBeGreaterThan(gradual);
  });

  it('never asks a beginner to do what it asks an advanced runner to do', () => {
    const beginner = build({ tier: 'beginner', currentWeeklyKm: 10, currentLongestRunKm: 4 });
    const advanced = build({ tier: 'advanced', currentWeeklyKm: 50, currentLongestRunKm: 20 });
    expect(Math.max(...beginner.map((w) => w.km))).toBeLessThan(Math.max(...advanced.map((w) => w.km)));
  });

  it('keeps every week positive, whatever it is asked for', () => {
    for (const tier of ['beginner', 'recreational', 'intermediate', 'advanced'] as const) {
      for (const goal of ['5k', '10k', 'half_marathon', 'marathon', 'general'] as const) {
        const curve = build({ tier, goal, weeks: 6, currentWeeklyKm: 0, currentLongestRunKm: 0 });
        for (const w of curve) {
          expect(w.km).toBeGreaterThan(0);
          expect(w.longRunKm).toBeGreaterThan(0);
          expect(w.longRunKm).toBeLessThanOrEqual(w.km);
        }
      }
    }
  });
});

describe('buildVolumeCurve — golden fixture', () => {
  // A recreational runner on 20km/week, 12 weeks to a half, steady preset.
  // Locked in deliberately: if these numbers move, the change should be a
  // decision someone made rather than a side effect they did not notice.
  it('gets the long run to the race distance for a short race, even at low volume', () => {
    // The flaw this exists to prevent: a beginner on 8km/week preparing for a 5K
    // used to top out at a 3.1km long run and then race 5km.
    const curve = buildVolumeCurve({
      weeks: 8, tier: 'beginner', preset: 'gradual', goal: '5k',
      currentWeeklyKm: 8, currentLongestRunKm: 3, hasRace: true,
    });
    const longest = Math.max(...curve.filter((w) => w.kind !== 'race').map((w) => w.longRunKm));
    expect(longest).toBeGreaterThanOrEqual(GOAL_LONG_TARGET_KM['5k']);
  });

  it('still never lets the long run past half the week', () => {
    for (const goal of ['5k', '10k', 'half_marathon', 'marathon'] as const) {
      const curve = build({ goal, weeks: 10, tier: 'beginner', currentWeeklyKm: 8, currentLongestRunKm: 2 });
      for (const w of curve) {
        if (w.kind === 'race') continue;
        expect(w.longRunKm).toBeLessThanOrEqual(w.km * LONG_RUN_HARD_SHARE + 0.05);
      }
    }
  });

  it('lets a half or marathon plan put more of the week in the long run than a 5K plan', () => {
    // A low-mileage runner preparing for a half has to do a big share of their
    // week in one go; a 5K runner has no reason to.
    expect(LONG_RUN_SHARE_BY_GOAL.marathon).toBeGreaterThan(LONG_RUN_SHARE_BY_GOAL['5k']);
    expect(LONG_RUN_SHARE_BY_GOAL.half_marathon).toBeGreaterThan(LONG_RUN_SHARE_BY_GOAL['10k']);
  });

  it('produces the expected 12-week half marathon plan', () => {
    const curve = build({
      weeks: 12, tier: 'recreational', preset: 'steady', goal: 'half_marathon',
      currentWeeklyKm: 20, currentLongestRunKm: 7,
    });
    expect(curve.map((w) => [w.week, w.km, w.longRunKm, w.kind])).toEqual([
      [1,  20,   7,    'build'],
      [2,  21.6, 9,    'build'],
      [3,  23.3, 11,   'build'],
      [4,  16.8, 7.6,  'down'],
      [5,  25.2, 9.6,  'build'],
      [6,  27.2, 11.6, 'build'],
      [7,  29.4, 13.6, 'build'],
      [8,  21.2, 9.5,  'down'],
      [9,  30,   11.5, 'build'],
      [10, 30,   13.5, 'build'],
      [11, 24,   9.6,  'taper'],
      [12, 21.1, 21.1, 'race'],
    ]);
  });
});
