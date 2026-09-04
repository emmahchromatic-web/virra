// Card 222, twice over.
//
// The sessions-per-week stepper on plan detail was originally capped at a
// hardcoded 5, so a 2-day strength programme could be stretched to three. The
// August fix capped the maximum at the plan's authored count and left the
// minimum at a hardcoded 1, so it could still be squashed to one.
//
// Both directions break the same thing. `computeDefaultDayAssignment` picks
// labels with `unique[i % unique.length]` and the week is truncated with
// `sessions.slice(0, n)`, so asking for MORE than the authored count repeats a
// day (lower/upper/lower) and asking for FEWER keeps only the first labels
// (lower, forever). Get Strong's block progression assumes each authored day
// appears exactly once a week, so neither is a resized programme -- each is a
// different, worse one.
//
// Extracted here because the bounds lived inline in the screen, had no test,
// and that is precisely how the second half of this bug shipped.

export interface SessionCountBounds {
  min: number;
  max: number;
}

/** Fallback ceiling for generated (run) plans, whose volume genuinely is adjustable. */
export const GENERATED_PLAN_MAX_SESSIONS = 5;

/**
 * Distinct session labels a plan authors, counted exactly the way
 * `computeDefaultDayAssignment` counts them.
 */
export function authoredSessionCount(weeks: { sessions?: string[] }[] | null | undefined): number {
  const seen = new Set<string>();
  for (const w of weeks ?? []) for (const l of w.sessions ?? []) seen.add(l);
  return seen.size;
}

/**
 * Bounds for the sessions-per-week stepper.
 *
 * A programme-backed strength plan is fixed at its authored count: the number
 * is a property of the programme, not a preference, so both ends are the same
 * and the stepper does not move. Generated run plans keep a real range.
 */
export function sessionCountBounds(isStrength: boolean, authored: number): SessionCountBounds {
  if (isStrength && authored > 0) return { min: authored, max: authored };
  return { min: 1, max: GENERATED_PLAN_MAX_SESSIONS };
}
