import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  fetchRecipes, fetchRecipeDetail, fetchFavouriteIds, toggleFavourite as toggleFavouriteApi,
  type Recipe, type RecipeDetail,
} from '@/lib/recipes';
import { asyncStorageAdapter } from './persistAdapter';

const STORE_NAME = 'virra:recipes:v1';

interface RecipeDetailEntry {
  detail:    RecipeDetail;
  fetchedAt: string;
}

interface RecipesState {
  list:                Recipe[];
  listFetchedAt:       string | null;
  /** Filled lazily, one entry per recipe id opened, per spec §4.2. */
  details:             Record<string, RecipeDetailEntry>;
  favouriteIds:        string[];
  favouritesFetchedAt: string | null;

  refreshList:       () => Promise<void>;
  refreshDetail:     (id: string) => Promise<void>;
  refreshFavourites: (userId: string) => Promise<void>;
  /**
   * `toggleFavourite` stays a direct online write for this plan (J2 is
   * reads-only; an outbox-backed version is J3's own `toggleFavourite` kind).
   * What's new here is that the CACHED `favouriteIds` updates optimistically
   * the moment the write is fired, and reverts to the pre-toggle snapshot if
   * the server call fails -- same snapshot-and-revert shape as
   * `sessionStore.ts`'s `dropSession`/`moveSession`, rather than waiting on a
   * full `refreshFavourites()` round trip to reflect what the user just did.
   */
  toggleFavourite: (userId: string, recipeId: string, next: boolean) => Promise<boolean>;
  /**
   * Drop the cached list, details and favourites back to empty. Called from
   * the auth store's `signOut()`.
   *
   * `favouriteIds` is the reason this matters most here: `refreshFavourites`
   * keeps the old cache on a non-empty -> empty transition (the
   * suspected-failure guard documented in this file's header). Without a reset
   * at sign-out, account B's genuine "no favourites yet" result looks exactly
   * like that failure, so account A's favourites would be kept FOREVER --
   * nothing else ever overwrites them unless B happens to favourite something.
   */
  clear: () => void;
}

interface PersistedRecipesState {
  list:                Recipe[];
  listFetchedAt:       string | null;
  details:             Record<string, RecipeDetailEntry>;
  favouriteIds:        string[];
  favouritesFetchedAt: string | null;
}

/**
 * Cache-first store for the recipe book: the full list, detail-by-id (filled
 * on first open), and favourite ids -- per spec §4.2's row for `recipes`.
 * (Meal combos, also named in that row, are read and written entirely inside
 * `food-search.tsx` today, a file outside this task's scope -- not added
 * here; see task-6-report.md.)
 *
 * `fetchRecipes` / `fetchFavouriteIds` / `fetchRecipeDetail` are all
 * deliberately written (see recipes.ts's own top-of-file comment) to degrade
 * to an empty array / null on failure rather than throw, so that a flaky
 * network never crashes a tab the user was only browsing. That's the right
 * contract for their EXISTING callers (this tab, `collection/[id].tsx`,
 * `recipe/[slug].tsx` -- none of which wrap these calls in try/catch), so it
 * is left unchanged rather than "fixed" for this store's benefit.
 *
 * The cost: unlike `nutritionDay`'s `getNutritionDay` (which throws on a real
 * error, letting the store tell "failed" apart from "genuinely nothing
 * here"), this store cannot make that distinction from the return value
 * alone. The policy adopted below: a NON-EMPTY -> EMPTY transition on refresh
 * is treated as a suspected failure and the old cache is kept; EMPTY -> EMPTY
 * (or a first-ever fetch) is accepted as legitimate. A seeded recipe book
 * doesn't shrink to zero in practice, and a genuine "unfavourite everything"
 * is already reflected instantly by `toggleFavourite`'s optimistic update
 * above, not by this refetch path -- so the rare case this trades away
 * (favourites list emptied from ANOTHER device, then refetched here before
 * this device makes its own change) is a much smaller problem than a flaky
 * refresh silently wiping a real cached list.
 */
export const useRecipesStore = create<RecipesState>()(
  persist(
    (set, get) => ({
      list:                [],
      listFetchedAt:       null,
      details:             {},
      favouriteIds:        [],
      favouritesFetchedAt: null,

      refreshList: async () => {
        try {
          const rows = await fetchRecipes();
          if (rows.length === 0 && get().list.length > 0) return; // see file header
          set({ list: rows, listFetchedAt: new Date().toISOString() });
        } catch (e) {
          console.warn('[recipes store] refreshList() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
        }
      },

      refreshDetail: async (id) => {
        try {
          const detail = await fetchRecipeDetail(id);
          if (!detail) return; // keep whatever's cached (or nothing) -- see file header
          set({
            details: { ...get().details, [id]: { detail, fetchedAt: new Date().toISOString() } },
          });
        } catch (e) {
          console.warn('[recipes store] refreshDetail() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
        }
      },

      refreshFavourites: async (userId) => {
        try {
          const ids = await fetchFavouriteIds(userId);
          if (ids.length === 0 && get().favouriteIds.length > 0) return; // see file header
          set({ favouriteIds: ids, favouritesFetchedAt: new Date().toISOString() });
        } catch (e) {
          console.warn('[recipes store] refreshFavourites() failed, keeping cached state:', e instanceof Error ? e.message : String(e));
        }
      },

      toggleFavourite: async (userId, recipeId, next) => {
        const prevIds = get().favouriteIds;
        const optimisticIds = next
          ? (prevIds.includes(recipeId) ? prevIds : [recipeId, ...prevIds])
          : prevIds.filter((id) => id !== recipeId);
        set({ favouriteIds: optimisticIds });

        const result = await toggleFavouriteApi(userId, recipeId, next);
        if (result === null) {
          // toggleFavouriteApi never throws (it catches and returns null on
          // failure) -- revert to the pre-toggle snapshot rather than leaving
          // the optimistic flip stranded.
          set({ favouriteIds: prevIds });
          return prevIds.includes(recipeId);
        }
        return result;
      },

      clear: () => set({
        list: [], listFetchedAt: null, details: {},
        favouriteIds: [], favouritesFetchedAt: null,
      }),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      partialize: (s): PersistedRecipesState => ({
        list:                s.list,
        listFetchedAt:       s.listFetchedAt,
        details:             s.details,
        favouriteIds:        s.favouriteIds,
        favouritesFetchedAt: s.favouritesFetchedAt,
      }),
    },
  ),
);
