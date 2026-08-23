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

export function deriveCycleMode(
  profile: CycleProfile,
  hasPlaceboWeek: boolean | null,
): CycleMode {
  if (profile === 'natural' || profile === 'irregular') return 'flow';
  if (profile === 'hormonal' && hasPlaceboWeek === true) return 'pack';
  return 'steady';
}
