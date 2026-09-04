import {
  shapingStrength,
  phaseOn,
  cycleAlignedDownWeeks,
  rankHardDay,
  type CycleContext,
} from '@/lib/runProgramme/cycleShaping';
import { generateRunPlan } from '@/lib/runProgramme/generatePlan';
import { ARCHETYPES } from '@/lib/runProgramme/archetypes';
import { defaultDownWeeks } from '@/lib/runProgramme/volumeCurve';

const PERIOD_START = new Date('2026-01-05T00:00:00');
const PLAN_START   = new Date('2026-01-05T00:00:00');

const ctx = (over: Partial<CycleContext> = {}): CycleContext => ({
  mode: 'flow', periodStart: PERIOD_START, cycleLength: 28, ...over,
});

describe('shapingStrength', () => {
  it('shapes nothing for a runner who does not track a cycle', () => {
    expect(shapingStrength(ctx({ mode: 'steady' }), false)).toBe('none');
  });

  it('shapes nothing when there is no period date to predict from', () => {
    expect(shapingStrength(ctx({ periodStart: null }), false)).toBe('none');
  });

  it('gives an irregular cycle the coarse half only', () => {
    // Moving a back-off week by seven days is forgiving if the prediction is
    // off; putting a specific session on a specific day is not.
    expect(shapingStrength(ctx(), true)).toBe('coarse');
  });

  it('shapes fully for a predictable cycle', () => {
    expect(shapingStrength(ctx(), false)).toBe('full');
  });

  it('treats a pack cycle as trackable', () => {
    expect(shapingStrength(ctx({ mode: 'pack' }), false)).toBe('full');
  });
});

describe('phaseOn', () => {
  it('reports the menstrual phase at the start of a cycle', () => {
    expect(phaseOn(ctx(), PERIOD_START)).toBe('menstrual');
  });

  it('reports nothing without a period date', () => {
    expect(phaseOn(ctx({ periodStart: null }), PERIOD_START)).toBeNull();
  });
});

describe('cycleAlignedDownWeeks', () => {
  const candidates = defaultDownWeeks(12);

  it('returns one back-off week per candidate', () => {
    expect(cycleAlignedDownWeeks(PLAN_START, ctx(), candidates)).toHaveLength(candidates.length);
  });

  it('never moves one more than a week', () => {
    const out = cycleAlignedDownWeeks(PLAN_START, ctx(), candidates);
    out.forEach((w, i) => expect(Math.abs(w - candidates[i])).toBeLessThanOrEqual(1));
  });

  it('never produces two back-off weeks in the same week', () => {
    const out = cycleAlignedDownWeeks(PLAN_START, ctx(), candidates);
    expect(new Set(out).size).toBe(out.length);
  });

  it('never produces two in a row — that has stopped being a plan', () => {
    const out = cycleAlignedDownWeeks(PLAN_START, ctx(), candidates).sort((a, b) => a - b);
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThan(1);
  });

  it('never lands before the first week', () => {
    for (const w of cycleAlignedDownWeeks(PLAN_START, ctx(), [1, 4, 8])) {
      expect(w).toBeGreaterThanOrEqual(1);
    }
  });

  it('comes back sorted', () => {
    const out = cycleAlignedDownWeeks(PLAN_START, ctx(), candidates);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });

  it('actually moves a week when the cycle wants it moved', () => {
    // A 28-day cycle against a 4-week rhythm lines up; offsetting the period by
    // ten days should pull at least one back-off week off its default.
    const offset = new Date(PERIOD_START.getTime() + 10 * 86_400_000);
    const out = cycleAlignedDownWeeks(PLAN_START, ctx({ periodStart: offset }), candidates);
    expect(out).not.toEqual(candidates);
  });

  it('puts back-off weeks in a menstrual or luteal week where it can', () => {
    const out = cycleAlignedDownWeeks(PLAN_START, ctx(), candidates);
    const phases = out.map((w) => phaseOn(ctx(), new Date(PLAN_START.getTime() + ((w - 1) * 7 + 3) * 86_400_000)));
    expect(phases.filter((p) => p === 'menstrual' || p === 'luteal').length).toBeGreaterThan(0);
  });
});

describe('rankHardDay', () => {
  const rank = rankHardDay(PLAN_START, ctx());

  it('prefers the follicular phase for hard work', () => {
    // Week 1 starts on day 1 of the cycle: menstrual early, follicular later.
    const menstrual = rank(0, 0);
    const later     = rank(0, 1);
    expect(later).toBeLessThan(menstrual);
  });

  it('varies by week, because the phase does', () => {
    const week0 = [0, 1, 2, 3, 4, 5, 6].map((d) => rank(d, 0));
    const week2 = [0, 1, 2, 3, 4, 5, 6].map((d) => rank(d, 2));
    expect(week0).not.toEqual(week2);
  });

  it('is indifferent when there is no cycle to read', () => {
    const flat = rankHardDay(PLAN_START, ctx({ periodStart: null }));
    const ranks = [0, 1, 2, 3, 4, 5, 6].map((d) => flat(d, 0));
    expect(new Set(ranks).size).toBe(1);
  });
});

describe('a cycle-shaped plan', () => {
  const base = {
    archetype: ARCHETYPES.race, goal: 'half_marathon' as const, weeks: 12,
    tier: 'recreational' as const, preset: 'steady' as const, difficulty: 'balanced' as const,
    currentWeeklyKm: 20, currentLongestRunKm: 7,
    days: [0, 1, 3, 5, 6], longRunDay: 6,
  };

  it('backs off in the weeks it is told to', () => {
    // Weeks 11 and 12 are the taper for a 12-week half, so only the back-off
    // weeks inside the build can be moved.
    const plan = generateRunPlan({ ...base, downWeeks: [3, 7] });
    const down = plan.curve.filter((w) => w.kind === 'down').map((w) => w.week);
    expect(down).toEqual([3, 7]);
  });

  const hardDays = (p: ReturnType<typeof generateRunPlan>) =>
    p.weekSlots.map((slots) =>
      slots.filter((s) => ['tempo', 'threshold', 'intervals', 'progression'].includes(s.label)).map((s) => s.day));

  it('leaves placement alone when every legal day sits in the same phase', () => {
    // Worth being honest about: for common day patterns the cycle changes
    // nothing here. Excluding the long-run day and the day after it leaves a run
    // of consecutive days, and a run of consecutive days usually falls inside
    // one phase — so every candidate ranks equally and the spacing rule decides,
    // as it did before. The down-week alignment does the visible work.
    //
    // Sub-phase granularity (early luteal ahead of late luteal, say) would give
    // this more to say. That is a physiological judgement rather than an
    // arithmetic one, so it is deliberately not invented here.
    for (const days of [[0, 1, 3, 5, 6], [0, 1, 2, 3, 4, 5, 6]]) {
      const plain  = generateRunPlan({ ...base, days });
      const shaped = generateRunPlan({ ...base, days, rankHardDay: rankHardDay(PLAN_START, ctx()) });
      expect(hardDays(shaped)).toEqual(hardDays(plain));
    }
  });

  it('does move placement when the phases genuinely differ across the week', () => {
    // A synthetic ranker standing in for a cycle that splits the candidates,
    // proving the seam works even where a real cycle rarely exercises it.
    const plain  = generateRunPlan({ ...base, days: [0, 1, 2, 3, 4, 5, 6] });
    const shaped = generateRunPlan({
      ...base, days: [0, 1, 2, 3, 4, 5, 6],
      rankHardDay: (day) => (day === 1 ? 0 : 5),
    });
    expect(hardDays(shaped)).not.toEqual(hardDays(plain));
  });

  it('still obeys the composer\'s recovery rules, whatever the cycle prefers', () => {
    const plan = generateRunPlan({ ...base, days: [0, 1, 2, 3, 4, 5, 6], rankHardDay: rankHardDay(PLAN_START, ctx()) });
    const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
    for (const slots of plan.weekSlots) {
      const hard = slots.filter((s) => ['tempo', 'threshold', 'intervals', 'progression'].includes(s.label)).map((s) => s.day);
      const long = slots.find((s) => s.label === 'long')?.day;
      for (let i = 0; i < hard.length; i++) {
        if (long != null) expect(gap(hard[i], long)).toBeGreaterThanOrEqual(2);
        for (let j = i + 1; j < hard.length; j++) {
          expect(gap(hard[i], hard[j])).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('produces the same plan twice for the same inputs', () => {
    const once  = generateRunPlan({ ...base, rankHardDay: rankHardDay(PLAN_START, ctx()) });
    const twice = generateRunPlan({ ...base, rankHardDay: rankHardDay(PLAN_START, ctx()) });
    expect(once.weekSlots).toEqual(twice.weekSlots);
  });
});
