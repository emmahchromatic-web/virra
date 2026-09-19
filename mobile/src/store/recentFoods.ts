import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { toFoodUnit, type FoodUnit } from '@/lib/foodUnits';
import { asyncStorageAdapter } from './persistAdapter';

const STORE_NAME = 'virra:recent_foods:v1';

/** How many distinct foods the cache keeps, per spec §4.2. */
const MAX_FOODS = 200;

/**
 * How far back to scan `food_entries` for distinct foods. myFoods.ts's own
 * history search (searchMyFoods) uses 180 days as its lookback for the same
 * table; this is doubled because a lighter user may not accumulate 200
 * distinct foods within 180 days, and unlike a search this cache is meant to
 * stay populated rather than come back thin.
 */
const LOOKBACK_DAYS = 365;

/**
 * A distinct food the user has logged before, scaled to a per-100g/ml basis
 * (matching myFoods.ts's convention) so a picker can re-scale it to whatever
 * portion is entered next.
 *
 * NOTE on shape vs. the spec: §4.2 describes this cache as holding "name,
 * brand, barcode, per-100g macros, last portion, last used". `food_entries`
 * has no `brand` or `barcode` column (confirmed against
 * supabase/migrations/001_initial_schema.sql and 017_phase_h_nutrition_input.sql)
 * -- a barcode-scanned item is stored under whatever name Open Food Facts gave
 * it, same as myFoods.ts already works around. This is a pre-existing schema
 * gap, not something to fix in this task; `brand`/`barcode` are left out here
 * rather than faked.
 */
export interface RecentFood {
  name:         string;
  unit:         FoodUnit;
  lastPortionG: number;
  calories:     number;
  carbs_g:      number;
  protein_g:    number;
  fat_g:        number;
  fibre_g:      number;
  lastUsedAt:   string;
}

interface HistoryRow {
  food_name:     string;
  quantity_g:    number | null;
  quantity_unit: string | null;
  calories:      number;
  carbs_g:       number;
  protein_g:     number;
  fat_g:         number;
  fibre_g:       number;
  created_at:    string;
}

interface RecentFoodsState {
  foods:     RecentFood[];
  fetchedAt: string | null;
  /**
   * `refresh()` takes no arguments (mirrors `nutritionDay.ts`'s `refresh()`,
   * not `sessionStore.ts`'s range-keyed one) so every write path that needs to
   * invalidate this cache -- `recipes.ts`'s `logRecipe`, the Nutrition tab's
   * own focus-triggered refresh -- can call it with nothing but its own
   * import, without threading a user id through. See recipes.ts and
   * nutrition.tsx for the two call sites, and this file's own header comment
   * further down for why those two are the ones that call it.
   */
  refresh: () => Promise<void>;
  /**
   * Drop the cached foods back to empty. Called from the auth store's
   * `signOut()` -- one account's logged foods must never be visible to the
   * next account on the device, and clearing the storage key alone doesn't
   * clear what this store is holding in memory.
   */
  clear: () => void;
}

/**
 * STATUS: DELIBERATELY INERT SCAFFOLDING. NOTHING CALLS `refresh()` TODAY.
 *
 * The final whole-branch review found this store had zero readers: it was
 * refreshed from `nutrition.tsx`'s focus effect and `recipes.ts`'s
 * `logRecipe`, but no screen ever read `foods`. Every Nutrition-tab focus
 * therefore paid for a 365-day `nutrition_logs` scan plus an up-to-1000-row
 * `food_entries` fetch to populate a cache with no consumer -- pure cost, no
 * benefit. Both trigger calls were removed rather than a consumer invented.
 *
 * Why not wire `food-search.tsx`'s YOUR REGULARS to it instead (option (a) of
 * that review finding)? Their shapes don't match. YOUR REGULARS is scoped to
 * ONE `meal_type`, ranked by how often a food appears in that slot, and
 * carries the macros of the logged portion. This store is global across meals,
 * ordered by recency, de-duplicated by name, and normalised to per-100g/ml
 * with no `meal_type` and no occurrence count. Pointing that surface here
 * would mean changing this store's persisted shape (adding meal_type +
 * counts), re-versioning the key and rewriting its tests -- not the small,
 * contained UI change that option assumed, and not something to do in a
 * fix-wave with no second review round.
 *
 * So the store keeps its (tested, correct) logic and waits for a real
 * consumer. J3, or whoever adds an offline-capable recent-foods picker, wires
 * `refresh()` back into the two call sites described below and reads `foods`
 * from a screen. Until then it costs nothing at runtime.
 *
 * WHERE THE "after any food entry write" TRIGGER LIVED, AND SHOULD LIVE AGAIN
 * (Task 6 design decision, task-6-brief.md's open question):
 *
 * `food_entries` is written from several places in the app today --
 * `recipes.ts`'s `logRecipe`, `food-search.tsx` (barcode/search/common-food
 * adds), `describe-meal.tsx` (Haiku estimates), and
 * `CopyMealFromDayModal.tsx` (copy a past day's meal). There is no single
 * existing function all of these already funnel through -- unlike
 * `nutritionDay`'s read side, which had `nutritionLog.ts`'s `getNutritionDay`
 * ready to wrap, there is no equivalent "the one place a food_entries insert
 * happens" for writes. Centralising every one of those call sites onto a
 * shared write helper (so this store could hook that helper once) would be a
 * multi-file rewrite of code well outside this task's stated files
 * (food-search.tsx, describe-meal.tsx, CopyMealFromDayModal.tsx) -- and the
 * plan's own self-review already earmarks exactly that consolidation for J3
 * ("every other write this plan's screens still make directly to Supabase...
 * food-entry mutations -- J3's outbox handlers"). Forcing it into this
 * read-only (J2) task would be the "bigger refactor" this task's brief says to
 * flag rather than force.
 *
 * Given that, Task 6 wired the two call sites it COULD reach without leaving
 * its stated files (both since removed per the STATUS note above -- they are
 * the two places to restore when a consumer exists):
 *
 *   1. `recipes.ts`'s `logRecipe()` -- named explicitly in the brief as "this
 *      recipe-logging path", and already in this task's file list. Calls
 *      `refresh()` immediately once its insert succeeds.
 *   2. `nutrition.tsx`'s existing `useFocusEffect` (built in Task 5) --
 *      already the established "the nutrition tab's own entry flow" hook:
 *      every time the tab regains focus after a food entry was written from
 *      ANY of food-search.tsx / describe-meal.tsx / CopyMealFromDayModal.tsx
 *      / this tab's own delete, it already calls `useNutritionDay.refresh()`.
 *      This task adds one line calling `useRecentFoods.refresh()` alongside
 *      it. `nutrition.tsx` is not in Task 6's stated file list, but the
 *      change is a single additive call into an existing effect (no existing
 *      logic changed), and doing it here is what makes the trigger honestly
 *      cover the nutrition-tab write paths rather than only the recipe one.
 *
 * Net effect: recipe logging gets an immediate refresh; every other
 * food_entries write path gets picked up the next time the user is on the
 * Nutrition tab (which is also this whole plan's dominant idiom --
 * cache-first render, refresh on focus). A true "fires the instant ANY
 * screen's insert succeeds" trigger needs the single write path J3 already
 * plans to build; this is the honest, minimal stand-in until then.
 */
export const useRecentFoods = create<RecentFoodsState>()(
  persist(
    (set) => ({
      foods:     [],
      fetchedAt: null,

      refresh: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toLocaleDateString('en-CA');

          const { data: logs, error: logErr } = await supabase
            .from('nutrition_logs')
            .select('id')
            .eq('user_id', user.id)
            .gte('recorded_on', since);

          if (logErr) throw new Error(logErr.message);

          if (!logs?.length) {
            // Genuinely nothing logged in the window -- a legitimate empty
            // result, not a failure, same distinction nutritionDay.ts's "no
            // logged row yet" case makes.
            set({ foods: [], fetchedAt: new Date().toISOString() });
            return;
          }

          const { data, error } = await supabase
            .from('food_entries')
            .select('food_name, quantity_g, quantity_unit, calories, carbs_g, protein_g, fat_g, fibre_g, created_at')
            .in('log_id', logs.map((l) => l.id))
            .order('created_at', { ascending: false })
            .limit(1000);

          if (error) throw new Error(error.message);

          const seen = new Set<string>();
          const out: RecentFood[] = [];

          for (const row of (data ?? []) as HistoryRow[]) {
            const key = row.food_name.trim().toLowerCase();
            if (seen.has(key)) continue;

            // Same rule as myFoods.ts: a manually entered food with no
            // recorded portion can't be rescaled to per-100g without
            // inventing a number, so it's skipped rather than guessed at.
            if (!row.quantity_g || row.quantity_g <= 0) continue;

            seen.add(key);
            const per100 = 100 / row.quantity_g;

            out.push({
              name:         row.food_name,
              unit:         toFoodUnit(row.quantity_unit),
              lastPortionG: Math.round(row.quantity_g),
              calories:     Math.round((row.calories  ?? 0) * per100 * 10) / 10,
              carbs_g:      Math.round((row.carbs_g   ?? 0) * per100 * 10) / 10,
              protein_g:    Math.round((row.protein_g ?? 0) * per100 * 10) / 10,
              fat_g:        Math.round((row.fat_g     ?? 0) * per100 * 10) / 10,
              fibre_g:      Math.round((row.fibre_g   ?? 0) * per100 * 10) / 10,
              lastUsedAt:   row.created_at,
            });

            if (out.length >= MAX_FOODS) break;
          }

          set({ foods: out, fetchedAt: new Date().toISOString() });
        } catch (e) {
          console.warn('[recentFoods] refresh() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
        }
      },

      clear: () => set({ foods: [], fetchedAt: null }),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      partialize: (s) => ({ foods: s.foods, fetchedAt: s.fetchedAt }),
    },
  ),
);
