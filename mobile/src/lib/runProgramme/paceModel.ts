import type { PaceBand } from '@/lib/workoutStructure';

/**
 * Every pace the app prescribes, derived from one performance the runner gives us.
 *
 * The model has two halves. Riegel converts a known result to an equivalent at
 * any other distance. Threshold pace — the pace a runner can hold for about an
 * hour — is the anchor everything else is expressed against.
 *
 * Card 228: the app used to multiply the runner's *5K pace* by band factors that
 * only make sense against *threshold* pace. Threshold is roughly 5% slower than
 * 5K pace, so every band inherited that error and the fast end compounded it. A
 * 25:00 5K runner was sent out to run 800m reps at 4:09/km — around their 1500m
 * pace — and their "easy" runs at 5:45/km sat close to threshold, which meant
 * the plan contained no genuinely easy running at all.
 */

/**
 * Riegel's exponent. 1.06 is the classic value and holds well from about 1500m
 * to the marathon for trained runners. It flatters no one at the extremes:
 * beyond the marathon it over-predicts, and the generator should not lean on it
 * for ultra distances without a correction.
 */
export const RIEGEL_EXPONENT = 1.06;

/** An hour, in seconds. The definition of threshold used here. */
const THRESHOLD_DURATION_S = 3600;

/**
 * Riegel: the time a runner who covered `refDistanceM` in `refTimeS` would be
 * expected to take over `targetDistanceM`.
 *
 *   T2 = T1 × (D2 / D1) ^ 1.06
 *
 * Returns null rather than NaN for unusable input — these numbers come from
 * things people typed.
 */
export function riegelPredict(
  refDistanceM:    number,
  refTimeS:        number,
  targetDistanceM: number,
): number | null {
  if (!(refDistanceM > 0) || !(refTimeS > 0) || !(targetDistanceM > 0)) return null;
  return refTimeS * Math.pow(targetDistanceM / refDistanceM, RIEGEL_EXPONENT);
}

/**
 * Threshold pace (s/km) implied by a reference performance.
 *
 * Solves Riegel for the distance the runner would cover in exactly an hour,
 * then reads the pace off it. Inverting the exponent is the whole trick:
 *
 *   D_thr = D_ref × (3600 / T_ref) ^ (1 / 1.06)
 *
 * A 25:00 5K gives 11.42 km in the hour, i.e. 5:15/km.
 */
export function thresholdPaceFromReference(
  refDistanceM: number,
  refTimeS:     number,
): number | null {
  if (!(refDistanceM > 0) || !(refTimeS > 0)) return null;
  const thresholdDistanceM =
    refDistanceM * Math.pow(THRESHOLD_DURATION_S / refTimeS, 1 / RIEGEL_EXPONENT);
  if (!(thresholdDistanceM > 0)) return null;
  return Math.round(THRESHOLD_DURATION_S / (thresholdDistanceM / 1000));
}

/**
 * Convenience for the one reference the app actually collects. Onboarding asks
 * for a 5K time and stores it as a pace, so this is the conversion the profile
 * write and the re-anchor migration both go through — keep them in step.
 */
export function thresholdPaceFromFiveKPace(fiveKPaceSecsPerKm: number): number | null {
  if (!(fiveKPaceSecsPerKm > 0)) return null;
  return thresholdPaceFromReference(5000, fiveKPaceSecsPerKm * 5);
}

/**
 * Every band as a ratio of threshold pace. Larger than 1 is slower.
 *
 * Only the six bands the workout structures currently use. The wider ladder the
 * generator will want — marathon pace, CV, rep — arrives with the parameterised
 * session shapes, not here.
 */
export const BAND_RATIOS: Record<PaceBand, number> = {
  recovery:  1.30,
  easy:      1.20,
  steady:    1.12,
  tempo:     1.02,
  threshold: 1.00,
  vo2:       0.94,
};

/** Pace (s/km) for a band, given the runner's threshold pace. */
export function paceForBand(thresholdSecsPerKm: number, band: PaceBand): number {
  return Math.round(thresholdSecsPerKm * BAND_RATIOS[band]);
}

/**
 * Predicted race pace (s/km) at a goal distance, from a reference performance.
 *
 * This is a *prediction*, and a stated goal outranks it: `getGoalPace` already
 * treats `user_events.target_finish_time` as its highest-priority source, and
 * that precedence should survive the generator.
 */
export function goalRacePace(
  refDistanceM:  number,
  refTimeS:      number,
  goalDistanceM: number,
): number | null {
  const predicted = riegelPredict(refDistanceM, refTimeS, goalDistanceM);
  if (predicted == null) return null;
  return Math.round(predicted / (goalDistanceM / 1000));
}
