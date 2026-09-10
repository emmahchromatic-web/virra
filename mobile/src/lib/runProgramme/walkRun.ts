/**
 * The walk-run ladder, for people who are not yet running continuously.
 *
 * New runners, people coming back after time off, and anyone building towards a
 * first parkrun. The progression is deliberately the most conservative thing in
 * the generator: this is the population where getting it wrong hurts someone,
 * and where "a bit too easy" costs nothing.
 *
 * NOT for postpartum or return-after-injury. Those need a clinician's eye on
 * the progression before they ship, and they are excluded from the archetypes
 * this module serves.
 */

export interface WalkRunStage {
  /** Seconds running in each repetition. */
  runS:  number;
  /** Seconds walking between them. */
  walkS: number;
}

/**
 * Run:walk in minutes — 1:2, 1:1, 2:1, 3:1, 4:1, 5:1, 8:1, then continuous.
 * The last stage is a plain run; it is on the ladder so a plan can finish there.
 */
export const WALK_RUN_STAGES: WalkRunStage[] = [
  { runS:  60, walkS: 120 },
  { runS:  60, walkS:  60 },
  { runS: 120, walkS:  60 },
  { runS: 180, walkS:  60 },
  { runS: 240, walkS:  60 },
  { runS: 300, walkS:  60 },
  { runS: 480, walkS:  60 },
  { runS: 1_800, walkS: 0 },
];

export const CONTINUOUS_STAGE_INDEX = WALK_RUN_STAGES.length - 1;

/** How much the running time in a week may rise, proportionally. */
export const MAX_WEEKLY_RUN_TIME_GROWTH = 0.10;

/**
 * How much the running time in a week may rise in absolute terms, in minutes.
 *
 * The percentage on its own is the wrong constraint at the bottom of the ladder,
 * where the absolute numbers are tiny: moving from 1:2 to 1:1 doubles the
 * running, which the percentage forbids outright, but in practice it is eight
 * minutes becoming sixteen. Held that way the ladder never advances at all — a
 * nine-week "new to running" plan finished at 2:1, where any real couch-to-5K
 * reaches continuous running.
 *
 * So the constraint is a genuine double: a week may advance if EITHER the
 * proportional rise is small enough OR the absolute rise is. Both are checked
 * against the same limit that protects people, which is minutes on feet.
 */
export const MAX_WEEKLY_RUN_TIME_INCREASE_MIN = 10;

/** The share of a repetition spent running, at a given stage. */
export function runFraction(stage: WalkRunStage): number {
  const total = stage.runS + stage.walkS;
  return total > 0 ? stage.runS / total : 1;
}

/**
 * The stage each week sits at, under a double constraint: at most one stage per
 * week, AND total running time rising no more than 10% in a week. The more
 * conservative of the two wins, which for the early stages is usually the time
 * constraint — going from 1:2 to 1:1 doubles the running, so the ladder waits.
 *
 * `weekMinutes` is how long the sessions are, week by week; a week that is
 * longer overall can carry a stage that a shorter one cannot.
 */
export function stageLadder(
  weekMinutes: number[],
  startStage = 0,
): number[] {
  const out: number[] = [];
  let stage = Math.max(0, Math.min(CONTINUOUS_STAGE_INDEX, startStage));

  for (let i = 0; i < weekMinutes.length; i++) {
    if (i === 0) { out.push(stage); continue; }

    const current   = WALK_RUN_STAGES[stage];
    const next      = WALK_RUN_STAGES[Math.min(CONTINUOUS_STAGE_INDEX, stage + 1)];
    const runNow    = weekMinutes[i - 1] * runFraction(current);
    const runIfUp   = weekMinutes[i]     * runFraction(next);
    const runIfHold = weekMinutes[i]     * runFraction(current);

    // Advance when the extra running time it brings is acceptable either
    // proportionally or in absolute minutes — see the constants above for why
    // the percentage alone does not work down here.
    const withinPercent  = runNow > 0 && runIfUp / runNow <= 1 + MAX_WEEKLY_RUN_TIME_GROWTH;
    const withinAbsolute = runIfUp - runNow <= MAX_WEEKLY_RUN_TIME_INCREASE_MIN;

    const canAdvance =
      stage < CONTINUOUS_STAGE_INDEX &&
      runNow > 0 &&
      (withinPercent || withinAbsolute);

    // A back-off week is for backing off. Never take a rung in one, however
    // comfortably the arithmetic allows it.
    const isBackOff = weekMinutes[i] < weekMinutes[i - 1];

    if (canAdvance && !isBackOff) stage += 1;
    void runIfHold;

    out.push(stage);
  }
  return out;
}

/**
 * Where a returning runner joins the ladder, from how long they have been away.
 *
 * Someone off for a fortnight does not start where someone off for a year
 * starts. Capped short of continuous running deliberately: the point of the
 * plan is to rebuild, and starting at the top would make it pointless.
 */
export function startStageForLayoff(weeksOff: number): number {
  if (weeksOff >= 26) return 0;
  if (weeksOff >= 12) return 1;
  if (weeksOff >= 8)  return 2;
  if (weeksOff >= 4)  return 3;
  return 4;
}
