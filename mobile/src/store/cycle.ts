import { create } from 'zustand';
import {
  getCycleInfo,
  deriveCycleMode,
  type CyclePhase,
  type CycleInfo,
  type CycleProfile,
  type CycleMode,
  type ContraceptionType,
} from '@/lib/cycleEngine';
import { supabase } from '@/lib/supabase';

interface CycleState {
  cycleProfile:      CycleProfile;
  periodStart:       Date | null;
  cycleLength:       number;
  cycleInfo:         CycleInfo | null;
  cycleMode:         CycleMode;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:    boolean | null;
  currentPackStart:  Date | null;
  isLoading:         boolean;
  setCycleProfile:      (profile: CycleProfile) => void;
  setPeriodStart:       (date: Date, today?: Date) => void;
  setCycleLength:       (length: number, today?: Date) => void;
  setHormonalSubData:   (patch: { contraceptionType: ContraceptionType; hasPlaceboWeek: boolean | null; currentPackStart: Date | null }) => void;
  refreshPhase:         (today?: Date) => void;
  loadFromSupabase:     (userId: string, today?: Date) => Promise<void>;
}

function computeForProfile(
  profile:          CycleProfile,
  hasPlaceboWeek:   boolean | null,
  periodStart:      Date | null,
  currentPackStart: Date | null,
  cycleLength:      number,
  today:            Date,
): CycleInfo | null {
  const mode = deriveCycleMode(profile, hasPlaceboWeek);
  if (mode === 'pack') {
    if (!currentPackStart) return null;
    return getCycleInfo(currentPackStart, cycleLength, today);
  }
  if (mode === 'flow') {
    if (!periodStart) return null;
    return getCycleInfo(periodStart, cycleLength, today);
  }
  return null; // steady
}

export const useCycleStore = create<CycleState>((set, get) => ({
  cycleProfile:      'natural',
  periodStart:       null,
  cycleLength:       28,
  cycleInfo:         null,
  cycleMode:         'flow',
  contraceptionType: null,
  hasPlaceboWeek:    null,
  currentPackStart:  null,
  isLoading:         true,

  setCycleProfile: (profile) =>
    set((s) => {
      const newHasPlaceboWeek  = profile !== 'hormonal' ? null : s.hasPlaceboWeek;
      const newContraception   = profile !== 'hormonal' ? null : s.contraceptionType;
      const newPackStart       = profile !== 'hormonal' ? null : s.currentPackStart;
      const mode               = deriveCycleMode(profile, newHasPlaceboWeek);
      const cycleInfo          = computeForProfile(profile, newHasPlaceboWeek, s.periodStart, newPackStart, s.cycleLength, new Date());
      return {
        cycleProfile:      profile,
        cycleMode:         mode,
        cycleInfo,
        contraceptionType: newContraception,
        hasPlaceboWeek:    newHasPlaceboWeek,
        currentPackStart:  newPackStart,
      };
    }),

  setHormonalSubData: ({ contraceptionType, hasPlaceboWeek, currentPackStart }) =>
    set((s) => {
      if (s.cycleProfile !== 'hormonal') return {};
      const mode      = deriveCycleMode(s.cycleProfile, hasPlaceboWeek);
      const cycleInfo = computeForProfile(s.cycleProfile, hasPlaceboWeek, s.periodStart, currentPackStart, s.cycleLength, new Date());
      return { contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode: mode, cycleInfo };
    }),

  setPeriodStart: (date, today = new Date()) =>
    set((s) => ({
      periodStart: date,
      cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today),
    })),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength: length,
      cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, length, today),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      cycleInfo: computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, s.cycleLength, today),
    })),

  loadFromSupabase: async (userId, today = new Date()) => {
    set({ isLoading: true });
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
        .select('cycle_profile, contraception_type, has_placebo_week, current_pack_start')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const cycleProfile      = (profileRes.data?.cycle_profile      as CycleProfile      | undefined) ?? 'natural';
    const contraceptionType = (profileRes.data?.contraception_type as ContraceptionType | undefined) ?? null;
    const hasPlaceboWeek    = profileRes.data?.has_placebo_week    ?? null;
    const currentPackStart  = profileRes.data?.current_pack_start
      ? new Date(profileRes.data.current_pack_start)
      : null;

    const cycleMode   = deriveCycleMode(cycleProfile, hasPlaceboWeek);
    const periodStart = cycleRes.data ? new Date(cycleRes.data.period_start) : null;
    const cycleLength = cycleRes.data?.cycle_length_days ?? 28;
    const cycleInfo   = computeForProfile(cycleProfile, hasPlaceboWeek, periodStart, currentPackStart, cycleLength, today);

    set({ cycleProfile, contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode, periodStart, cycleLength, cycleInfo, isLoading: false });
  },
}));

export type { CyclePhase, CycleInfo, CycleProfile, CycleMode, ContraceptionType };
