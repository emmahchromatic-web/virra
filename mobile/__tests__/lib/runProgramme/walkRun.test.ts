import {
  WALK_RUN_STAGES,
  CONTINUOUS_STAGE_INDEX,
  MAX_WEEKLY_RUN_TIME_GROWTH,
  MAX_WEEKLY_RUN_TIME_INCREASE_MIN,
  runFraction,
  stageLadder,
  startStageForLayoff,
} from '@/lib/runProgramme/walkRun';
import { generateRunPlan } from '@/lib/runProgramme/generatePlan';
import { ARCHETYPES, archetypeForTemplate } from '@/lib/runProgramme/archetypes';
import { buildRunSession } from '@/lib/runProgramme/sessionShapes';

describe('the ladder itself', () => {
  it('climbs from mostly walking to continuous running', () => {
    expect(runFraction(WALK_RUN_STAGES[0])).toBeLessThan(0.5);
    expect(runFraction(WALK_RUN_STAGES[CONTINUOUS_STAGE_INDEX])).toBe(1);
  });

  it('never goes backwards up the rungs', () => {
    for (let i = 1; i < WALK_RUN_STAGES.length; i++) {
      expect(runFraction(WALK_RUN_STAGES[i])).toBeGreaterThan(runFraction(WALK_RUN_STAGES[i - 1]));
    }
  });
});

describe('stageLadder — the double constraint', () => {
  it('starts where it is told to', () => {
    expect(stageLadder([20, 20, 20], 2)[0]).toBe(2);
  });

  it('never advances more than one rung in a week', () => {
    const stages = stageLadder(Array(12).fill(30));
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i] - stages[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it('never goes down', () => {
    const stages = stageLadder([20, 22, 24, 18, 26, 28]);
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]);
    }
  });

  it('holds the stage when advancing would add too many minutes on feet', () => {
    // On a big week, 1:2 to 1:1 adds twenty minutes of running — past both
    // limits, so the ladder waits.
    expect(stageLadder([120, 120, 120], 0)[1]).toBe(0);
  });

  it('advances on a small week, where the same rung is only a few minutes', () => {
    // The same jump on a 20-minute week is +3 minutes. Forbidding it on the
    // percentage alone is what left a nine-week beginner plan at 2:1.
    expect(stageLadder([20, 20, 20], 0)[1]).toBe(1);
  });

  it('keeps every advance inside one of the two limits', () => {
    const weeks  = [20, 21, 22, 23, 24, 25, 26, 27, 40, 60, 90, 120];
    const stages = stageLadder(weeks);
    for (let i = 1; i < stages.length; i++) {
      if (stages[i] === stages[i - 1]) continue;
      const before = weeks[i - 1] * runFraction(WALK_RUN_STAGES[stages[i - 1]]);
      const after  = weeks[i]     * runFraction(WALK_RUN_STAGES[stages[i]]);
      const withinPercent  = after / before <= 1 + MAX_WEEKLY_RUN_TIME_GROWTH + 1e-9;
      const withinAbsolute = after - before <= MAX_WEEKLY_RUN_TIME_INCREASE_MIN + 1e-9;
      expect(withinPercent || withinAbsolute).toBe(true);
    }
  });

  it('never takes a rung in a back-off week', () => {
    // Week 3 is shorter than week 2: a back-off week is for backing off.
    const weeks  = [20, 22, 15, 24];
    const stages = stageLadder(weeks);
    expect(stages[2]).toBe(stages[1]);
  });

  it('stops at continuous rather than running off the end of the ladder', () => {
    const stages = stageLadder(Array(60).fill(0).map((_, i) => 20 + i * 2));
    expect(Math.max(...stages)).toBeLessThanOrEqual(CONTINUOUS_STAGE_INDEX);
  });

  it('returns one stage per week', () => {
    expect(stageLadder([10, 12, 14, 16])).toHaveLength(4);
  });
});

describe('startStageForLayoff', () => {
  it('starts someone off for a year at the bottom', () => {
    expect(startStageForLayoff(52)).toBe(0);
  });

  it('starts a short layoff further up', () => {
    expect(startStageForLayoff(2)).toBeGreaterThan(startStageForLayoff(26));
  });

  it('never starts anyone at continuous running — that would make the plan pointless', () => {
    for (const weeks of [0, 1, 2, 4, 8, 12, 26, 52, 200]) {
      expect(startStageForLayoff(weeks)).toBeLessThan(CONTINUOUS_STAGE_INDEX);
    }
  });
});

describe('walk-run archetypes', () => {
  it('recognises them from a template name', () => {
    expect(archetypeForTemplate({ name: 'Path to parkrun' }).key).toBe('path_to_parkrun');
    expect(archetypeForTemplate({ name: 'New to Running' }).key).toBe('new_to_running');
    expect(archetypeForTemplate({ name: 'Return to Running' }).key).toBe('return_after_break');
  });

  it('does not offer postpartum or return-after-injury — they need a physio first', () => {
    const keys = Object.keys(ARCHETYPES);
    expect(keys).not.toContain('postpartum');
    expect(keys).not.toContain('return_after_injury');
  });

  it('forces gentle volume and intensity, because the ladder is the progression', () => {
    for (const key of ['new_to_running', 'path_to_parkrun', 'return_after_break'] as const) {
      expect(ARCHETYPES[key].forcePreset).toBe('gradual');
      expect(ARCHETYPES[key].forceDifficulty).toBe('comfortable');
    }
  });
});

describe('generating a walk-run plan', () => {
  const plan = (over = {}) => generateRunPlan({
    archetype: ARCHETYPES.new_to_running, goal: 'general', weeks: 9,
    tier: 'beginner', preset: 'gradual', difficulty: 'comfortable',
    currentWeeklyKm: 8, currentLongestRunKm: 2,
    days: [0, 2, 4], longRunDay: 4, ...over,
  });

  it('makes every session a walk-run', () => {
    for (const week of plan().weeks) {
      for (const s of week.sessions) expect(s).toBe('run_walk');
    }
  });

  it('still ends a Path to parkrun plan with the parkrun', () => {
    const p = plan({ archetype: ARCHETYPES.path_to_parkrun, goal: '5k', weeks: 9 });
    const last = p.weeks[p.weeks.length - 1];
    expect(last.sessions).toContain('race');
    expect(last.label).toBe('Race');
  });

  it('carries a ladder stage for every week', () => {
    const p = plan();
    expect(p.walkRun).toHaveLength(p.weeks.length);
  });

  it('labels weeks by the stage rather than by a training phase', () => {
    const labels = plan().weeks.map((w) => w.label);
    expect(labels[0]).toMatch(/^Run \d/);
    expect(labels).not.toContain('Base');
  });

  it('does not attach a ladder to an ordinary plan', () => {
    expect(plan({ archetype: ARCHETYPES.race, goal: '10k' }).walkRun).toBeUndefined();
  });

  it('progresses up the ladder over the plan', () => {
    const p = plan({ weeks: 12 });
    const first = runFraction(p.walkRun![0]);
    const last  = runFraction(p.walkRun![p.walkRun!.length - 1]);
    expect(last).toBeGreaterThan(first);
  });

  it('starts a returning runner further up than a complete beginner', () => {
    const beginner  = plan({ startStage: 0 });
    const returning = plan({ archetype: ARCHETYPES.return_after_break, startStage: 3 });
    expect(runFraction(returning.walkRun![0])).toBeGreaterThan(runFraction(beginner.walkRun![0]));
  });
});

describe('walk-run sessions', () => {
  it('uses the stage it is given', () => {
    const s = buildRunSession({
      type: 'run_walk', distanceKm: 4, thresholdSecs: 400, walkRun: { runS: 120, walkS: 60 },
    });
    const sub = s.steps[0].sub_steps!;
    expect(sub[0].target.duration_s).toBe(120);
    expect(sub[1].target.duration_s).toBe(60);
  });

  it('drops the walk entirely at the top of the ladder', () => {
    const s = buildRunSession({
      type: 'run_walk', distanceKm: 5, thresholdSecs: 400, walkRun: { runS: 1800, walkS: 0 },
    });
    expect(s.steps[0].sub_steps).toHaveLength(1);
    expect(s.steps[0].sub_steps![0].label).toBe('run');
  });

  it('falls back to the original 4-and-1 when no stage is given', () => {
    const s = buildRunSession({ type: 'run_walk', distanceKm: 5, thresholdSecs: 400 });
    const sub = s.steps[0].sub_steps!;
    expect(sub[0].target.duration_s).toBe(240);
    expect(sub[1].target.duration_s).toBe(60);
  });
});
