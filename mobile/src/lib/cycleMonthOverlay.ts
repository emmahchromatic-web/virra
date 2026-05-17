import { getCyclePhase, type CyclePhase } from '@/lib/cycleEngine';

const MENSTRUAL_DAYS = 5;
const MS_PER_DAY     = 1000 * 60 * 60 * 24;

export interface CycleDayOverlay {
  phase:      CyclePhase;
  dayOfCycle: number;
  isBleed:    boolean;
}

function toMidnight(d: Date): Date {
  const o = new Date(d);
  o.setHours(0, 0, 0, 0);
  return o;
}

export function getCycleDayOverlay(
  periodStart: Date,
  cycleLength: number,
  date: Date,
): CycleDayOverlay {
  const start   = toMidnight(periodStart);
  const now     = toMidnight(date);
  const elapsed = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);

  // Normalize to [0, cycleLength) so dates before periodStart map to the
  // tail end of the previous cycle, and dates beyond one cycle wrap forward.
  const dayIndex   = ((elapsed % cycleLength) + cycleLength) % cycleLength;
  const dayOfCycle = dayIndex + 1;

  // Reuse getCyclePhase by synthesising a date inside the first cycle that
  // corresponds to dayOfCycle. This keeps the phase boundaries identical to
  // the rest of the app.
  const synth = new Date(start);
  synth.setDate(start.getDate() + dayIndex);
  const phase = getCyclePhase(periodStart, cycleLength, synth);

  return {
    phase,
    dayOfCycle,
    isBleed: dayIndex < MENSTRUAL_DAYS,
  };
}
