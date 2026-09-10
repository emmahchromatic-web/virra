import type { Archetype, ArchetypeKey } from './archetypes';
import type { PlanFeasibility, RaceDistance } from './volumeCurve';

/**
 * Who a plan is for, and whether this runner is that person.
 *
 * Card 257. Emma opened Beginner 5K on a week where she had run 5km, and her
 * 5K had been a run-walk. Nothing on the screen told her the plan assumed she
 * could already run 5km continuously, so she had no way to know it was the
 * wrong plan for her. The generator was doing exactly what it was asked; the
 * plan simply never said who it was asking.
 *
 * Two separate jobs live here, and keeping them apart matters:
 *
 *   1. ENTRY CRITERIA are copy. Every plan states its assumptions in plain
 *      words, always, whoever is looking. This is what actually solved the
 *      reported problem: a runner who reads "you can already run 5km without
 *      walking" self-selects correctly without the app guessing anything.
 *
 *   2. SUITABILITY is measured. Where a signal genuinely exists — weekly
 *      volume, longest logged run, whether the curve reaches the race distance
 *      — it is checked and said out loud. Where one does not, nothing is
 *      inferred. We do not record whether a logged run was continuous or a
 *      run-walk, so we cannot detect Emma's own case, and this module does not
 *      pretend to. It tells her what the plan expects and lets her decide.
 *
 * Advisory throughout. Nothing here blocks anyone from starting anything.
 */

export type SuitabilityVerdict =
  /** Nothing measured says otherwise. */
  | 'suited'
  /** Startable, but the runner is below what the plan assumes. */
  | 'stretch'
  /** Far enough below that a different plan is the honest answer. */
  | 'wrong_plan';

export interface EntryCriteria {
  /** One line naming who the plan is for. Shown on the plan card. */
  whoFor: string;
  /** The assumptions spelled out, shown on the detail screen. */
  points: string[];
  /** Weekly volume the plan assumes. null when it meets you where you are. */
  assumesWeeklyKm: number | null;
  /** Longest run the plan assumes you already have. null as above. */
  assumesLongRunKm: number | null;
  /** True for plans that teach continuous running rather than assuming it. */
  teachesRunning: boolean;
}

export interface SuitabilityRunner {
  /** `user_profiles.fitness_level`. */
  fitnessLevel:        string | null;
  currentWeeklyKm:     number;
  currentLongestRunKm: number;
}

export interface Suitability {
  verdict: SuitabilityVerdict;
  /** Plain sentences saying what the measurement found. Empty when suited. */
  reasons: string[];
  /**
   * A gentler plan to offer instead. Present whenever a walk-run route is
   * genuinely adjacent, not only when the verdict is bad: someone looking at a
   * 5K plan who cannot yet run 5K needs the door to be visible.
   */
  alternative: ArchetypeKey | null;
}

/**
 * What a plan for each goal assumes about the runner arriving at it.
 *
 * Sourced from the standard progression ladder — the entry bar for a goal is
 * roughly the goal below it — rather than invented per row. They are still
 * coaching judgements of the same standing as LONG_RUN_SHARE_BY_GOAL and
 * VOLUME_PRESETS, and belong in the same review.
 *
 * REVIEW: worth a coach's eye alongside the volume constants.
 */
export const GOAL_ENTRY: Record<
  RaceDistance,
  { weeklyKm: number; longRunKm: number; inWords: string } | null
> = {
  '5k':          { weeklyKm: 10, longRunKm:  3, inWords: 'run for 20 minutes without walking' },
  '10k':         { weeklyKm: 15, longRunKm:  5, inWords: 'run 5km without walking' },
  half_marathon: { weeklyKm: 25, longRunKm: 10, inWords: 'run 10km' },
  marathon:      { weeklyKm: 40, longRunKm: 16, inWords: 'run 16km' },
  ultra:         { weeklyKm: 60, longRunKm: 30, inWords: 'finished a marathon' },
  // A general-fitness plan is built around whatever the runner already does,
  // so it has no entry bar to state.
  general:       null,
};

/** How a goal reads in a sentence. */
export const GOAL_NAME: Record<RaceDistance, string> = {
  '5k':          '5K',
  '10k':         '10K',
  half_marathon: 'half marathon',
  marathon:      'marathon',
  ultra:         'ultra',
  general:       'plan',
};

/** Below this share of what the plan assumes, say so. */
export const STRETCH_FRACTION = 0.7;

/** Below this share, it is the wrong plan rather than a hard one. */
export const WRONG_PLAN_FRACTION = 0.4;

const WALK_RUN_COPY: Partial<Record<ArchetypeKey, { whoFor: string; points: string[] }>> = {
  new_to_running: {
    whoFor: 'For anyone starting from nothing. You do not need to be able to run yet.',
    points: [
      'You can walk briskly for 30 minutes.',
      'You have never run regularly, or not for a long time.',
      'Every session starts as walking with short runs in it.',
    ],
  },
  path_to_parkrun: {
    whoFor: 'For getting to your first parkrun. Walk breaks are part of the plan.',
    points: [
      'You can walk briskly for 30 minutes.',
      'You want to finish 5K, not race it.',
      'You are not running 5K continuously yet, and do not need to be.',
    ],
  },
  return_after_break: {
    whoFor: 'For coming back after time off, with walk breaks built in from week one.',
    points: [
      'You have run before but not recently.',
      'You would rather rebuild than pick up where you left off.',
      'You are not returning from an injury that still needs a physio.',
    ],
  },
};

const NON_RACE_COPY: Partial<Record<ArchetypeKey, { whoFor: string; extraPoint?: string }>> = {
  improve_5k: {
    whoFor:     'For runners chasing a faster 5K who already race the distance.',
    extraPoint: 'You have a 5K time you want to beat.',
  },
  run_faster: {
    whoFor:     'For runners with a base already built who want speed rather than distance.',
    extraPoint: 'Your weekly volume stays where it is. The sessions get harder.',
  },
  run_further: {
    whoFor:     'For runners comfortable at their current distance who want more of it.',
  },
  maintain: {
    whoFor:     'For holding the fitness you have while life is busy.',
    extraPoint: 'Volume stays flat. Nothing here is building towards anything.',
  },
  train_your_way: {
    whoFor:     'For running with structure but no race in the diary.',
    extraPoint: 'Built around what you already run rather than a target distance.',
  },
};

/** Who a plan is for, in words a runner can check themselves against. */
export function entryCriteria(archetype: Archetype, goal: RaceDistance): EntryCriteria {
  if (archetype.progression === 'walk_run') {
    const copy = WALK_RUN_COPY[archetype.key] ?? WALK_RUN_COPY.new_to_running!;
    return {
      whoFor:           copy.whoFor,
      points:           copy.points,
      assumesWeeklyKm:  null,
      assumesLongRunKm: null,
      teachesRunning:   true,
    };
  }

  const entry = GOAL_ENTRY[goal];
  const named = NON_RACE_COPY[archetype.key];

  // A goal-led plan states the goal's bar. Everything else states its own, and
  // borrows the goal's bar underneath when it has one.
  const points: string[] = [];
  if (entry) {
    points.push(`You can already ${entry.inWords}.`);
    points.push(`You are running around ${entry.weeklyKm}km a week.`);
  }
  if (named?.extraPoint) points.push(named.extraPoint);
  if (points.length === 0) points.push('You are running already, however much or little that is.');

  return {
    whoFor: named?.whoFor
      ?? (entry
        ? `For runners who can already ${entry.inWords}.`
        : 'For runners who want structure around what they already do.'),
    points,
    assumesWeeklyKm:  entry?.weeklyKm  ?? null,
    assumesLongRunKm: entry?.longRunKm ?? null,
    teachesRunning:   false,
  };
}

/**
 * The walk-run plan to offer beside this one.
 *
 * Only where it is a sensible neighbour. Offering "New to running" to someone
 * looking at a marathon plan is not routing, it is noise: the honest gentler
 * option there is a shorter race, and we have no way to name a specific one.
 */
export function gentlerAlternative(
  goal:         RaceDistance,
  fitnessLevel: string | null,
): ArchetypeKey | null {
  if (fitnessLevel === 'returning') return 'return_after_break';
  if (goal === '5k')                return 'path_to_parkrun';
  if (goal === 'general')           return 'new_to_running';
  return null;
}

function km(n: number): string {
  return `${Math.round(n * 10) / 10}km`;
}

const RANK: Record<SuitabilityVerdict, number> = { suited: 0, stretch: 1, wrong_plan: 2 };

export interface AssessInput {
  archetype:    Archetype;
  goal:         RaceDistance;
  criteria:     EntryCriteria;
  runner:       SuitabilityRunner;
  /** From the curve this runner would actually get. Optional; skipped if absent. */
  feasibility?: PlanFeasibility | null;
}

/**
 * What the measurable signals say about this runner on this plan.
 *
 * Every reason is a fact with a number in it. Nothing is asserted that was not
 * read out of the profile, the last 90 days of activities, or the curve the
 * generator produced for this person.
 */
export function assessSuitability(input: AssessInput): Suitability {
  const { criteria, runner, goal, feasibility } = input;

  // A walk-run plan meets the runner wherever they are. There is no bar to
  // fall below, so there is nothing to warn about.
  if (criteria.teachesRunning) {
    return { verdict: 'suited', reasons: [], alternative: null };
  }

  let verdict: SuitabilityVerdict = 'suited';
  const reasons: string[] = [];
  const worsen = (v: SuitabilityVerdict) => {
    if (RANK[v] > RANK[verdict]) verdict = v;
  };

  const assumesKm = criteria.assumesWeeklyKm;
  if (assumesKm && runner.currentWeeklyKm > 0) {
    const share = runner.currentWeeklyKm / assumesKm;
    if (share < STRETCH_FRACTION) {
      worsen(share < WRONG_PLAN_FRACTION ? 'wrong_plan' : 'stretch');
      reasons.push(
        `This plan is written for someone running around ${km(assumesKm)} a week. You are running ${km(runner.currentWeeklyKm)}.`,
      );
    }
  }

  const assumesLong = criteria.assumesLongRunKm;
  if (assumesLong && runner.currentLongestRunKm > 0
      && runner.currentLongestRunKm < assumesLong * STRETCH_FRACTION) {
    worsen('stretch');
    reasons.push(
      `Your longest run in the last 90 days is ${km(runner.currentLongestRunKm)}. This plan starts from about ${km(assumesLong)}.`,
    );
  }

  // The curve is the honest test of whether the plan gets them to the start
  // line, and it already knows: it was built for this runner, not for a
  // notional one.
  if (feasibility && !feasibility.reachesTarget && feasibility.shortfallKm > 0) {
    worsen('stretch');
    reasons.push(
      `It builds your long run to ${km(feasibility.longestRunKm)}. A ${GOAL_NAME[goal]} wants around ${km(feasibility.targetLongRunKm)}, so you would arrive ${km(feasibility.shortfallKm)} short. More weeks closes that gap.`,
    );
  }

  // Coming back after a break is not on its own a reason to be steered
  // anywhere — a runner returning after a fortnight with real mileage behind
  // them is fine. It only tips a plan that is already a stretch.
  if (runner.fitnessLevel === 'returning' && verdict === 'stretch') {
    verdict = 'wrong_plan';
    reasons.push('You told us you are coming back after a break, so rebuilding with walk breaks is the safer route in.');
  }

  const alternative = gentlerAlternative(goal, runner.fitnessLevel);

  return {
    verdict,
    reasons,
    // Shown whenever it would be useful: always where a walk-run plan is the
    // adjacent one, and on a bad verdict wherever we can name anything at all.
    alternative: verdict === 'suited' && !alternative ? null : alternative,
  };
}
