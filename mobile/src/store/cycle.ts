import { create } from 'zustand';
import { getCycleInfo, type CyclePhase, type CycleInfo } from '@/lib/cycleEngine';
import { supabase } from '@/lib/supabase';

interface CycleState {
  periodStart:  Date | null;
  cycleLength:  number;
  cycleInfo:    CycleInfo | null;
  setPeriodStart:    (date: Date, today?: Date) => void;
  setCycleLength:    (length: number, today?: Date) => void;
  refreshPhase:      (today?: Date) => void;
  loadFromSupabase:  (userId: string, today?: Date) => Promise<void>;
}

function compute(
  periodStart: Date | null,
  cycleLength: number,
  today: Date,
): CycleInfo | null {
  if (!periodStart) return null;
  return getCycleInfo(periodStart, cycleLength, today);
}

export const useCycleStore = create<CycleState>((set, get) => ({
  periodStart: null,
  cycleLength: 28,
  cycleInfo:   null,

  setPeriodStart: (date, today = new Date()) =>
    set((s) => ({
      periodStart: date,
      cycleInfo:   compute(date, s.cycleLength, today),
    })),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength: length,
      cycleInfo:   compute(s.periodStart, length, today),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      cycleInfo: compute(s.periodStart, s.cycleLength, today),
    })),

  loadFromSupabase: async (userId, today = new Date()) => {
    const { data } = await supabase
      .from('cycle_logs')
      .select('period_start, cycle_length_days')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const periodStart = new Date(data.period_start);
    const cycleLength = data.cycle_length_days ?? 28;
    set({
      periodStart,
      cycleLength,
      cycleInfo: compute(periodStart, cycleLength, today),
    });
  },
}));

// Re-export CyclePhase so consumers can import from one place
export type { CyclePhase, CycleInfo };
