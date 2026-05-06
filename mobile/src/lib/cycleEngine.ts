export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

const MENSTRUAL_DAYS = 5;
const MS_PER_DAY    = 1000 * 60 * 60 * 24;

export function getCyclePhase(
  periodStart: Date,
  cycleLength: number,
  today: Date,
): CyclePhase {
  const daysElapsed = Math.floor((today.getTime() - periodStart.getTime()) / MS_PER_DAY);
  const cycleDay    = (daysElapsed % cycleLength) + 1;
  const ovulationDay = cycleLength - 14;

  if (cycleDay <= MENSTRUAL_DAYS)                                      return 'menstrual';
  if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1)   return 'ovulatory';
  if (cycleDay < ovulationDay - 1)                                     return 'follicular';
  return 'luteal';
}
