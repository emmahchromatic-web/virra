import { create } from 'zustand';
import {
  getCycleInfo,
  deriveCycleMode,
  effectivePeriodDays,
  DEFAULT_PERIOD_DAYS,
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
  /**
   * Card 304. How many days of the current cycle count as menstrual: the
   * length logged for this period, else the average of recent logged periods,
   * else 5. Every phase calculation must use this, never a constant.
   */
  periodDays:        number;
  /** True when periodDays was logged for this period rather than assumed. */
  periodDaysLogged:  boolean;
  /** Logged lengths of earlier periods, newest first, for the assumed length. */
  recentPeriodDays:  number[];
  cycleInfo:         CycleInfo | null;
  cycleMode:         CycleMode;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:    boolean | null;
  currentPackStart:  Date | null;
  isLoading:         boolean;
  setCycleProfile:      (profile: CycleProfile) => void;
  /** Correct the current period's start date. Its logged length no longer applies. */
  setPeriodStart:       (date: Date, today?: Date) => void;
  /** A new period began: the finished one's logged length joins the history. */
  startNewPeriod:       (date: Date, today?: Date) => void;
  /** Record (or clear, with null) how long the current period lasted. */
  setLoggedPeriodDays:  (days: number | null, today?: Date) => void;
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
  periodDays:       number,
): CycleInfo | null {
  const mode = deriveCycleMode(profile, hasPlaceboWeek);
  if (mode === 'pack') {
    if (!currentPackStart) return null;
    // A withdrawal bleed on the pill is not a logged period; keep the default.
    return getCycleInfo(currentPackStart, cycleLength, today, DEFAULT_PERIOD_DAYS);
  }
  if (mode === 'flow') {
    if (!periodStart) return null;
    return getCycleInfo(periodStart, cycleLength, today, periodDays);
  }
  return null; // steady
}

export const useCycleStore = create<CycleState>((set, get) => ({
  cycleProfile:      'natural',
  periodStart:       null,
  cycleLength:       28,
  periodDays:        DEFAULT_PERIOD_DAYS,
  periodDaysLogged:  false,
  recentPeriodDays:  [],
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
      const cycleInfo          = computeForProfile(profile, newHasPlaceboWeek, s.periodStart, newPackStart, s.cycleLength, new Date(), s.periodDays);
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
      const cycleInfo = computeForProfile(s.cycleProfile, hasPlaceboWeek, s.periodStart, currentPackStart, s.cycleLength, new Date(), s.periodDays);
      return { contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode: mode, cycleInfo };
    }),

  setPeriodStart: (date, today = new Date()) =>
    set((s) => {
      // Cycle settings calls this on every save, date changed or not. Only a
      // moved start invalidates the logged length, which was measured from it.
      if (sameDay(date, s.periodStart)) {
        return {
          periodStart: date,
          cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today, s.periodDays),
        };
      }
      const { days, logged } = effectivePeriodDays(null, s.recentPeriodDays);
      return {
        periodStart:      date,
        periodDays:       days,
        periodDaysLogged: logged,
        cycleInfo:        computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today, days),
      };
    }),

  startNewPeriod: (date, today = new Date()) =>
    set((s) => {
      // A second tap on the same day corrects the start; it is not a new period.
      if (sameDay(date, s.periodStart)) {
        return {
          periodStart: date,
          cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today, s.periodDays),
        };
      }
      const recentPeriodDays = s.periodDaysLogged ? [s.periodDays, ...s.recentPeriodDays] : s.recentPeriodDays;
      const { days, logged } = effectivePeriodDays(null, recentPeriodDays);
      return {
        periodStart:      date,
        recentPeriodDays,
        periodDays:       days,
        periodDaysLogged: logged,
        cycleInfo:        computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today, days),
      };
    }),

  setLoggedPeriodDays: (loggedDays, today = new Date()) =>
    set((s) => {
      const { days, logged } = effectivePeriodDays(loggedDays, s.recentPeriodDays);
      return {
        periodDays:       days,
        periodDaysLogged: logged,
        cycleInfo:        computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, s.cycleLength, today, days),
      };
    }),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength: length,
      cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, length, today, s.periodDays),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      cycleInfo: computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, s.cycleLength, today, s.periodDays),
    })),

  loadFromSupabase: async (userId, today = new Date()) => {
    set({ isLoading: true });
    const [cycleRes, profileRes, lengthsRes] = await Promise.all([
      supabase
        .from('cycle_logs')
        // `created_at` is the tiebreaker, not decoration. Nothing stops two
        // rows sharing a period_start, and Emma's account had exactly that:
        // 2026-08-15 logged at 28 days, then corrected to 27 three minutes
        // later. With period_start alone to order by, which cycle length the
        // app used came down to whatever the planner returned first, so every
        // phase boundary could move between sessions.
        //
        // Newest wins, because the later row is the correction.
        .select('period_start, cycle_length_days')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .order('created_at',   { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('cycle_profile, contraception_type, has_placebo_week, current_pack_start')
        .eq('id', userId)
        .maybeSingle(),
      // Card 304. Its own query, deliberately: adding period_length_days to the
      // query above would fail the WHOLE cycle load with 42703 on a database
      // the migration has not reached. Here a failure only costs the default.
      supabase
        .from('cycle_logs')
        .select('period_start, period_length_days')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .order('created_at',   { ascending: false })
        .limit(12),
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
    const { current, recent } = splitPeriodLengths(
      lengthsRes.error ? [] : (lengthsRes.data ?? []) as PeriodLengthRow[],
      cycleRes.data?.period_start ?? null,
    );
    const { days: periodDays, logged: periodDaysLogged } = effectivePeriodDays(current, recent);
    const cycleInfo   = computeForProfile(cycleProfile, hasPlaceboWeek, periodStart, currentPackStart, cycleLength, today, periodDays);

    set({
      cycleProfile, contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode, periodStart, cycleLength,
      periodDays, periodDaysLogged, recentPeriodDays: recent, cycleInfo, isLoading: false,
    });
  },
}));

function sameDay(a: Date, b: Date | null): boolean {
  return !!b && a.toDateString() === b.toDateString();
}

interface PeriodLengthRow { period_start: string; period_length_days: number | null }

/**
 * The current period's logged length, and earlier periods' logged lengths
 * newest first. Rows arrive newest first with the correction first for a
 * repeated start date, so the first row per date is the one that counts.
 */
export function splitPeriodLengths(
  rows: PeriodLengthRow[],
  currentStart: string | null,
): { current: number | null; recent: number[] } {
  const seen = new Set<string>();
  let current: number | null = null;
  const recent: number[] = [];
  for (const r of rows) {
    if (seen.has(r.period_start)) continue;
    seen.add(r.period_start);
    if (r.period_start === currentStart) { current = r.period_length_days; continue; }
    if (r.period_length_days != null) recent.push(r.period_length_days);
  }
  return { current, recent };
}

export type { CyclePhase, CycleInfo, CycleProfile, CycleMode, ContraceptionType };
