/**
 * The app's calendar-day key: 'YYYY-MM-DD' in the USER'S LOCAL TIME.
 *
 * This is the house rule, not a new one. `planStart.ts` already states it --
 * "Local dates throughout. `new Date().toISOString().split('T')[0]` is the UTC
 * date, which after midnight BST is yesterday; a runner choosing 'Today' must
 * get the day they are actually looking at" -- and the Phase G design doc says
 * the same: "We use the user's local date when bucketing." Training, weight and
 * cycle already follow it. The UTC one-liner kept reappearing anyway, because
 * it is the shortest way to get a date string in JS, so it is worth having one
 * obvious helper to reach for instead (card 325).
 *
 * Two distinct bugs come from `toISOString().split('T')[0]`, and it is worth
 * knowing they are different, because only the first looks like an edge case:
 *
 *  - "Today" east of UTC, between local midnight and UTC midnight -- 00:00 to
 *    00:59 nightly on BST -- resolves to YESTERDAY. A one-hour window.
 *  - A date the user PICKED is far worse. A picker hands back local midnight,
 *    which on BST is 23:00 UTC the day before, so the stored date is a day
 *    early ALL DAY, for the seven months of BST. Tap 15 July, store 14 July.
 *
 * Built from the Date's own local fields rather than `toLocaleDateString`,
 * deliberately: the locale route needs Intl/ICU data, which a Hermes build is
 * not guaranteed to carry, and a silent locale fallback here would corrupt the
 * key rather than merely misformat it.
 */

/** A calendar day as 'YYYY-MM-DD'. Local to the user, never UTC. */
export type DateISO = string;

/** `d`'s calendar date where the user is standing. */
export function toIso(d: Date): DateISO {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Today, where the user is standing. */
export function todayIso(): DateISO {
  return toIso(new Date());
}

/** Local midnight on `iso`, for comparing or formatting whole days. */
export function fromIso(iso: DateISO): Date {
  return new Date(`${iso}T00:00:00`);
}

/**
 * `iso` moved by whole calendar days. Goes through `setDate`, which steps the
 * calendar rather than adding 86400000ms, so a clock change does not shift the
 * result by a day -- a BST spring-forward day is 23 hours long.
 */
export function shiftIso(iso: DateISO, days: number): DateISO {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/**
 * Whole days from `iso` to today, both taken at local midnight, so the answer
 * is an exact integer regardless of any clock change in between.
 */
export function daysAgo(iso: DateISO, today: DateISO = todayIso()): number {
  return Math.round((fromIso(today).getTime() - fromIso(iso).getTime()) / 86400000);
}
