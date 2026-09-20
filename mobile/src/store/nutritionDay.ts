import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { getNutritionDay, type FoodEntryRow } from '@/lib/nutritionLog';
import type { TrainingLoad, NutritionTargets } from '@/lib/nutritionTargets';
import { asyncStorageAdapter } from './persistAdapter';

const STORE_NAME = 'virra:nutrition:v1';

export interface NutritionDayData {
  logId:        string | null;
  trainingLoad: TrainingLoad | null;
  inferredLoad: TrainingLoad | null;
  targetsJson:  NutritionTargets | null;
  entries:      FoodEntryRow[];
  /** Stamped only on a successful `refresh()` for this specific day, so a
   *  failed/offline refresh never claims freshness it doesn't have. Per-day,
   *  not global -- the store holds roughly a week of days at once and each
   *  one's own last-successful-fetch matters independently. */
  fetchedAt:    string;
}

interface NutritionDayState {
  days:     Record<string, NutritionDayData>;
  /**
   * One entry per `recordedOn` currently being fetched, holding the SHARED
   * in-flight promise for that day rather than a bare boolean flag. Two
   * legitimate call sites ask for the same day at nearly the same moment --
   * the screen's own load effect and its focus effect -- and both need the
   * SAME network round trip's result, not "whoever loses the race gets
   * nothing." A caller that arrives while a fetch is already running awaits
   * that same promise instead of starting a second one, so `refresh()`
   * resolving is always a reliable signal that `days[recordedOn]` reflects
   * the latest attempt (fresh data on success, untouched cache on failure).
   */
  inFlight: Record<string, Promise<void> | undefined>;
  refresh:          (recordedOn: string) => Promise<void>;
  /** Optimistic local removal (e.g. after a delete already committed to the
   *  server) -- avoids waiting on a round trip through `refresh()` just to
   *  reflect a change the screen already knows happened. */
  removeEntryLocal: (recordedOn: string, entryId: string) => void;
  /** Optimistic local macro edit (e.g. after an update already committed to
   *  the server, or queued for offline replay) -- same reasoning and shape as
   *  `removeEntryLocal`: avoids waiting on a round trip through `refresh()`
   *  just to reflect a change the screen already knows happened. */
  updateEntryLocal: (recordedOn: string, entryId: string, patch: Partial<FoodEntryRow>) => void;
  /**
   * Drop every cached day back to empty. Called from the auth store's
   * `signOut()`: clearing STORAGE is not clearing the app -- this store keeps
   * its days in memory and nothing reloads between sign-out and the next
   * sign-in, so without this the next account on the device sees the previous
   * user's food entries. Same shape and reason as `sessionStore`'s
   * `clearCache()`.
   */
  clear: () => void;
}

/** Raw fields persisted to AsyncStorage. `inFlight` is an in-progress-request
 *  map, not data, and must never be replayed as "still fetching" from a
 *  stale cache on cold start. */
interface PersistedNutritionDayState {
  days: Record<string, NutritionDayData>;
}

export const useNutritionDay = create<NutritionDayState>()(
  persist(
    (set, get) => ({
      days:     {},
      inFlight: {},

      refresh: async (recordedOn) => {
        const existing = get().inFlight[recordedOn];
        if (existing) {
          // A fetch for this exact day is already running (e.g. kicked off by
          // the screen's focus effect a tick earlier) -- join it instead of
          // firing a second, redundant `nutrition_logs` + `food_entries` read.
          await existing;
          return;
        }

        const fetchPromise = (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const snapshot = await getNutritionDay(user.id, recordedOn);

            // Only a genuinely successful read reaches this `set()` -- a
            // thrown/rejected call below is caught and leaves the existing
            // cached day (if any) exactly as it was.
            set({
              days: {
                ...get().days,
                [recordedOn]: {
                  logId:        snapshot.logId,
                  trainingLoad: snapshot.trainingLoad,
                  inferredLoad: snapshot.inferredLoad,
                  targetsJson:  snapshot.targetsJson,
                  entries:      snapshot.entries,
                  fetchedAt:    new Date().toISOString(),
                },
              },
            });
          } catch (e) {
            console.warn('[nutritionDay] refresh() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
          }
        })();

        set({ inFlight: { ...get().inFlight, [recordedOn]: fetchPromise } });
        try {
          await fetchPromise;
        } finally {
          const next = { ...get().inFlight };
          delete next[recordedOn];
          set({ inFlight: next });
        }
      },

      removeEntryLocal: (recordedOn, entryId) => {
        const day = get().days[recordedOn];
        if (!day) return;
        set({
          days: {
            ...get().days,
            [recordedOn]: { ...day, entries: day.entries.filter((e) => e.id !== entryId) },
          },
        });
      },

      updateEntryLocal: (recordedOn, entryId, patch) => {
        const day = get().days[recordedOn];
        if (!day) return;
        set({
          days: {
            ...get().days,
            [recordedOn]: {
              ...day,
              entries: day.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
            },
          },
        });
      },

      clear: () => set({ days: {}, inFlight: {} }),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      partialize: (s): PersistedNutritionDayState => ({
        days: s.days,
        // `inFlight` excluded deliberately -- see PersistedNutritionDayState's
        // doc comment above.
      }),
    },
  ),
);
