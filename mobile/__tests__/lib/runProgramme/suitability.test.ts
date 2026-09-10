import {
  entryCriteria,
  assessSuitability,
  gentlerAlternative,
  GOAL_ENTRY,
  STRETCH_FRACTION,
  WRONG_PLAN_FRACTION,
  type SuitabilityRunner,
} from '@/lib/runProgramme/suitability';
import { ARCHETYPES, archetypeForTemplate } from '@/lib/runProgramme/archetypes';
import { buildVolumeCurve, planFeasibility } from '@/lib/runProgramme/volumeCurve';

const runner = (over: Partial<SuitabilityRunner> = {}): SuitabilityRunner => ({
  fitnessLevel: 'recreational', currentWeeklyKm: 30, currentLongestRunKm: 12, ...over,
});

describe('entry criteria', () => {
  it('gives every archetype something to say about who it is for', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      const c = entryCriteria(archetype, '10k');
      expect(c.whoFor.length).toBeGreaterThan(0);
      expect(c.points.length).toBeGreaterThan(0);
    }
  });

  it('states the goal bar for a race plan', () => {
    const c = entryCriteria(ARCHETYPES.race, 'half_marathon');
    expect(c.points.join(' ')).toContain('10km');
    expect(c.assumesWeeklyKm).toBe(GOAL_ENTRY.half_marathon!.weeklyKm);
    expect(c.assumesLongRunKm).toBe(GOAL_ENTRY.half_marathon!.longRunKm);
  });

  it('asks a marathon plan for more than a 5K plan', () => {
    const fiveK    = entryCriteria(ARCHETYPES.race, '5k');
    const marathon = entryCriteria(ARCHETYPES.race, 'marathon');
    expect(marathon.assumesWeeklyKm!).toBeGreaterThan(fiveK.assumesWeeklyKm!);
    expect(marathon.assumesLongRunKm!).toBeGreaterThan(fiveK.assumesLongRunKm!);
  });

  it('sets no bar at all on a walk-run plan, because there is not one', () => {
    for (const key of ['new_to_running', 'path_to_parkrun', 'return_after_break'] as const) {
      const c = entryCriteria(ARCHETYPES[key], 'general');
      expect(c.teachesRunning).toBe(true);
      expect(c.assumesWeeklyKm).toBeNull();
      expect(c.assumesLongRunKm).toBeNull();
    }
  });

  it('says a walk-run plan does not need you to run yet', () => {
    const c = entryCriteria(ARCHETYPES.new_to_running, 'general');
    expect(c.whoFor.toLowerCase()).toContain('not need to be able to run');
  });

  it('sets no bar on a general-fitness plan either', () => {
    const c = entryCriteria(ARCHETYPES.train_your_way, 'general');
    expect(c.assumesWeeklyKm).toBeNull();
    expect(c.points.length).toBeGreaterThan(0);
  });

  it('never uses an em dash, which user copy here does not', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      for (const goal of ['5k', '10k', 'marathon', 'general'] as const) {
        const c = entryCriteria(archetype, goal);
        expect([c.whoFor, ...c.points].join(' ')).not.toContain('—');
      }
    }
  });
});

describe('assessing a runner against a plan', () => {
  const assess = (over: Parameters<typeof assessSuitability>[0] extends never ? never : any = {}) => {
    const archetype = over.archetype ?? ARCHETYPES.race;
    const goal      = over.goal ?? '10k';
    return assessSuitability({
      archetype, goal,
      criteria:    entryCriteria(archetype, goal),
      runner:      over.runner ?? runner(),
      feasibility: over.feasibility,
    });
  };

  it('says nothing when the runner is where the plan expects', () => {
    const s = assess({ goal: '10k', runner: runner({ currentWeeklyKm: 30, currentLongestRunKm: 12 }) });
    expect(s.verdict).toBe('suited');
    expect(s.reasons).toHaveLength(0);
  });

  it('calls it a stretch when the runner is somewhat under', () => {
    // 15km/wk assumed for a 10K; 9 is 0.6 of it, between the two fractions.
    const under = GOAL_ENTRY['10k']!.weeklyKm * ((STRETCH_FRACTION + WRONG_PLAN_FRACTION) / 2);
    const s = assess({ goal: '10k', runner: runner({ currentWeeklyKm: under, currentLongestRunKm: 8 }) });
    expect(s.verdict).toBe('stretch');
    expect(s.reasons.join(' ')).toContain('a week');
  });

  it('calls it the wrong plan when the runner is far under', () => {
    const far = GOAL_ENTRY.marathon!.weeklyKm * (WRONG_PLAN_FRACTION / 2);
    const s = assess({ goal: 'marathon', runner: runner({ currentWeeklyKm: far, currentLongestRunKm: 20 }) });
    expect(s.verdict).toBe('wrong_plan');
  });

  it('quotes the runner their own numbers rather than a grade', () => {
    const s = assess({ goal: '10k', runner: runner({ currentWeeklyKm: 4, currentLongestRunKm: 8 }) });
    expect(s.reasons.join(' ')).toContain('4km');
    expect(s.reasons.join(' ')).toContain(`${GOAL_ENTRY['10k']!.weeklyKm}km`);
  });

  it('flags a short longest run separately from weekly volume', () => {
    const s = assess({
      goal:   'half_marathon',
      runner: runner({ currentWeeklyKm: GOAL_ENTRY.half_marathon!.weeklyKm, currentLongestRunKm: 3 }),
    });
    expect(s.verdict).toBe('stretch');
    expect(s.reasons.join(' ')).toContain('longest run');
  });

  it('never warns about a walk-run plan, whoever is looking at it', () => {
    for (const km of [0, 2, 5, 40]) {
      const s = assess({
        archetype: ARCHETYPES.new_to_running, goal: 'general',
        runner: runner({ currentWeeklyKm: km, currentLongestRunKm: km / 3, fitnessLevel: 'beginner' }),
      });
      expect(s.verdict).toBe('suited');
      expect(s.reasons).toHaveLength(0);
    }
  });

  it('does not warn when there is no measurement to warn from', () => {
    const s = assess({ goal: '10k', runner: runner({ currentWeeklyKm: 0, currentLongestRunKm: 0 }) });
    expect(s.verdict).toBe('suited');
  });

  it('leaves a returning runner with real mileage alone', () => {
    const s = assess({
      goal: '10k',
      runner: runner({ fitnessLevel: 'returning', currentWeeklyKm: 30, currentLongestRunKm: 12 }),
    });
    expect(s.verdict).toBe('suited');
  });

  it('tips a returning runner who is already stretched into the walk-run route', () => {
    const under = GOAL_ENTRY['10k']!.weeklyKm * ((STRETCH_FRACTION + WRONG_PLAN_FRACTION) / 2);
    const s = assess({
      goal: '10k',
      runner: runner({ fitnessLevel: 'returning', currentWeeklyKm: under, currentLongestRunKm: 8 }),
    });
    expect(s.verdict).toBe('wrong_plan');
    expect(s.alternative).toBe('return_after_break');
  });
});

describe('the plan the runner is actually offered instead', () => {
  it('sends someone looking at a 5K plan to parkrun', () => {
    expect(gentlerAlternative('5k', 'beginner')).toBe('path_to_parkrun');
  });

  it('sends a returning runner to the return plan whatever the goal', () => {
    for (const goal of ['5k', '10k', 'marathon', 'general'] as const) {
      expect(gentlerAlternative(goal, 'returning')).toBe('return_after_break');
    }
  });

  it('offers nothing on a marathon plan rather than something silly', () => {
    // "New to running" is not the gentler marathon plan. A shorter race is,
    // and we have no way to name a specific one, so we say nothing.
    expect(gentlerAlternative('marathon', 'recreational')).toBeNull();
    expect(gentlerAlternative('half_marathon', 'beginner')).toBeNull();
  });

  it('keeps the walk-run door visible on a 5K plan even for a suited runner', () => {
    const archetype = ARCHETYPES.race;
    const s = assessSuitability({
      archetype, goal: '5k',
      criteria: entryCriteria(archetype, '5k'),
      runner:   runner({ currentWeeklyKm: 40, currentLongestRunKm: 15 }),
    });
    expect(s.verdict).toBe('suited');
    expect(s.alternative).toBe('path_to_parkrun');
  });
});

describe('feasibility, read off the curve this runner would actually get', () => {
  // Generated rather than hand-written: every number here comes from the
  // engine, because hand-computed fixtures are how the earlier golden curves
  // went wrong.
  const curveFor = (currentWeeklyKm: number, weeks: number, goal: 'half_marathon' | '10k') =>
    buildVolumeCurve({
      weeks, tier: 'recreational', preset: 'steady', goal,
      currentWeeklyKm, currentLongestRunKm: currentWeeklyKm * 0.3, hasRace: true,
    });

  it('says how far short a plan lands when it cannot reach the distance', () => {
    const f = planFeasibility(curveFor(12, 8, 'half_marathon'), 'half_marathon');
    expect(f.reachesTarget).toBe(false);
    const archetype = ARCHETYPES.race;
    const s = assessSuitability({
      archetype, goal: 'half_marathon',
      criteria:    entryCriteria(archetype, 'half_marathon'),
      runner:      runner({ currentWeeklyKm: 12, currentLongestRunKm: 4 }),
      feasibility: f,
    });
    expect(s.reasons.join(' ')).toContain(`${f.longestRunKm}km`);
    expect(s.reasons.join(' ')).toContain('short');
  });

  it('stays quiet about a plan that does reach it', () => {
    const f = planFeasibility(curveFor(30, 16, 'half_marathon'), 'half_marathon');
    expect(f.reachesTarget).toBe(true);
    const archetype = ARCHETYPES.race;
    const s = assessSuitability({
      archetype, goal: 'half_marathon',
      criteria:    entryCriteria(archetype, 'half_marathon'),
      runner:      runner({ currentWeeklyKm: 30, currentLongestRunKm: 12 }),
      feasibility: f,
    });
    expect(s.reasons.join(' ')).not.toContain('short');
  });
});

describe('the live catalogue routes where card 257 says it should', () => {
  // archetypeForTemplate reads the template NAME, so the catalogue and the
  // matcher are coupled: renaming a row silently changes which plan a runner
  // gets. These are the exact names in prod plus the three seeded by
  // 20260910000000_walk_run_plan_templates.sql. If one of them is renamed,
  // this test is where it should hurt.
  const LIVE: Array<[string, string | null, string]> = [
    ['Beginner 5K',          '5k',            'race'],
    ['Intermediate 10K',     '10k',           'race'],
    ['Half Marathon Build',  'half_marathon', 'race'],
    ['Marathon Foundation',  'marathon',      'race'],
    ['General Fitness',      null,            'train_your_way'],
    ['New to Running',       null,            'new_to_running'],
    ['Path to parkrun',      '5k',            'path_to_parkrun'],
    ['Return to Running',    null,            'return_after_break'],
  ];

  it.each(LIVE)('routes %s to the right archetype', (name, distanceGoal, expected) => {
    const a = archetypeForTemplate({ name, distanceGoal, hasEventDate: true });
    expect(a.key).toBe(expected);
  });

  it('gives the three new rows a walk-run progression, which is the point of them', () => {
    for (const name of ['New to Running', 'Path to parkrun', 'Return to Running']) {
      expect(archetypeForTemplate({ name }).progression).toBe('walk_run');
    }
  });

  it('does not accidentally reroute an existing plan into a walk-run one', () => {
    for (const [name, distanceGoal] of LIVE.slice(0, 5)) {
      expect(archetypeForTemplate({ name, distanceGoal }).progression).not.toBe('walk_run');
    }
  });

  it('offers a run-walker on Beginner 5K a plan that actually exists', () => {
    const archetype = archetypeForTemplate({ name: 'Beginner 5K', distanceGoal: '5k' });
    const s = assessSuitability({
      archetype, goal: '5k',
      criteria: entryCriteria(archetype, '5k'),
      // Emma's own numbers from the build 14 UAT.
      runner:   { fitnessLevel: 'beginner', currentWeeklyKm: 5, currentLongestRunKm: 5 },
    });
    expect(s.alternative).toBe('path_to_parkrun');
    const target = LIVE.find(([name]) => archetypeForTemplate({ name }).key === s.alternative);
    expect(target?.[0]).toBe('Path to parkrun');
  });
});
