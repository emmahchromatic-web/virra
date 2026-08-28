import { generateRunPlan, phaseForWeek, type GeneratePlanInput } from '@/lib/runProgramme/generatePlan';
import { ARCHETYPES, archetypeForTemplate, raceDistanceFor } from '@/lib/runProgramme/archetypes';
import { tierForFitnessLevel, assumedLongestRun } from '@/lib/runProgramme/runnerModel';

const BASE: GeneratePlanInput = {
  archetype:           ARCHETYPES.race,
  goal:                'half_marathon',
  weeks:               12,
  tier:                'recreational',
  preset:              'steady',
  difficulty:          'balanced',
  currentWeeklyKm:     20,
  currentLongestRunKm: 7,
  days:                [0, 2, 4, 6],
  longRunDay:          6,
};

const gen = (over: Partial<GeneratePlanInput> = {}) => generateRunPlan({ ...BASE, ...over });

describe('archetypeForTemplate', () => {
  it('reads a race plan from a distance goal plus a date', () => {
    expect(archetypeForTemplate({ distanceGoal: 'marathon', hasEventDate: true }).key).toBe('race');
  });

  it('reads a distance goal without a date as its own archetype', () => {
    expect(archetypeForTemplate({ distanceGoal: 'marathon', hasEventDate: false }).key).toBe('distance_goal');
  });

  it('reads intent out of the name where the goal does not carry it', () => {
    expect(archetypeForTemplate({ name: 'Run to Maintain' }).key).toBe('maintain');
    expect(archetypeForTemplate({ name: 'Get Faster' }).key).toBe('run_faster');
    expect(archetypeForTemplate({ name: 'Run Further' }).key).toBe('run_further');
  });

  it('falls back to train-your-way for a general template', () => {
    expect(archetypeForTemplate({ distanceGoal: 'general' }).key).toBe('train_your_way');
    expect(archetypeForTemplate({}).key).toBe('train_your_way');
  });

  it('prefers an explicit key over anything inferred', () => {
    expect(archetypeForTemplate({ archetypeKey: 'maintain', distanceGoal: 'marathon', hasEventDate: true }).key)
      .toBe('maintain');
  });

  it('ignores an unrecognised key rather than throwing', () => {
    expect(archetypeForTemplate({ archetypeKey: 'nonsense', distanceGoal: '10k', hasEventDate: true }).key)
      .toBe('race');
  });
});

describe('raceDistanceFor', () => {
  it('maps the template values the app actually stores', () => {
    expect(raceDistanceFor('5k')).toBe('5k');
    expect(raceDistanceFor('half_marathon')).toBe('half_marathon');
    expect(raceDistanceFor(null)).toBe('general');
    expect(raceDistanceFor('something else')).toBe('general');
  });
});

describe('tierForFitnessLevel', () => {
  it('maps the five stored levels onto four tiers', () => {
    expect(tierForFitnessLevel('advanced')).toBe('advanced');
    expect(tierForFitnessLevel('beginner')).toBe('beginner');
  });

  it('treats a returning runner cautiously rather than at their old level', () => {
    expect(tierForFitnessLevel('returning')).toBe('recreational');
  });

  it('defaults rather than throwing on an unknown level', () => {
    expect(tierForFitnessLevel(null)).toBe('recreational');
    expect(tierForFitnessLevel('nonsense')).toBe('recreational');
  });
});

describe('assumedLongestRun', () => {
  it('is a share of the week, never zero', () => {
    expect(assumedLongestRun(30)).toBe(9);
    expect(assumedLongestRun(0)).toBeGreaterThan(0);
  });
});

describe('phaseForWeek', () => {
  const w = (kind: 'build' | 'down' | 'taper' | 'race') =>
    ({ week: 1, km: 30, longRunKm: 10, kind } as const);

  it('reads taper and race straight off the curve', () => {
    expect(phaseForWeek(w('taper'), 9, 10)).toBe('taper');
    expect(phaseForWeek(w('race'), 11, 10)).toBe('race');
  });

  it('calls the opening third base and the last two build weeks peak', () => {
    expect(phaseForWeek(w('build'), 0, 10)).toBe('base');
    expect(phaseForWeek(w('build'), 5, 10)).toBe('build');
    expect(phaseForWeek(w('build'), 9, 10)).toBe('peak');
  });
});

describe('generateRunPlan', () => {
  it('produces one week per plan week, numbered from 1', () => {
    const plan = gen({ weeks: 12 });
    expect(plan.weeks).toHaveLength(12);
    expect(plan.weeks[0].week).toBe(1);
    expect(plan.weekSlots).toHaveLength(12);
  });

  it('gives every week a session for every training day', () => {
    const plan = gen({ days: [0, 2, 4, 6] });
    for (const week of plan.weeks) expect(week.sessions).toHaveLength(4);
  });

  it('places sessions on the days the runner chose, and nowhere else', () => {
    const days = [1, 3, 5];
    const plan = gen({ days, longRunDay: 5 });
    for (const slots of plan.weekSlots) {
      for (const slot of slots) expect(days).toContain(slot.day);
    }
  });

  it('gives each slot a key unique within its week', () => {
    // The scheduler uses these as picker row ids; duplicates would collide.
    for (const slots of gen({ days: [0, 1, 2, 3, 4] }).weekSlots) {
      expect(new Set(slots.map((s) => s.key)).size).toBe(slots.length);
    }
  });

  it('labels weeks with the phase they are in', () => {
    const labels = gen({ weeks: 12 }).weeks.map((w) => w.label);
    expect(labels[0]).toBe('Base');
    expect(labels[labels.length - 1]).toBe('Race');
    expect(new Set(labels).size).toBeGreaterThan(2);
  });

  it('ends a race archetype with a race session', () => {
    const plan = gen({ archetype: ARCHETYPES.race });
    expect(plan.weeks[plan.weeks.length - 1].sessions).toContain('race');
  });

  it('never ends a no-race archetype with a race', () => {
    const plan = gen({ archetype: ARCHETYPES.maintain, goal: 'general' });
    for (const week of plan.weeks) expect(week.sessions).not.toContain('race');
  });

  it('holds volume flat for a maintain plan and grows it for a race plan', () => {
    const spread = (input: Partial<GeneratePlanInput>) => {
      const km = gen(input).weeks.map((w) => w.km);
      return Math.max(...km) - Math.min(...km);
    };
    const flat = spread({ archetype: ARCHETYPES.maintain, goal: 'general' });
    const race = spread({ archetype: ARCHETYPES.race });
    expect(flat).toBeLessThan(race);
  });

  it('forces the difficulty an archetype demands', () => {
    // A 5K PB plan is intensity-led: it should carry more hard sessions than a
    // balanced race plan over the same days.
    const hardCount = (input: Partial<GeneratePlanInput>) =>
      gen(input).weeks.reduce((n, w) =>
        n + w.sessions.filter((s) => ['intervals', 'tempo', 'threshold', 'progression'].includes(s)).length, 0);
    expect(hardCount({ archetype: ARCHETYPES.improve_5k, goal: '5k', difficulty: 'comfortable' }))
      .toBeGreaterThan(hardCount({ archetype: ARCHETYPES.race, goal: '5k', difficulty: 'comfortable' }));
  });

  it('respects the archetype minimum rather than producing a stub plan', () => {
    expect(gen({ weeks: 1, archetype: ARCHETYPES.race }).weeks.length)
      .toBeGreaterThanOrEqual(ARCHETYPES.race.minWeeks);
  });

  it('reports a total that matches the weeks it produced', () => {
    const plan = gen();
    const summed = Math.round(plan.weeks.reduce((s, w) => s + w.km, 0) * 10) / 10;
    expect(plan.totalKm).toBeCloseTo(summed, 1);
  });

  it('composes a down week as a back-off rather than a hard week', () => {
    const plan = gen({ weeks: 12 });
    const downIndex = plan.curve.findIndex((w) => w.kind === 'down');
    expect(downIndex).toBeGreaterThan(-1);
    const hardIn = (i: number) =>
      plan.weeks[i].sessions.filter((s) => ['intervals', 'tempo', 'threshold'].includes(s)).length;
    expect(hardIn(downIndex)).toBeLessThanOrEqual(hardIn(downIndex - 1));
  });

  it('builds a coherent plan for every archetype and goal', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      for (const goal of ['5k', '10k', 'half_marathon', 'marathon', 'general'] as const) {
        const plan = gen({ archetype, goal, weeks: 10 });
        expect(plan.weeks.length).toBeGreaterThanOrEqual(archetype.minWeeks);
        for (const week of plan.weeks) {
          expect(week.km).toBeGreaterThan(0);
          expect(week.sessions.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
