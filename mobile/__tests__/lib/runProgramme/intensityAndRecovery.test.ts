import { generateRunPlan, type GeneratePlanInput } from '@/lib/runProgramme/generatePlan';
import { ARCHETYPES, archetypeForTemplate } from '@/lib/runProgramme/archetypes';
import { buildVolumeCurve } from '@/lib/runProgramme/volumeCurve';

const BASE: GeneratePlanInput = {
  archetype:           ARCHETYPES.run_faster,
  goal:                '10k',
  weeks:               9,
  tier:                'intermediate',
  preset:              'steady',
  difficulty:          'balanced',
  currentWeeklyKm:     40,
  currentLongestRunKm: 14,
  days:                [0, 2, 4, 6],
  longRunDay:          6,
};

const gen = (over: Partial<GeneratePlanInput> = {}) => generateRunPlan({ ...BASE, ...over });

describe('a descending curve', () => {
  const curve = () => buildVolumeCurve({
    mode: 'descend', weeks: 3, tier: 'intermediate', preset: 'gradual', goal: 'marathon',
    currentWeeklyKm: 60, currentLongestRunKm: 30, hasRace: false,
  });

  it('starts below the runner\'s normal week, not at it', () => {
    // The week after a marathon is not a slightly easier training week.
    expect(curve()[0].km).toBeLessThan(60);
    expect(curve()[0].km).toBeGreaterThan(0);
  });

  it('comes down every week', () => {
    const c = curve();
    for (let i = 1; i < c.length; i++) expect(c[i].km).toBeLessThan(c[i - 1].km);
  });

  it('lands well below where the runner normally trains', () => {
    const c = curve();
    expect(c[c.length - 1].km).toBeLessThan(60 * 0.4);
  });

  it('shortens the long run with the week', () => {
    const c = curve();
    for (let i = 1; i < c.length; i++) {
      expect(c[i].longRunKm).toBeLessThanOrEqual(c[i - 1].longRunKm);
    }
  });

  it('has no back-off weeks, because the whole plan is one', () => {
    expect(curve().every((w) => w.kind === 'down')).toBe(true);
  });

  it('survives a one-week recovery plan', () => {
    const c = buildVolumeCurve({
      mode: 'descend', weeks: 1, tier: 'beginner', preset: 'gradual', goal: 'general',
      currentWeeklyKm: 20, currentLongestRunKm: 8, hasRace: false,
    });
    expect(c).toHaveLength(1);
    expect(c[0].km).toBeGreaterThan(0);
  });
});

describe('post-race recovery', () => {
  const plan = () => gen({ archetype: ARCHETYPES.post_race_recovery, goal: 'general', weeks: 2 });

  it('is recognised from a template name', () => {
    expect(archetypeForTemplate({ name: 'Post-Race Recovery' }).key).toBe('post_race_recovery');
  });

  it('descends rather than building', () => {
    const weeks = plan().weeks;
    expect(weeks[weeks.length - 1].km).toBeLessThan(weeks[0].km);
  });

  it('contains no hard sessions at all', () => {
    for (const week of plan().weeks) {
      for (const s of week.sessions) {
        expect(['easy', 'recovery']).toContain(s);
      }
    }
  });

  it('has no long run to speak of — nothing in it is a session', () => {
    for (const week of plan().weeks) expect(week.sessions).not.toContain('long');
  });

  it('says what it is', () => {
    for (const week of plan().weeks) expect(week.label).toBe('Recovery');
  });

  it('can be as short as a single week', () => {
    expect(gen({ archetype: ARCHETYPES.post_race_recovery, goal: 'general', weeks: 1 }).weeks)
      .toHaveLength(1);
  });
});

describe('intensity-led plans', () => {
  it('holds volume roughly flat where a race plan would build', () => {
    const spread = (p: ReturnType<typeof gen>) => {
      const km = p.weeks.map((w) => w.km);
      return (Math.max(...km) - Math.min(...km)) / Math.max(...km);
    };
    expect(spread(gen({ archetype: ARCHETYPES.run_faster })))
      .toBeLessThan(spread(gen({ archetype: ARCHETYPES.race })));
  });

  it('escalates the work instead', () => {
    const intensities = gen({ archetype: ARCHETYPES.run_faster }).intensities;
    expect(intensities[0]).toBe('comfortable');
    expect(intensities[intensities.length - 1]).toBe('challenging');
  });

  it('never goes backwards through the escalation', () => {
    const order = ['comfortable', 'balanced', 'challenging'];
    const intensities = gen({ archetype: ARCHETYPES.improve_5k, goal: '5k' }).intensities;
    for (let i = 1; i < intensities.length; i++) {
      expect(order.indexOf(intensities[i])).toBeGreaterThanOrEqual(order.indexOf(intensities[i - 1]));
    }
  });

  it('holds one intensity all the way through an ordinary plan', () => {
    const intensities = gen({ archetype: ARCHETYPES.race, difficulty: 'balanced' }).intensities;
    expect(new Set(intensities).size).toBe(1);
    expect(intensities[0]).toBe('balanced');
  });

  it('reports one intensity per week', () => {
    const p = gen({ archetype: ARCHETYPES.run_faster });
    expect(p.intensities).toHaveLength(p.weeks.length);
  });

  it('still puts hard sessions in the week', () => {
    const p = gen({ archetype: ARCHETYPES.run_faster });
    const hard = p.weeks.flatMap((w) => w.sessions)
      .filter((s) => ['intervals', 'tempo', 'threshold', 'progression'].includes(s));
    expect(hard.length).toBeGreaterThan(0);
  });
});

describe('every archetype still builds something coherent', () => {
  it('produces positive weeks for all of them', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      const p = gen({ archetype, goal: archetype.key === 'improve_5k' ? '5k' : 'general', weeks: 6 });
      expect(p.weeks.length).toBeGreaterThanOrEqual(archetype.minWeeks);
      expect(p.intensities).toHaveLength(p.weeks.length);
      for (const week of p.weeks) {
        expect(week.km).toBeGreaterThan(0);
        expect(week.sessions.length).toBeGreaterThan(0);
      }
    }
  });
});
