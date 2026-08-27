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
  /**
   * How hard each week's quality work should be. Constant for most plans; on an
   * intensity-led plan this is what progresses, because the volume does not.
   */
  intensities: Difficulty[];
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

const RECOVERY_LABEL = 'Recovery';

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
    mode:                archetype.progression === 'recovery' ? 'descend'
                       : archetype.progression === 'volume' || archetype.progression === 'walk_run' ? 'build'
                       : 'flat',
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

  const isWalkRun      = archetype.progression === 'walk_run';
  const isIntensityLed = archetype.progression === 'intensity';

  // The ladder needs to know how long the sessions are, and the curve deals in
  // distance. Minutes per session is the honest unit for someone who is not yet
  // running continuously, so convert through an assumed easy effort.
  const walkRunStages: WalkRunStage[] | undefined = isWalkRun
    ? stageLadder(
        curve.map((w) => (w.km / Math.max(1, input.days.length)) * 7),
        input.startStage ?? 0,
      ).map((i) => WALK_RUN_STAGES[i])
    : undefined;

  // An intensity-led plan holds its volume and progresses the work inside the
  // sessions instead. Escalating over the plan is that progression: the first
  // third eases in, the last third is the hard part.
  const intensityFor = (i: number, total: number): Difficulty => {
    if (!isIntensityLed) return difficulty;
    if (i < Math.ceil(total / 3))     return 'comfortable';
    if (i < Math.ceil((total * 2) / 3)) return 'balanced';
    return 'challenging';
  };

  const weeks:       GeneratedWeek[] = [];
  const weekSlots:   GeneratedSlot[][] = [];
  const intensities: Difficulty[] = [];

  curve.forEach((week, i) => {
    const phase = phaseForWeek(week, i, buildWeekCount);

    // A down week is a back-off, so it is composed as a base week however far
    // into the plan it falls: the point of it is less hard work, not less
    // running. Race week composes itself.
    //
    // Intensity-led plans skip the base phase entirely. Base exists to build an
    // aerobic engine before the sharp work starts, and it does that by removing
    // a hard session — which on a plan someone chose *because* they want to get
    // faster means three weeks of easy running and no reason given. The
    // escalation is the ramp-in here.
    const composePhase: WeekPhase =
      week.kind === 'down'                     ? 'base'
      : isIntensityLed && phase === 'base'     ? 'build'
      : phase;

    const weekIntensity = intensityFor(i, curve.length);
    intensities.push(weekIntensity);

    const composed: ComposedSession[] = composeWeek({
      days:        input.days,
      longRunDay:  input.longRunDay,
      phase:       composePhase,
      goal:        input.goal,
      difficulty:  weekIntensity,
      isRaceWeek:  week.kind === 'race',
      rankHardDay: input.rankHardDay ? (day) => input.rankHardDay!(day, i) : undefined,
    });

    // A walk-run plan is walk-run all the way through: hard sessions and long
    // runs mean nothing to someone still building continuous running, and the
    // ladder is the progression. The race is the exception — a Path to parkrun
    // plan that does not end with the parkrun in it is missing the point.
    // A recovery plan has no hard days in it at all. Whatever the composer
    // chose, it comes out easy — the point of the fortnight after a race is
    // that nothing in it is a session.
    const sessions = isWalkRun
      ? composed.map((s) => (s.type === 'race' ? 'race' : 'run_walk'))
      : archetype.progression === 'recovery'
        ? composed.map((s) => (s.isLong ? 'easy' : 'recovery'))
        : composed.map((s) => s.type);

    weeks.push({
      week:     week.week,
      km:       week.km,
      label:    archetype.progression === 'recovery'
        ? RECOVERY_LABEL
        : isWalkRun && week.kind !== 'race'
          ? walkRunLabel(walkRunStages![i])
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
    intensities,
  };
}

/** "Run 3 min / walk 1 min", or "Continuous" at the top of the ladder. */
export function walkRunLabel(stage: WalkRunStage): string {
  if (stage.walkS === 0) return 'Continuous';
  const mins = (s: number) => (s % 60 === 0 ? `${s / 60}` : `${(s / 60).toFixed(1)}`);
  return `Run ${mins(stage.runS)} / walk ${mins(stage.walkS)}`;
}
