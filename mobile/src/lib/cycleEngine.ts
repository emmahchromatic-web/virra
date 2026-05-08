export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
export type CycleProfile = 'natural' | 'hormonal' | 'irregular' | 'perimenopause' | 'menopause';

export interface CycleInfo {
  phase:               CyclePhase;
  dayOfCycle:          number;
  daysUntilNextPeriod: number;
  cycleLength:         number;
}

const MENSTRUAL_DAYS    = 5;
const OVULATORY_WINDOW  = 1; // ± days around ovulation day
const MS_PER_DAY        = 1000 * 60 * 60 * 24;

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
  const elapsed    = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  const dayOfCycle = (elapsed % cycleLength) + 1;
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
