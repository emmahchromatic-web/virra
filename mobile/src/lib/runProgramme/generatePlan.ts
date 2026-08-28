import { buildVolumeCurve, type AbilityTier, type CurveWeek, type RaceDistance, type VolumePreset } from './volumeCurve';
import { composeWeek, type ComposedSession, type Difficulty, type WeekPhase, type DayIndex } from './weekComposer';
import type { Archetype } from './archetypes';

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
  /** Ranks candidate days for hard work. PR 6 plugs `anchorKeySession` in here. */
  rankHardDay?:        (day: DayIndex) => number;
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
      rankHardDay: input.rankHardDay,
    });

    weeks.push({
      week:     week.week,
      km:       week.km,
      label:    PHASE_LABEL[phase],
      sessions: composed.map((s) => s.type),
    });

    const seen: Record<string, number> = {};
    weekSlots.push(composed.map((s) => {
      const n = seen[s.type] ?? 0;
      seen[s.type] = n + 1;
      return { key: `${s.type}_${n}`, label: s.type, day: s.day };
    }));
  });

  return {
    weeks,
    weekSlots,
    curve,
    totalKm: Math.round(curve.reduce((sum, w) => sum + w.km, 0) * 10) / 10,
  };
}
