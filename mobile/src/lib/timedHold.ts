/**
 * Some prescriptions are a duration rather than a rep count: "20-40 sec",
 * "20-40s each side", "15-30 sec each side". They were rendered into the same
 * numeric reps box as everything else, with no way to time the hold, so people
 * were left counting in their head.
 *
 * These helpers recognise a duration target and expose its bounds, so the
 * logger can offer a timer instead of expecting a typed number.
 */

/** How a prescription is measured. Authored on the exercise; read from the text as a fallback. */
export type PrescriptionUnit = 'reps' | 'seconds';

export interface HoldTarget {
  /** Bottom of the range, and the whole target when it is a single number. */
  lowSeconds:  number;
  /** Top of the range. Equals low when unranged. Shown, never enforced. */
  highSeconds: number;
  /** "each side" work is held twice, once per side, against the same target. */
  eachSide:    boolean;
}

/**
 * The seconds one logged set is worth. "Each side" is held twice, so the set is
 * the pair: recording one side would report half the work and make the next
 * session look like a regression.
 */
export function targetSecondsFor(target: HoldTarget): number {
  return target.eachSide ? target.lowSeconds * 2 : target.lowSeconds;
}

/**
 * The hold target for a prescription, preferring the authored unit and falling
 * back to reading the text.
 *
 * Sessions scheduled before the unit was authored carry none, so the text still
 * has to answer for them. An authored 'reps' wins over the text: a rep
 * prescription that happens to mention a duration ("8-10, 3s down") is a rep
 * count, and only the author knows that.
 */
export function holdTargetFor(
  unit: PrescriptionUnit | null | undefined,
  reps: string | null | undefined,
): HoldTarget | null {
  if (unit === 'reps') return null;
  const parsed = parseHoldTarget(reps);
  if (parsed) return parsed;
  // Authored as a hold with nothing numeric to read ("max hold"): still timed,
  // with no target to aim at.
  return unit === 'seconds' ? { lowSeconds: 0, highSeconds: 0, eachSide: false } : null;
}

const DURATION = /(\d+)\s*(?:-\s*(\d+))?\s*(s|secs?|seconds?|mins?|minutes?)\b/i;

/**
 * Read a duration target out of an authored reps string, or null when the
 * prescription is a plain rep count. Minutes are converted to seconds so
 * callers only ever deal in one unit.
 */
export function parseHoldTarget(reps: string | null | undefined): HoldTarget | null {
  if (!reps) return null;
  // The sheet uses en-dashes in places; treat them as ordinary hyphens.
  const text = reps.replace(/–/g, '-');
  const m = DURATION.exec(text);
  if (!m) return null;

  const isMinutes = /^min/i.test(m[3]);
  const scale     = isMinutes ? 60 : 1;
  const low       = parseInt(m[1], 10) * scale;
  const high      = m[2] ? parseInt(m[2], 10) * scale : low;
  if (!Number.isFinite(low) || low <= 0) return null;

  return {
    lowSeconds:  Math.min(low, high),
    highSeconds: Math.max(low, high),
    eachSide:    /each side/i.test(text),
  };
}

/** True when this prescription should be timed rather than counted. */
export function isTimedHold(reps: string | null | undefined): boolean {
  return parseHoldTarget(reps) !== null;
}

/** m:ss, matching the rest timer's clock. */
export function formatHold(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Seconds held so far, counted up from the start.
 *
 * NOT capped at the top of the range any more. The timer used to stop itself
 * there, so someone who beat the prescription could not record it and every
 * good day was filed as par — which is the opposite of what a progression log
 * is for.
 *
 * Timestamp-based for the same reason the rest timer is: iOS suspends JS timers
 * in the background, so a tick counter would stall while the user is elsewhere
 * and under-report the hold.
 */
export function heldSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** Whether the hold has reached the top of its range. Shown, not enforced. */
export function holdComplete(seconds: number, target: HoldTarget): boolean {
  return target.highSeconds > 0 && seconds >= target.highSeconds;
}
