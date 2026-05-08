import { create } from 'zustand';
import { getCycleInfo, type CyclePhase, type CycleInfo, type CycleProfile } from '@/lib/cycleEngine';
import { supabase } from '@/lib/supabase';

interface CycleState {
  cycleProfile: CycleProfile;
  periodStart:  Date | null;
  cycleLength:  number;
  cycleInfo:    CycleInfo | null;
  setCycleProfile:   (profile: CycleProfile) => void;
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
  cycleProfile: 'natural',
  periodStart:  null,
  cycleLength:  28,
  cycleInfo:    null,

  setCycleProfile: (profile) =>
    set((s) => ({
      cycleProfile: profile,
      cycleInfo: (profile === 'natural' || profile === 'irregular') ? s.cycleInfo : null,
    })),

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
    const [cycleRes, profileRes] = await Promise.all([
      supabase
        .from('cycle_logs')
        .select('period_start, cycle_length_days')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('cycle_profile')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const cycleProfile = (profileRes.data?.cycle_profile as CycleProfile | undefined) ?? 'natural';

    if (!cycleRes.data) {
      set({ cycleProfile });
      return;
    }

    const periodStart = new Date(cycleRes.data.period_start);
    const cycleLength = cycleRes.data.cycle_length_days ?? 28;
    set({
      cycleProfile,
      periodStart,
      cycleLength,
      cycleInfo: compute(periodStart, cycleLength, today),
    });
  },
}));

// Re-export types so consumers can import from one place
export type { CyclePhase, CycleInfo, CycleProfile };
