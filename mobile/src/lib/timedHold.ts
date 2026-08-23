/**
 * Some prescriptions are a duration rather than a rep count: "20-40 sec",
 * "20-40s each side", "15-30 sec each side". They were rendered into the same
 * numeric reps box as everything else, with no way to time the hold, so people
 * were left counting in their head.
 *
 * These helpers recognise a duration target and expose its bounds, so the
 * logger can offer a timer instead of expecting a typed number.
 */

export interface HoldTarget {
  /** Bottom of the range, and the whole target when it is a single number. */
  lowSeconds:  number;
  /** Top of the range, where the timer stops itself. Equals low when unranged. */
  highSeconds: number;
  /** "each side" work is held twice, once per side, against the same target. */
  eachSide:    boolean;
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
 * Seconds held so far, counted up from the start and capped at the top of the
 * range. Timestamp-based for the same reason the rest timer is: iOS suspends JS
 * timers in the background, so a tick counter would stall while the user is
 * elsewhere and under-report the hold.
 */
export function heldSeconds(startedAt: number, now: number, target: HoldTarget): number {
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.min(Math.max(0, elapsed), target.highSeconds);
}

/** Whether the hold has reached the top of its range and should stop itself. */
export function holdComplete(startedAt: number, now: number, target: HoldTarget): boolean {
  return heldSeconds(startedAt, now, target) >= target.highSeconds;
}
