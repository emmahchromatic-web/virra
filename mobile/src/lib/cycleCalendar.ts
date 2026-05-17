import { getCyclePhase, type CyclePhase } from '@/lib/cycleEngine';

const MENSTRUAL_DAYS = 5;

export interface CycleCalendarDay {
  dayOfCycle: number;
  date:       Date;
  phase:      CyclePhase;
  isBleed:    boolean;
}

export function buildCycleCalendar(periodStart: Date, cycleLength: number): CycleCalendarDay[] {
  const days: CycleCalendarDay[] = [];
  for (let i = 0; i < cycleLength; i++) {
    const date = new Date(periodStart);
    date.setDate(periodStart.getDate() + i);
    const phase = getCyclePhase(periodStart, cycleLength, date);
    days.push({
      dayOfCycle: i + 1,
      date,
      phase,
      isBleed:    i < MENSTRUAL_DAYS,
    });
  }
  return days;
}
