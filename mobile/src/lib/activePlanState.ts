/**
 * Describing the plan a runner is actually on, from their own schedule.
 *
 * Card 256. The plan detail screen answered three questions about an active
 * plan by reading the wrong source for each:
 *
 *   - sessions per week came from `sessions_json[0].sessions.length`, the
 *     TEMPLATE's first week, so a generated plan showed a number that was
 *     never the runner's;
 *   - the current week was counted in sevens from `start_date`, which is a
 *     guess about what the generator wrote rather than a reading of it;
 *   - plan length came from `plan_templates.duration_weeks`, which a runner
 *     who shortened or lengthened their plan does not have.
 *
 * All three answers exist in data already written for that runner. This module
 * reads them, and lives outside the screen with its own tests because the last
 * time this screen carried untested inline arithmetic (`sessionCountBounds`)
 * half the bug shipped twice.
 */

/** The fields of a `planned_sessions` row this module needs. */
export interface ScheduledSession {
  block_id:    string | null;
  status:      string;
  week_number: number;
  day_of_week: number;
}

/** A session that still counts: not moved away, not dropped. */
export function isLiveSession(s: ScheduledSession): boolean {
  return s.status !== 'moved' && s.status !== 'dropped';
}

/** The runner's live sessions this week for one training block. */
export function sessionsForBlock(
  sessions: ScheduledSession[],
  blockId:  string | null,
): ScheduledSession[] {
  if (!blockId) return [];
  return sessions.filter((s) => s.block_id === blockId && isLiveSession(s));
}

/**
 * Which week of the plan the runner is in, zero-based.
 *
 * `week_number` is what the generator wrote into the schedule, so it wins.
 * The date arithmetic is the fallback for a week with nothing left in it —
 * every session done, moved or dropped — and it is only a fallback because
 * counting sevens from a start date is what put a runner in "week 2" of a plan
 * whose second week had not begun.
 */
export function currentWeekIndex(
  mySessions: ScheduledSession[],
  startDate:  string | null,
  now:        Date = new Date(),
): number {
  const fromSchedule = mySessions[0]?.week_number;
  if (fromSchedule != null && fromSchedule > 0) return fromSchedule - 1;
  if (!startDate) return -1;
  const started = new Date(startDate).getTime();
  if (Number.isNaN(started)) return -1;
  return Math.max(0, Math.floor((now.getTime() - started) / (7 * 86_400_000)));
}

/**
 * How many weeks the runner's plan runs for.
 *
 * `maxWeeks` is used when the schedule is generated and never stored, but the
 * goal date is, so the span is recoverable from the `user_plans` row. Returns
 * null when there is no goal date, which is an ongoing plan rather than a
 * zero-week one.
 */
export function planDurationWeeks(
  startDate: string | null | undefined,
  goalDate:  string | null | undefined,
): number | null {
  if (!startDate || !goalDate) return null;
  const start = new Date(startDate).getTime();
  const goal  = new Date(goalDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(goal)) return null;
  const weeks = Math.round((goal - start) / (7 * 86_400_000));
  return weeks > 0 ? weeks : null;
}

/**
 * The days the runner actually trains, taken from their own week.
 *
 * Adjusting a plan opens the same day picker used to choose one, and that
 * picker is seeded from the template's defaults. On a plan you are already on
 * that is wrong: it silently proposes moving your sessions to days you never
 * picked, and the only sign is that Save changes did something you did not ask
 * for. Slots beyond the days available keep whatever they came with.
 */
export function seedDaysFromSchedule<T extends { day: number }>(
  slots:      T[],
  mySessions: ScheduledSession[],
): T[] {
  const days = [...new Set(mySessions.map((s) => s.day_of_week))].sort((a, b) => a - b);
  return slots.map((slot, i) => (days[i] != null ? { ...slot, day: days[i] } : slot));
}

/**
 * Weeks left to run, for seeding the duration stepper when adjusting.
 *
 * A rebuild starts from today, so offering the plan's original total length
 * would quietly hand a runner halfway through a twelve week plan another
 * twelve weeks. What is left is the honest default; they can still lengthen it.
 */
export function remainingWeeks(
  durationWeeks: number | null,
  weekIndex:     number,
): number | null {
  if (durationWeeks == null) return null;
  return Math.max(1, durationWeeks - Math.max(0, weekIndex));
}
