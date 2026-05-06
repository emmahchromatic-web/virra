import { create } from 'zustand';
import { getCyclePhase, type CyclePhase } from '@/lib/cycleEngine';

interface CycleState {
  periodStart:  Date | null;
  cycleLength:  number;
  currentPhase: CyclePhase | null;
  setPeriodStart: (date: Date, today?: Date) => void;
  setCycleLength: (length: number, today?: Date) => void;
  refreshPhase:   (today?: Date) => void;
}

function computePhase(
  periodStart: Date | null,
  cycleLength: number,
  today: Date,
): CyclePhase | null {
  if (!periodStart) return null;
  return getCyclePhase(periodStart, cycleLength, today);
}

export const useCycleStore = create<CycleState>((set, get) => ({
  periodStart:  null,
  cycleLength:  28,
  currentPhase: null,

  setPeriodStart: (date, today = new Date()) =>
    set((s) => ({
      periodStart:  date,
      currentPhase: computePhase(date, s.cycleLength, today),
    })),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength:  length,
      currentPhase: computePhase(s.periodStart, length, today),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      currentPhase: computePhase(s.periodStart, s.cycleLength, today),
    })),
}));
