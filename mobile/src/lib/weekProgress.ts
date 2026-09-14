/**
 * Is the runner on track this week?
 *
 * The plan detail screen used to answer with
 *
 *   expectedByNow = weekKm * (dayInWeek + 1) / 7
 *
 * which charges a flat seventh of the week for every day that has started,
 * including today. On a plan's very first day, before the runner had any chance
 * to run, they owed a seventh of the week already and were told BEHIND in red.
 * The same thing happened on any day whose session had not happened yet, and on
 * rest days, because the formula did not know which days had sessions at all.
 *
 * (I told Emma card 281's fix would clear this. It did not: back-dated sessions
 * never fed into this number. The two were separate bugs.)
 *
 * The honest question is narrower: has a session the runner was meant to do
 * already gone by? A session scheduled for today has not been missed; the day
 * is not over. So expectation accrues only from sessions dated strictly before
 * today, each carrying its share of the week, and until one has passed there is
 * nothing to be behind on.
 */

export type WeekStatus = 'PLAN COMPLETE' | 'WEEK DONE' | 'ON TRACK' | 'BEHIND' | null;

/** A run counts as on track at 80% of what was due, same as before. */
export const ON_TRACK_TOLERANCE = 0.8;

export interface WeekProgressInput {
  planComplete: boolean;
  /** False when there is no current week to judge. */
  hasWeek:      boolean;
  isStrength:   boolean;
  weekKm:       number;
  actualKm:     number;
  /**
   * This plan's live sessions in the current week, as YYYY-MM-DD. Moved and
   * dropped sessions are the caller's to exclude.
   */
  sessionDates: string[];
  /** Local calendar date, YYYY-MM-DD. */
  todayISO:     string;
}

/** Sessions whose day has fully passed. Today's does not count yet. */
export function sessionsDue(sessionDates: string[], todayISO: string): number {
  return sessionDates.filter((d) => d < todayISO).length;
}

/** Kilometres the runner should have covered by now: the passed sessions' share. */
export function expectedKmByNow(weekKm: number, sessionDates: string[], todayISO: string): number {
  if (sessionDates.length === 0) return 0;
  return weekKm * (sessionsDue(sessionDates, todayISO) / sessionDates.length);
}

export function weekStatus(input: WeekProgressInput): WeekStatus {
  if (input.planComplete) return 'PLAN COMPLETE';
  if (!input.hasWeek || input.isStrength) return null;
  if (input.actualKm >= input.weekKm) return 'WEEK DONE';

  const expected = expectedKmByNow(input.weekKm, input.sessionDates, input.todayISO);
  // Nothing has been missed yet, so there is nothing to be behind on.
  if (expected <= 0) return 'ON TRACK';
  return input.actualKm >= expected * ON_TRACK_TOLERANCE ? 'ON TRACK' : 'BEHIND';
}
