// Rest-period timer state.
//
// Deliberately timestamp-based rather than tick-based: iOS suspends JS timers
// while the app is backgrounded, so a decrementing counter would drift or stall
// whenever the user switches away mid-set. Storing the moment the rest is due
// to end means every render recomputes the truth, and flicking back to the app
// shows the time that is actually left.

export interface RestState {
  exerciseId:   string;
  exerciseName: string;
  totalSeconds: number;
  /** Epoch ms at which the rest period is over. */
  endsAt:       number;
}

/**
 * Begin a rest period. Returns null when the exercise has no authored rest
 * (all mobility and activation work), so callers can treat "no rest" and
 * "timer dismissed" the same way.
 */
export function startRest(
  exerciseId:   string,
  exerciseName: string,
  seconds:      number,
  now:          number,
): RestState | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return { exerciseId, exerciseName, totalSeconds: seconds, endsAt: now + seconds * 1000 };
}

/** Restart the same rest period from full duration. */
export function restartRest(rest: RestState, now: number): RestState {
  return { ...rest, endsAt: now + rest.totalSeconds * 1000 };
}

/** Whole seconds left, never negative. Rounds up so a fresh 90s rest reads 1:30, not 1:29. */
export function restRemainingSeconds(rest: RestState | null, now: number): number {
  if (!rest) return 0;
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
}

/** 0 to 1, how far through the rest we are. Used for the progress fill. */
export function restProgress(rest: RestState | null, now: number): number {
  if (!rest || rest.totalSeconds <= 0) return 0;
  const elapsed = (now - (rest.endsAt - rest.totalSeconds * 1000)) / 1000;
  return Math.min(1, Math.max(0, elapsed / rest.totalSeconds));
}

/**
 * Whether the chime should sound for a rest that has just hit zero.
 *
 * `activeSince` is the moment the app last came to the foreground. If the rest
 * was due to end before that, it ran out while the user was in another app and
 * must not sound: they asked for the timer to keep running in the background
 * but to stay silent unless they are actually looking at it.
 */
export function shouldChime(rest: RestState, activeSince: number): boolean {
  return rest.endsAt >= activeSince;
}

/** m:ss */
export function formatRest(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
