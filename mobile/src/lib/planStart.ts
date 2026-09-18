/**
 * When a plan begins, and what the runner gets for choosing.
 *
 * Card 281. A plan used to start "now", and `generateSchedule` anchors week 1
 * to the Monday of the week containing the start date. Start on a Saturday and
 * Monday's and Wednesday's sessions were written into the past, already missed.
 * (The red BEHIND badge on a plan's first day looked related but was not: it
 * came from pro-rating the week's distance per day, and is fixed separately in
 * weekProgress.ts.)
 *
 * Emma's call was not to pick a rule but to ask: today, tomorrow, or Monday.
 * Both wants are legitimate — begin now and accept a short week, or wait and
 * get a whole one — and the app cannot know which.
 *
 * The Monday anchor stays. Six places define a week as Monday-start, and moving
 * the plan's week off Monday would put the plan's idea of "this week" out of
 * step with the tiles' and the insight's — the exact disagreement card 260 was
 * about. What changes is that sessions before the chosen start are not written
 * at all, so a short first week is short rather than retrospectively failed.
 *
 * Local dates throughout. `new Date().toISOString().split('T')[0]` is the UTC
 * date, which after midnight BST is yesterday; a runner choosing "Today" must
 * get the day they are actually looking at.
 */

export interface PlanStartOption {
  /** Local calendar date, YYYY-MM-DD. This is what gets written. */
  iso:       string;
  /** "Today", "Tomorrow", "Monday". */
  label:     string;
  /** "Sat 13 Sep", for under the label. */
  dateLabel: string;
  /** How many sessions land in week 1 if the plan starts here. */
  sessionsInFirstWeek: number;
  /** True when week 1 holds every training day. */
  fullWeek:  boolean;
}

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date as YYYY-MM-DD, never shifted by timezone. */
export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Monday of the week containing `d`, matching `mondayOf` in scheduleGenerator. */
function mondayOf(d: Date): Date {
  const dow = d.getDay();
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

/** The next Monday strictly after `d`. Today being Monday does not count. */
function nextMonday(d: Date): Date {
  const dow = d.getDay();
  return addDays(d, dow === 0 ? 1 : 8 - dow);
}

/**
 * How many of the plan's training days fall on or after the start date, within
 * week 1. Week 1 runs from the Monday of the start date's week, so days before
 * the start are the ones that would previously have been written into the past.
 */
export function sessionsInFirstWeek(start: Date, trainingDays: number[]): number {
  const monday = mondayOf(start);
  const startISO = localISO(start);
  return trainingDays.filter((day) => localISO(addDays(monday, day)) >= startISO).length;
}

/**
 * The choices offered before starting a plan.
 *
 * De-duplicated by date, because on a Sunday "Tomorrow" and "Monday" are the
 * same day, and offering one date twice under two names is not a choice. On a
 * Monday all three stay distinct: "Today" is a whole week now and "Monday" is a
 * whole week next week, which is a real choice.
 */
export function planStartOptions(now: Date, trainingDays: number[]): PlanStartOption[] {
  const candidates: Array<{ date: Date; label: string }> = [
    { date: addDays(now, 0), label: 'Today' },
    { date: addDays(now, 1), label: 'Tomorrow' },
    { date: nextMonday(now),  label: 'Monday' },
  ];

  const seen = new Set<string>();
  const out: PlanStartOption[] = [];

  for (const c of candidates) {
    const iso = localISO(c.date);
    if (seen.has(iso)) continue;
    seen.add(iso);
    const count = sessionsInFirstWeek(c.date, trainingDays);
    out.push({
      iso,
      label:     c.label,
      dateLabel: `${DAY_NAMES[c.date.getDay()]} ${c.date.getDate()} ${MONTH_NAMES[c.date.getMonth()]}`,
      sessionsInFirstWeek: count,
      fullWeek:  count === trainingDays.length && trainingDays.length > 0,
    });
  }

  return out;
}

/** "Full first week", "1 session this week", "No sessions this week". */
export function describeFirstWeek(opt: PlanStartOption): string {
  if (opt.fullWeek) return 'Full first week';
  if (opt.sessionsInFirstWeek === 0) return 'No sessions this week';
  if (opt.sessionsInFirstWeek === 1) return '1 session this week';
  return `${opt.sessionsInFirstWeek} sessions this week`;
}

/**
 * A local calendar date plus some days, as YYYY-MM-DD.
 *
 * Card 281, second pass. The plan's end date was worked out from the moment
 * Start was pressed rather than from the day the runner chose. Picking "Monday"
 * on a Tuesday left the end date six days before the plan actually finished,
 * and a block whose end date has passed drops out of getActiveBlocks: a Path to
 * parkrun plan would have disappeared from the training tab three days before
 * its parkrun. So the end date is counted from the chosen start.
 *
 * Built from local date parts so a timezone offset cannot shift the result by a
 * day.
 */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISO(new Date(y, m - 1, d + days));
}

export interface RaceStart {
  /** Local calendar date the plan starts, YYYY-MM-DD. */
  start:       string;
  /** Weeks the plan will actually have, counting race week as the last. */
  weeks:       number;
  /** True when the full length no longer fits and the plan starts today. */
  startsToday: boolean;
}

/**
 * Where a plan with a race goal starts, and how long it can be.
 *
 * Card 301. The start was counted back from the race by the template's length,
 * not the length the runner chose: Beginner 5K set to 12 weeks with a December
 * race started in October and came out 8 weeks long.
 *
 * So the runner's length is counted back, in the same Monday-start weeks the
 * schedule is written in, with race week as the last week. A start that has
 * already come round is today, and the plan gets the weeks that are left rather
 * than a full-length plan that runs on past race day.
 */
export function raceStart(race: Date, chosenWeeks: number, now: Date): RaceStart {
  const weeks      = Math.max(1, Math.round(chosenWeeks));
  const raceMonday = mondayOf(race);
  const start      = addDays(raceMonday, -(weeks - 1) * 7);
  const today      = addDays(now, 0);

  if (start.getTime() > today.getTime()) {
    return { start: localISO(start), weeks, startsToday: false };
  }
  const weeksLeft = Math.round((raceMonday.getTime() - mondayOf(today).getTime()) / (7 * 86400000)) + 1;
  return { start: localISO(today), weeks: Math.min(weeks, Math.max(1, weeksLeft)), startsToday: true };
}
