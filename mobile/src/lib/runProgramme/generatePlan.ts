import { buildVolumeCurve, type AbilityTier, type CurveWeek, type RaceDistance, type VolumePreset } from './volumeCurve';
import { composeWeek, type ComposedSession, type Difficulty, type WeekPhase, type DayIndex } from './weekComposer';
import type { Archetype } from './archetypes';
import { stageLadder, WALK_RUN_STAGES, type WalkRunStage } from './walkRun';

/**
 * Turns a runner and an archetype into a week-by-week plan.
 *
 * The output deliberately matches the shape the scheduler already consumes —
 * `{ week, km, label, sessions[] }` — so wiring the generator in is a change of
 * source, not a rewrite of everything downstream. What is new is `weekSlots`,
 * which carries the per-week day placement the composer worked out, because a
 * base week and a peak week do not hold the same sessions on the same days.
 */

export interface GeneratedWeek {
  week:     number;
  km:       number;
  /** Phase name, shown in the plan preview. */
  label:    string;
  sessions: string[];
}

export interface GeneratedSlot {
  key:   string;
  label: string;
  day:   DayIndex;
}

export interface GeneratedPlan {
  weeks:     GeneratedWeek[];
  weekSlots: GeneratedSlot[][];
  curve:     CurveWeek[];
  totalKm:   number;
  /** Ladder stage per week. Only present for walk-run archetypes. */
  walkRun?:  WalkRunStage[];
}

export interface GeneratePlanInput {
  archetype:           Archetype;
  goal:                RaceDistance;
  weeks:               number;
  tier:                AbilityTier;
  preset:              VolumePreset;
  difficulty:          Difficulty;
  currentWeeklyKm:     number;
  currentLongestRunKm: number;
  days:                DayIndex[];
  longRunDay:          DayIndex;
  /** Cycle-aligned back-off weeks. PR 6 supplies these; otherwise every fourth. */
  downWeeks?:          number[];
  /**
   * Ranks candidate days for hard work, per week — the cycle phase a Tuesday
   * falls in changes as the plan goes on, so a single week-blind ranker would
   * put every hard session in the same place regardless.
   */
  rankHardDay?:        (day: DayIndex, weekIndex: number) => number;
  /** Where a returning runner joins the walk-run ladder. */
  startStage?:         number;
}

/**
 * Which phase a week belongs to, from where it sits in the plan.
 *
 * Base is the first third, peak the two weeks before the taper, build the rest.
 * The curve already knows which weeks taper and which is race day, so those are
 * read straight off it rather than recomputed.
 */
export function phaseForWeek(week: CurveWeek, index: number, buildWeekCount: number): WeekPhase {
  if (week.kind === 'race')  return 'race';
  if (week.kind === 'taper') return 'taper';
  if (index < Math.ceil(buildWeekCount * 0.35)) return 'base';
  if (index >= buildWeekCount - 2)              return 'peak';
  return 'build';
}

const PHASE_LABEL: Record<WeekPhase, string> = {
  base:  'Base',
  build: 'Build',
  peak:  'Peak',
  taper: 'Taper',
  race:  'Race',
};

export function generateRunPlan(input: GeneratePlanInput): GeneratedPlan {
  const { archetype } = input;

  // A flat archetype has nowhere to build to: hold the runner where they are.
  // An intensity-led one holds volume too — what progresses there is the work
  // inside the sessions, which the composer and the session shapes handle.
  const preset: VolumePreset =
    archetype.forcePreset ??
    (archetype.progression === 'volume' ? input.preset : 'gradual');

  const difficulty = archetype.forceDifficulty ?? input.difficulty;

  const curve = buildVolumeCurve({
    weeks:               Math.max(archetype.minWeeks, input.weeks),
    tier:                input.tier,
    preset,
    goal:                input.goal,
    currentWeeklyKm:     input.currentWeeklyKm,
    currentLongestRunKm: input.currentLongestRunKm,
    hasRace:             archetype.hasRace,
    downWeeks:           input.downWeeks,
  });

  const buildWeekCount = curve.filter((w) => w.kind === 'build' || w.kind === 'down').length;

  const isWalkRun = archetype.progression === 'walk_run';

  // The ladder needs to know how long the sessions are, and the curve deals in
  // distance. Minutes per session is the honest unit for someone who is not yet
  // running continuously, so convert through an assumed easy effort.
  const walkRunStages: WalkRunStage[] | undefined = isWalkRun
    ? stageLadder(
        curve.map((w) => (w.km / Math.max(1, input.days.length)) * 7),
        input.startStage ?? 0,
      ).map((i) => WALK_RUN_STAGES[i])
    : undefined;

  const weeks:     GeneratedWeek[] = [];
  const weekSlots: GeneratedSlot[][] = [];

  curve.forEach((week, i) => {
    const phase = phaseForWeek(week, i, buildWeekCount);

    // A down week is a back-off, so it is composed as a base week however far
    // into the plan it falls: the point of it is less hard work, not less
    // running. Race week composes itself.
    const composePhase: WeekPhase = week.kind === 'down' ? 'base' : phase;

    const composed: ComposedSession[] = composeWeek({
      days:        input.days,
      longRunDay:  input.longRunDay,
      phase:       composePhase,
      goal:        input.goal,
      difficulty,
      isRaceWeek:  week.kind === 'race',
      rankHardDay: input.rankHardDay ? (day) => input.rankHardDay!(day, i) : undefined,
    });

    // A walk-run plan is walk-run all the way through: hard sessions and long
    // runs mean nothing to someone still building continuous running, and the
    // ladder is the progression. The race is the exception — a Path to parkrun
    // plan that does not end with the parkrun in it is missing the point.
    const sessions = isWalkRun
      ? composed.map((s) => (s.type === 'race' ? 'race' : 'run_walk'))
      : composed.map((s) => s.type);

    weeks.push({
      week:     week.week,
      km:       week.km,
      // A back-off week is labelled as one, ahead of everything else. It is
      // still a Build week by phase, and on a walk-run plan it still has a
      // ladder stage, but neither is what the runner needs to know when they
      // look at it — they need to know this is the easy one. Emma's own
      // templates call it Recovery, so it says Recovery.
      label:
        week.kind === 'down'                ? 'Recovery'
        : isWalkRun && week.kind !== 'race' ? walkRunLabel(walkRunStages![i])
        : PHASE_LABEL[phase],
      sessions,
    });

    const seen: Record<string, number> = {};
    weekSlots.push(composed.map((s, si) => {
      const label = sessions[si];
      const n = seen[label] ?? 0;
      seen[label] = n + 1;
      return { key: `${label}_${n}`, label, day: s.day };
    }));
  });

  return {
    weeks,
    weekSlots,
    curve,
    totalKm: Math.round(curve.reduce((sum, w) => sum + w.km, 0) * 10) / 10,
    walkRun: walkRunStages,
  };
}

/** "Run 3 min / walk 1 min", or "Continuous" at the top of the ladder. */
export function walkRunLabel(stage: WalkRunStage): string {
  if (stage.walkS === 0) return 'Continuous';
  const mins = (s: number) => (s % 60 === 0 ? `${s / 60}` : `${(s / 60).toFixed(1)}`);
  return `Run ${mins(stage.runS)} / walk ${mins(stage.walkS)}`;
}
