import type { CyclePhase } from '@/lib/cycleEngine';

/**
 * Core and explosive work set aside on the days it is least welcome, and put
 * back with one tap.
 *
 * Emma's rule, 2026-09-10: hide these on the heaviest and most uncomfortable
 * days, but let the user see them and reactivate them, "as every woman is
 * different". So nothing is removed from the session and nothing is silently
 * swapped. The movement stays in the workout, moved to the bottom with a reason
 * attached, and one tap brings it back.
 *
 * That distinction matters more than it looks. A plan that quietly drops
 * exercises teaches the user that the app is unreliable; a plan that explains
 * what it set aside and why is giving her information she can overrule.
 */

/** Check-in fields this rule reads. Null when today has not been logged. */
export interface SetAsideCheckin {
  energy:   number;          // 1-5
  symptoms: string[];        // free list, see SYMPTOMS in checkin.tsx
}

/**
 * Symptoms that make loaded trunk flexion or jumping genuinely unpleasant,
 * rather than every symptom on the check-in. Low mood and insomnia are real and
 * are not reasons to pull a plank.
 */
const UNCOMFORTABLE = ['cramps', 'back pain', 'bloating'];

/** Energy at or below this reads as one of the bad days. 1-5 scale, 3 default. */
const LOW_ENERGY = 2;

/**
 * The heaviest days, and the fallback when a user has logged no check-in at all.
 *
 * Three, not the full 5-day menstrual phase: Emma asked for the heaviest days,
 * not the whole bleed. Roughly 90% of total menstrual blood loss falls in the
 * first three days, day 2 is usually the single heaviest, and cramping peaks in
 * the first 24 to 48 hours and mostly settles by day 2 or 3. So flow and pain
 * peak together and one window covers both.
 *
 * It was 2 on the first pass, which is also defensible. Three wins on the
 * asymmetry of the two mistakes rather than on the physiology: setting aside a
 * plank someone could have done costs them one tap on ADD BACK, while failing
 * to set aside a box jump on a day someone is doubled over costs them the
 * session. The cheap error is hiding too much.
 *
 * The counterweight is real and worth watching in UAT: hide too often and
 * people stop reading the reason and start ignoring the feature.
 *
 * How narrow this is matters. It applies ONLY when nothing has been logged. A
 * symptom or low energy overrides it on any menstrual day, in both directions,
 * so a woman who is rough on day 4 is already covered and one who is fine on
 * day 1 adds everything straight back.
 */
const HEAVIEST_DAYS = 3;

/**
 * Core-LED, not merely core-involving.
 *
 * 'core' appears in primaryMuscles on Goblet Squat, Back Squat, Front Squat,
 * Pull-up, Farmer's Carry and Sled Push, where it is a stabiliser rather than
 * the point of the movement. Setting all of those aside would empty the session
 * and would not be what anyone meant by "core work". Only the exercises that
 * lead with core qualify, which is Plank and Turkish Get-up in today's library.
 */
export function isCoreLed(primaryMuscles: readonly string[] | undefined): boolean {
  return (primaryMuscles?.[0] ?? '').toLowerCase() === 'core';
}

/**
 * The library documents 'explosive' as the tempo for power lifts, so this reads
 * the author's own classification rather than guessing from the name. Catches
 * Power Clean, Hang Clean, Kettlebell Swing and Box Jump.
 */
export function isExplosive(tempo: string | null | undefined): boolean {
  return (tempo ?? '').trim().toLowerCase() === 'explosive';
}

export function isSetAsideCandidate(
  primaryMuscles: readonly string[] | undefined,
  tempo:          string | null | undefined,
): boolean {
  return isCoreLed(primaryMuscles) || isExplosive(tempo);
}

/**
 * Why today is one of the days, or null if it is not.
 *
 * The string is shown to the user, so it says which signal fired. "We set these
 * aside" with no reason is the kind of silent decision that makes people
 * distrust the plan.
 */
export function setAsideReason(
  phase:      CyclePhase | null,
  dayOfCycle: number | null,
  checkin:    SetAsideCheckin | null,
): string | null {
  if (phase !== 'menstrual') return null;

  const reported = (checkin?.symptoms ?? [])
    .map((s) => s.toLowerCase())
    .filter((s) => UNCOMFORTABLE.includes(s));

  if (reported.length) {
    // Name what she told us, so the app is visibly listening rather than
    // guessing from the calendar.
    const list = reported.length === 1
      ? reported[0]
      : `${reported.slice(0, -1).join(', ')} and ${reported[reported.length - 1]}`;
    return `You logged ${list} today.`;
  }

  if (checkin && checkin.energy <= LOW_ENERGY) {
    return 'You logged low energy today.';
  }

  if (dayOfCycle !== null && dayOfCycle <= HEAVIEST_DAYS) {
    return 'These are usually the heaviest days.';
  }

  return null;
}
