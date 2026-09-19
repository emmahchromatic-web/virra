import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
import { asyncStorageAdapter } from './persistAdapter';

const STORE_NAME = 'virra:cycle:v1';

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
  // Timestamp of the last successful `loadFromSupabase()`. `null` until one
  // succeeds. Stamped only on success, mirroring the profile store's
  // `fetchedAt`, so a failed/offline load never claims freshness it doesn't
  // have.
  fetchedAt:         string | null;
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
  /**
   * Drop every cached field back to its initial value. Called from the auth
   * store's `signOut()`: clearing STORAGE is not clearing the app -- persisted
   * stores keep their contents in memory and nothing reloads between sign-out
   * and the next sign-in, so without this the next account on the device sees
   * the previous user's cycle phase. Same shape and the same reason as
   * `sessionStore`'s `clearCache()`; see auth.ts for the ordering rationale.
   */
  clear:                () => void;
}

/** Initial values for every non-function field, shared by the store's own
 *  definition and by `clear()` so the two can't drift apart. */
const INITIAL_CYCLE_DATA = {
  cycleProfile:      'natural' as CycleProfile,
  periodStart:       null as Date | null,
  cycleLength:       28,
  periodDays:        DEFAULT_PERIOD_DAYS,
  periodDaysLogged:  false,
  recentPeriodDays:  [] as number[],
  cycleInfo:         null as CycleInfo | null,
  cycleMode:         'flow' as CycleMode,
  contraceptionType: null as ContraceptionType | null,
  hasPlaceboWeek:    null as boolean | null,
  currentPackStart:  null as Date | null,
  isLoading:         true,
  fetchedAt:         null as string | null,
};

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

/**
 * Raw fields persisted to AsyncStorage. `periodStart`/`currentPackStart` are
 * carried as ISO strings (or `null`) -- `Date` objects don't survive a JSON
 * round trip on their own, so `partialize` converts them going in and
 * `merge` converts them back going out.
 *
 * `cycleInfo` is deliberately absent: it's derived from these fields plus
 * "today", and a phase computed at last night's cold start is wrong by the
 * time the app is opened again. `isLoading` is a runtime "fetch in flight"
 * flag, not data, and must not be replayed as `true` from a stale cache
 * before a real `loadFromSupabase()` has run this session.
 */
interface PersistedCycleState {
  cycleProfile:      CycleProfile;
  periodStart:       string | null;
  cycleLength:       number;
  periodDays:        number;
  periodDaysLogged:  boolean;
  recentPeriodDays:  number[];
  cycleMode:         CycleMode;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:    boolean | null;
  currentPackStart:  string | null;
  fetchedAt:         string | null;
}

export const useCycleStore = create<CycleState>()(
  persist(
    (set, get) => ({
  ...INITIAL_CYCLE_DATA,

  clear: () => set({ ...INITIAL_CYCLE_DATA }),

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
    // Failure-safe: a failed Supabase call must leave all existing state
    // (including `fetchedAt` and every raw field) exactly as it was -- this is
    // what makes cached, cold-started data survive an offline
    // `loadFromSupabase()` call instead of being silently wiped. Only a
    // genuinely successful read reaches the final `set()`. `isLoading` is
    // still reset on failure so the UI doesn't get stuck showing a spinner
    // forever.
    //
    // BOTH failure modes are handled, and the one that actually happens
    // offline is the second: PostgREST does NOT reject on a network failure,
    // it RESOLVES with `{ data: null, error: {...}, status: 0 }`. A try/catch
    // alone therefore catches nothing, and the old code went on to treat
    // `data: null` as "this user has no cycle data", wiping periodStart,
    // cycleProfile, contraceptionType and cycleInfo and re-persisting the
    // emptied state to disk -- exactly the cache this store exists to keep.
    // Hence the explicit `error` checks below.
    //
    // Idempotent under repeated failure: a second (third, nth) offline call
    // takes the same early return, so nothing beyond `isLoading` is ever
    // written and already-cached state cannot degrade further.
    try {
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

      // `lengthsRes.error` is deliberately NOT checked here: card 304's query
      // is tolerated failing (it 42703s on a database the migration hasn't
      // reached) and costs only the default period length, which is why it is
      // its own query in the first place. The two below are different -- their
      // data IS the cycle, so a failure must keep the cache rather than
      // overwrite it with nothing.
      if (cycleRes.error || profileRes.error) {
        console.warn(
          '[cycle] loadFromSupabase() failed, keeping cached state:',
          cycleRes.error?.message ?? profileRes.error?.message ?? 'unknown error',
        );
        set({ isLoading: false });
        return;
      }

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
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[cycle] loadFromSupabase() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
      set({ isLoading: false });
    }
  },
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      // Approach (a) from the plan: convert Date -> ISO string going in,
      // ISO string -> Date coming back out via a custom `merge`. Simpler than
      // a JSON reviver/replacer pair and matches how most Zustand+Date
      // persistence is done.
      partialize: (s): PersistedCycleState => ({
        cycleProfile:      s.cycleProfile,
        periodStart:       s.periodStart ? s.periodStart.toISOString() : null,
        cycleLength:       s.cycleLength,
        periodDays:        s.periodDays,
        periodDaysLogged:  s.periodDaysLogged,
        recentPeriodDays:  s.recentPeriodDays,
        cycleMode:         s.cycleMode,
        contraceptionType: s.contraceptionType,
        hasPlaceboWeek:    s.hasPlaceboWeek,
        currentPackStart:  s.currentPackStart ? s.currentPackStart.toISOString() : null,
        fetchedAt:         s.fetchedAt,
        // cycleInfo and isLoading excluded deliberately -- see
        // PersistedCycleState's doc comment above.
      }),
      merge: (persistedState, currentState) => {
        // `p` is `{}` on a fresh install (nothing in storage yet) -- every
        // field then falls back to `currentState`'s own default, which is
        // what a fresh install should show anyway.
        const p = (persistedState ?? {}) as Partial<PersistedCycleState>;

        const cycleProfile      = p.cycleProfile      ?? currentState.cycleProfile;
        const cycleLength       = p.cycleLength       ?? currentState.cycleLength;
        const periodDays        = p.periodDays        ?? currentState.periodDays;
        const periodDaysLogged  = p.periodDaysLogged  ?? currentState.periodDaysLogged;
        const recentPeriodDays  = p.recentPeriodDays  ?? currentState.recentPeriodDays;
        const cycleMode         = p.cycleMode         ?? currentState.cycleMode;
        const contraceptionType = p.contraceptionType !== undefined ? p.contraceptionType : currentState.contraceptionType;
        const hasPlaceboWeek    = p.hasPlaceboWeek    !== undefined ? p.hasPlaceboWeek    : currentState.hasPlaceboWeek;
        const fetchedAt         = p.fetchedAt         !== undefined ? p.fetchedAt         : currentState.fetchedAt;
        const periodStart       = p.periodStart       ? new Date(p.periodStart)       : null;
        const currentPackStart  = p.currentPackStart  ? new Date(p.currentPackStart)  : null;

        return {
          ...currentState,
          cycleProfile, cycleLength, periodDays, periodDaysLogged, recentPeriodDays,
          cycleMode, contraceptionType, hasPlaceboWeek, fetchedAt,
          periodStart, currentPackStart,
          // Recomputed fresh with `new Date()` ("today"), not persisted and
          // not whatever `today` was in memory when the app last closed.
          //
          // Done here, inside `merge`, rather than in `onRehydrateStorage`:
          // persist's hydrate flow calls `set(stateFromStorage, true)` (which
          // notifies subscribers) BEFORE it invokes `onRehydrateStorage`'s
          // returned callback. Recomputing there would mean the first
          // notified render still sees the stale/absent cycleInfo the merge
          // produced, silently corrected a tick later. Computing it as part
          // of the value `merge` returns means the very first `set()` --
          // and therefore the very first render -- already carries today's
          // phase.
          cycleInfo: computeForProfile(
            cycleProfile, hasPlaceboWeek, periodStart, currentPackStart, cycleLength, new Date(), periodDays,
          ),
        };
      },
    },
  ),
);

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
