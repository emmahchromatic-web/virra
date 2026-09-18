export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export type CycleProfile =
  | 'natural' | 'hormonal' | 'irregular'
  | 'perimenopause' | 'menopause'
  | 'pregnant_postpartum' | 'prefer_not_to_say';

export type CycleMode = 'flow' | 'pack' | 'steady';

export type ContraceptionType =
  | 'combined_pill' | 'ring' | 'patch'
  | 'mini_pill' | 'hormonal_iud' | 'implant'
  | 'injection' | 'other';

export interface CycleInfo {
  phase:               CyclePhase;
  dayOfCycle:          number;
  daysUntilNextPeriod: number;
  cycleLength:         number;
}

/**
 * The period length assumed when the user has never logged one ending. Card 304:
 * this used to be the ONLY length, so a 3-day period still read as menstrual on
 * days 4 and 5.
 */
export const DEFAULT_PERIOD_DAYS = 5;
/** Shortest and longest period the app will record. Card 304. */
export const MIN_PERIOD_DAYS     = 1;
export const MAX_PERIOD_DAYS     = 10;
const OVULATORY_WINDOW = 1;
const MS_PER_DAY       = 1000 * 60 * 60 * 24;

function toMidnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * `periodDays` is required, not defaulted, on purpose. A default would let any
 * caller that forgot it keep the old 5 days and look correct in every test of
 * the engine; required, the compiler names each one. See card 304 and the
 * useCycleStore `periodDays` field for where the value comes from.
 */
export function getCycleInfo(
  periodStart: Date,
  cycleLength: number,
  today: Date,
  periodDays: number,
): CycleInfo {
  const start      = toMidnight(periodStart);
  const now        = toMidnight(today);
  // Round, not floor: both ends are local midnights, so a clock change between
  // them leaves the difference an hour short of a whole number of days and
  // flooring would report the cycle a day behind for the week after the clocks
  // go forward.
  const elapsed    = Math.round((now.getTime() - start.getTime()) / MS_PER_DAY);
  // Dates before the period start are extrapolated backwards into earlier
  // cycles, the mirror of how future dates are projected forwards. A plain
  // `elapsed % cycleLength` cannot do this: JavaScript's remainder keeps the
  // sign of the dividend, so -10 % 28 is -10, not 18. That produced a
  // dayOfCycle of zero or below for every back-dated reading, which then
  // passed the `<= periodDays` test and mislabelled the lot as menstrual.
  const dayOfCycle = (((elapsed % cycleLength) + cycleLength) % cycleLength) + 1;

  return {
    phase: phaseForCycleDay(dayOfCycle, cycleLength, periodDays),
    dayOfCycle,
    daysUntilNextPeriod: cycleLength - dayOfCycle + 1,
    cycleLength,
  };
}

/**
 * The phase boundaries, in one place. The weight chart used to carry its own
 * copy with a hardcoded 5, which no search for callers of getCycleInfo finds.
 *
 * Only the menstrual/follicular boundary depends on the period. Ovulation is
 * placed 14 days before the next period, so it moves with cycle length and not
 * with how long the bleed lasted.
 */
export function phaseForCycleDay(dayOfCycle: number, cycleLength: number, periodDays: number): CyclePhase {
  const ovulation = cycleLength - 14;
  if (dayOfCycle <= periodDays) return 'menstrual';
  if (dayOfCycle >= ovulation - OVULATORY_WINDOW && dayOfCycle <= ovulation + OVULATORY_WINDOW) return 'ovulatory';
  if (dayOfCycle < ovulation - OVULATORY_WINDOW) return 'follicular';
  return 'luteal';
}

export function getCyclePhase(
  periodStart: Date,
  cycleLength: number,
  today: Date,
  periodDays: number,
): CyclePhase {
  return getCycleInfo(periodStart, cycleLength, today, periodDays).phase;
}

/** Keep a period length inside what the app records. */
export function clampPeriodDays(days: number): number {
  return Math.min(MAX_PERIOD_DAYS, Math.max(MIN_PERIOD_DAYS, Math.round(days)));
}

/**
 * The length to assume for the current period. Card 304.
 *
 * The period's own logged length wins. Without one, the rounded average of the
 * last three periods that were logged, because most people's periods are
 * similar month to month. With no history at all, 5 days.
 *
 * `history` is newest first and may include the current period.
 */
export function effectivePeriodDays(
  current: number | null | undefined,
  history: ReadonlyArray<number | null | undefined>,
): { days: number; logged: boolean } {
  if (current != null) return { days: clampPeriodDays(current), logged: true };
  const recent = history.filter((d): d is number => d != null).slice(0, 3);
  if (!recent.length) return { days: DEFAULT_PERIOD_DAYS, logged: false };
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { days: clampPeriodDays(mean), logged: false };
}

/**
 * Does this profile describe someone who still has a cycle we can track?
 *
 * Card 238. Perimenopause used to fall through to `steady` alongside menopause,
 * postpartum and prefer-not-to-say, so a woman whose cycles are *changing* was
 * modelled as having none at all: no phase modulation, the no-cycle weight
 * chart, and copy identical to menopause. Perimenopause means irregular
 * periods, not absent ones, and the hormonal swings driving energy and appetite
 * are often wider than in a regular cycle rather than narrower.
 *
 * This predicate exists because the natural/irregular pair was hardcoded in
 * eleven separate places -- the dashboard, profile, weight chart, weight
 * baseline dispatcher, cycle detail, and the date pickers on both cycle
 * screens. Adding perimenopause to `deriveCycleMode` alone would have moved the
 * nutrition targets and left every one of those surfaces still treating her as
 * non-cycling, which is the half of Emma's report about reaching weight data.
 *
 * Anything that asks "is this a cycle user" must call this rather than
 * comparing profiles itself.
 */
export function tracksCycle(profile: CycleProfile | null | undefined): boolean {
  return profile === 'natural' || profile === 'irregular' || profile === 'perimenopause';
}

export function deriveCycleMode(
  profile: CycleProfile,
  hasPlaceboWeek: boolean | null,
): CycleMode {
  if (tracksCycle(profile)) return 'flow';
  if (profile === 'hormonal' && hasPlaceboWeek === true) return 'pack';
  return 'steady';
}
