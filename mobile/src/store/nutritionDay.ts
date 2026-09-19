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
  fetching: Set<string>;
  refresh:          (recordedOn: string) => Promise<void>;
  /** Optimistic local removal (e.g. after a delete already committed to the
   *  server) -- avoids waiting on a round trip through `refresh()` just to
   *  reflect a change the screen already knows happened. */
  removeEntryLocal: (recordedOn: string, entryId: string) => void;
}

/** Raw fields persisted to AsyncStorage. `fetching` is an in-flight-request
 *  flag, not data, and must never be replayed as "fetching" from a stale
 *  cache on cold start. */
interface PersistedNutritionDayState {
  days: Record<string, NutritionDayData>;
}

export const useNutritionDay = create<NutritionDayState>()(
  persist(
    (set, get) => ({
      days:     {},
      fetching: new Set<string>(),

      refresh: async (recordedOn) => {
        if (get().fetching.has(recordedOn)) return;
        const nextFetching = new Set(get().fetching);
        nextFetching.add(recordedOn);
        set({ fetching: nextFetching });

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
        } finally {
          const after = new Set(get().fetching);
          after.delete(recordedOn);
          set({ fetching: after });
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
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      partialize: (s): PersistedNutritionDayState => ({
        days: s.days,
        // `fetching` excluded deliberately -- see PersistedNutritionDayState's
        // doc comment above.
      }),
    },
  ),
);
