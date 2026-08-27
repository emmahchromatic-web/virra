import type { RunWorkoutType } from '@/lib/workoutStructure';
import type { RaceDistance } from './volumeCurve';

/**
 * What a week contains and which day each session lands on.
 *
 * Two decisions, kept separate because they fail differently. How many hard
 * sessions a week holds is a function of ambition and available days. Where they
 * sit is a function of recovery: a hard session too close to another, or the day
 * after a long run, is worse than no hard session at all.
 */

export type Difficulty  = 'comfortable' | 'balanced' | 'challenging';
export type WeekPhase   = 'base' | 'build' | 'peak' | 'taper' | 'race';

/** 0 = Monday … 6 = Sunday, matching planned_sessions.day_of_week. */
export type DayIndex = number;

/**
 * Hard sessions per week before the phase adjustment, by how many days the
 * runner actually runs. Two days a week cannot support two hard sessions and
 * still leave anything easy, which is why `comfortable` at 2 days is zero.
 */
const HARD_BY_DAYS: Record<Difficulty, Record<number, number>> = {
  comfortable:  { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2 },
  balanced:     { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 2 },
  challenging:  { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3 },
};

/** Minimum clear days between two hard sessions. 2 means at least one easy day between. */
export const MIN_HARD_SPACING_DAYS = 2;

export function hardSessionCount(
  days:       number,
  difficulty: Difficulty,
  phase:      WeekPhase,
): number {
  const base = HARD_BY_DAYS[difficulty][Math.min(7, Math.max(1, days))] ?? 0;
  // Base phase builds the aerobic engine; the sharp work comes later. Strides
  // and hills stand in, and they are not counted as hard sessions.
  if (phase === 'base') return Math.max(0, base - 1);
  // Taper keeps the count and cuts the volume — the point is to stay sharp
  // while recovering, so removing the quality entirely would defeat it.
  return base;
}

/**
 * Which hard sessions belong in a phase, for a goal. Ordered by preference: a
 * week wanting two hard sessions takes the first two.
 */
const HARD_MENU: Record<WeekPhase, Record<'short' | 'long', RunWorkoutType[]>> = {
  //                    5K / 10K                          half / marathon
  base:  { short: ['progression'],                   long: ['progression'] },
  build: { short: ['intervals', 'threshold'],        long: ['threshold', 'progression'] },
  peak:  { short: ['intervals', 'tempo'],            long: ['tempo', 'threshold'] },
  taper: { short: ['tempo'],                         long: ['tempo'] },
  race:  { short: [],                                long: [] },
};

function goalBucket(goal: RaceDistance): 'short' | 'long' {
  return goal === '5k' || goal === '10k' ? 'short' : 'long';
}

/**
 * The hard sessions a week actually gets.
 *
 * Never more than the menu holds. Cycling the menu to fill a count produced
 * weeks with two identical sessions in them — a taper week with two tempo runs,
 * which is not a taper week with two sessions in it, it is a mistake. Where the
 * phase only has one kind of hard work worth doing, the week does one.
 */
export function hardTypesFor(phase: WeekPhase, goal: RaceDistance, count: number): RunWorkoutType[] {
  const menu = HARD_MENU[phase][goalBucket(goal)];
  if (menu.length === 0 || count <= 0) return [];
  return menu.slice(0, count);
}

export interface ComposedSession {
  day:    DayIndex;
  type:   RunWorkoutType;
  isHard: boolean;
  isLong: boolean;
}

export interface ComposeInput {
  /** The days the runner has chosen to run on. */
  days:         DayIndex[];
  /** Preferred long-run day. Falls back to the last available day. */
  longRunDay:   DayIndex;
  phase:        WeekPhase;
  goal:         RaceDistance;
  difficulty:   Difficulty;
  /** True in the final week of a race plan: the long effort is the race. */
  isRaceWeek?:  boolean;
  /**
   * Ranks candidate days for a hard session, lowest first. The cycle-aware
   * generator injects `anchorKeySession` here so hard work lands in the phase
   * that suits it; without one, earlier days win and the result is stable.
   */
  rankHardDay?: (day: DayIndex) => number;
}

/** Days between two weekdays, the short way round the week. */
function circularGap(a: DayIndex, b: DayIndex): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 7 - raw);
}

/**
 * Lay out one week.
 *
 * Order matters: the long run is placed first because everything else is
 * defined relative to it, then hard sessions are chosen to sit as far from it
 * and from each other as the week allows, and whatever is left is easy running.
 */
export function composeWeek(input: ComposeInput): ComposedSession[] {
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  if (days.length === 0) return [];

  // ---- long run ----
  const longDay = days.includes(input.longRunDay) ? input.longRunDay : days[days.length - 1];

  if (input.isRaceWeek) {
    // Race week is the race plus shakeouts. Nothing else earns a place.
    return days.map((day) => ({
      day,
      type:   day === longDay ? ('race' as RunWorkoutType) : ('easy' as RunWorkoutType),
      isHard: day === longDay,
      isLong: day === longDay,
    }));
  }

  // ---- hard sessions ----
  const wanted = hardSessionCount(days.length, input.difficulty, input.phase);
  const types  = hardTypesFor(input.phase, input.goal, wanted);

  const chosen: DayIndex[] = [];
  const candidates = days.filter((d) => d !== longDay);

  for (let i = 0; i < types.length; i++) {
    const legal = candidates.filter((d) =>
      !chosen.includes(d) &&
      // Never the day after the long run: that day is for recovering from it.
      d !== (longDay + 1) % 7 &&
      circularGap(d, longDay) >= MIN_HARD_SPACING_DAYS &&
      chosen.every((c) => circularGap(d, c) >= MIN_HARD_SPACING_DAYS),
    );
    if (legal.length === 0) break; // the week cannot hold another one; better none than a bad one

    // Furthest from everything already placed, then the caller's ranking, then
    // earliest day so the result is deterministic.
    const scored = legal.map((d) => ({
      day:     d,
      spacing: Math.min(circularGap(d, longDay), ...chosen.map((c) => circularGap(d, c)), 7),
      rank:    input.rankHardDay ? input.rankHardDay(d) : 0,
    }));
    scored.sort((a, b) => b.spacing - a.spacing || a.rank - b.rank || a.day - b.day);
    chosen.push(scored[0].day);
  }

  const hardByDay = new Map<DayIndex, RunWorkoutType>();
  chosen.forEach((day, i) => hardByDay.set(day, types[i]));

  // ---- everything else ----
  return days.map((day) => {
    if (day === longDay) {
      return { day, type: 'long' as RunWorkoutType, isHard: false, isLong: true };
    }
    const hard = hardByDay.get(day);
    if (hard) return { day, type: hard, isHard: true, isLong: false };

    // The day after hard work, or after the long run, is a recovery run rather
    // than a plain easy one — but only when the week has enough days that the
    // distinction means anything.
    const yesterday = (day + 6) % 7;
    const followsHardWork = hardByDay.has(yesterday) || yesterday === longDay;
    const type: RunWorkoutType = followsHardWork && days.length >= 4 ? 'recovery' : 'easy';
    return { day, type, isHard: false, isLong: false };
  });
}
