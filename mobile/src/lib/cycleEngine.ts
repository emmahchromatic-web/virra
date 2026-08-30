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

const MENSTRUAL_DAYS   = 5;
const OVULATORY_WINDOW = 1;
const MS_PER_DAY       = 1000 * 60 * 60 * 24;

function toMidnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function getCycleInfo(
  periodStart: Date,
  cycleLength: number,
  today: Date = new Date(),
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
  // passed the `<= MENSTRUAL_DAYS` test and mislabelled the lot as menstrual.
  const dayOfCycle = (((elapsed % cycleLength) + cycleLength) % cycleLength) + 1;
  const ovulation  = cycleLength - 14;

  let phase: CyclePhase;
  if (dayOfCycle <= MENSTRUAL_DAYS) {
    phase = 'menstrual';
  } else if (dayOfCycle >= ovulation - OVULATORY_WINDOW && dayOfCycle <= ovulation + OVULATORY_WINDOW) {
    phase = 'ovulatory';
  } else if (dayOfCycle < ovulation - OVULATORY_WINDOW) {
    phase = 'follicular';
  } else {
    phase = 'luteal';
  }

  return {
    phase,
    dayOfCycle,
    daysUntilNextPeriod: cycleLength - dayOfCycle + 1,
    cycleLength,
  };
}

export function getCyclePhase(
  periodStart: Date,
  cycleLength: number,
  today: Date = new Date(),
): CyclePhase {
  return getCycleInfo(periodStart, cycleLength, today).phase;
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
