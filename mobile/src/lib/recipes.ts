import { supabase } from '@/lib/supabase';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import type { MealType } from '@/lib/nutritionLog';
import type { FoodUnit } from '@/lib/foodUnits';

/**
 * Read-path for the recipe book, over the content tables seeded in migration
 * 20260826000000 (recipes → recipe_ingredients / recipe_steps).
 *
 * Same shape as getStrongSession.ts: authored content read verbatim, RLS does
 * the access control, and every failure warns and degrades to empty rather
 * than throwing. A recipe tab that is briefly empty is a much smaller problem
 * than one that crashes a tab the user was only browsing.
 *
 * Nothing in the app imports this yet. The tab is still a holding page; this
 * lands first so PR 2 has something to build against.
 */

export interface Recipe {
  id:               string;
  name:             string;
  collection:       string;
  collectionLabel:  string;
  intro:            string | null;
  meal_types:       MealType[];
  /** Empty means "suits any". Never read an empty array as "suits none". */
  phases:           CyclePhase[];
  loads:            TrainingLoad[];
  dietary:          string[];
  serves:           number;
  prepMinutes:      number | null;
  cookMinutes:      number | null;
  imageUrl:         string | null;
  /** Null means included in the base subscription. Unused at launch. */
  minTier:          string | null;
  // Per serving. fibre is null when the source did not supply it: unknown,
  // not zero. A UI showing "0g fibre" for an unknown would be a false claim.
  calories:         number;
  carbs_g:          number;
  protein_g:        number;
  fat_g:            number;
  fibre_g:          number | null;
}

export interface RecipeIngredient {
  position:      number;
  groupLabel:    string | null;
  foodName:      string;
  /** Null for "a pinch" / "to taste". */
  quantity:      number | null;
  unit:          FoodUnit;
  note:          string | null;
  commonFoodId:  string | null;
  calories:      number | null;
  carbs_g:       number | null;
  protein_g:     number | null;
  fat_g:         number | null;
  fibre_g:       number | null;
}

export interface RecipeStep {
  position:      number;
  body:          string;
  timerSeconds:  number | null;
}

export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[];
  steps:       RecipeStep[];
}

const RECIPE_COLUMNS =
  'id, name, collection, collection_label, intro, meal_types, phases, loads, dietary, ' +
  'serves, prep_minutes, cook_minutes, image_url, min_tier, ' +
  'calories, carbs_g, protein_g, fat_g, fibre_g';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRecipe(row: any): Recipe {
  return {
    id:              row.id,
    name:            row.name,
    collection:      row.collection,
    collectionLabel: row.collection_label,
    intro:           row.intro ?? null,
    meal_types:      row.meal_types ?? [],
    phases:          row.phases ?? [],
    loads:           row.loads ?? [],
    dietary:         row.dietary ?? [],
    serves:          row.serves ?? 1,
    prepMinutes:     row.prep_minutes ?? null,
    cookMinutes:     row.cook_minutes ?? null,
    imageUrl:        row.image_url ?? null,
    minTier:         row.min_tier ?? null,
    calories:        Number(row.calories  ?? 0),
    carbs_g:         Number(row.carbs_g   ?? 0),
    protein_g:       Number(row.protein_g ?? 0),
    fat_g:           Number(row.fat_g     ?? 0),
    // Deliberately not `?? 0`: null here means the source had no fibre data.
    fibre_g:         row.fibre_g === null || row.fibre_g === undefined ? null : Number(row.fibre_g),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every active recipe, in authored order within collection. */
export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_COLUMNS)
    .eq('is_active', true)
    .order('collection')
    .order('sort_order');

  if (error) {
    console.warn('[recipes] fetchRecipes failed:', error.message);
    return [];
  }
  return (data ?? []).map(toRecipe);
}

/**
 * One recipe with its ingredients and method.
 *
 * Three round trips in parallel rather than a nested select: PostgREST embeds
 * would need the FK relationships named in the select string, and the flat
 * version is easier to read and to change. Returns null if the recipe itself
 * is missing; a recipe with no steps yet is still a valid recipe.
 */
export async function fetchRecipeDetail(id: string): Promise<RecipeDetail | null> {
  const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
    supabase.from('recipes').select(RECIPE_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('recipe_ingredients')
      .select('position, group_label, food_name, quantity, unit, note, common_food_id, ' +
              'calories, carbs_g, protein_g, fat_g, fibre_g')
      .eq('recipe_id', id)
      .order('position'),
    supabase
      .from('recipe_steps')
      .select('position, body, timer_seconds')
      .eq('recipe_id', id)
      .order('position'),
  ]);

  if (recipeRes.error) {
    console.warn('[recipes] fetchRecipeDetail failed:', recipeRes.error.message);
    return null;
  }
  if (!recipeRes.data) return null;

  if (ingredientsRes.error) console.warn('[recipes] ingredients failed:', ingredientsRes.error.message);
  if (stepsRes.error)       console.warn('[recipes] steps failed:', stepsRes.error.message);

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    ...toRecipe(recipeRes.data),
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ingredients: (ingredientsRes.data ?? []).map((r: any): RecipeIngredient => ({
      position:     r.position,
      groupLabel:   r.group_label ?? null,
      foodName:     r.food_name,
      quantity:     num(r.quantity),
      unit:         (r.unit === 'ml' ? 'ml' : 'g') as FoodUnit,
      note:         r.note ?? null,
      commonFoodId: r.common_food_id ?? null,
      calories:     num(r.calories),
      carbs_g:      num(r.carbs_g),
      protein_g:    num(r.protein_g),
      fat_g:        num(r.fat_g),
      fibre_g:      num(r.fibre_g),
    })),
    steps: (stepsRes.data ?? []).map((r: any): RecipeStep => ({
      position:     r.position,
      body:         r.body,
      timerSeconds: r.timer_seconds ?? null,
    })),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  };
}

/**
 * Scale a recipe's per-serving macros to the number of servings being logged.
 *
 * Rounded to one decimal to match scaleFood() in commonFoods.ts, so a recipe
 * and a hand-logged food agree on precision in the day view.
 */
export function scaleServings(
  recipe: Pick<Recipe, 'calories' | 'carbs_g' | 'protein_g' | 'fat_g' | 'fibre_g'>,
  servings: number,
) {
  const r = (v: number) => Math.round(v * servings * 10) / 10;
  return {
    calories:  r(recipe.calories),
    carbs_g:   r(recipe.carbs_g),
    protein_g: r(recipe.protein_g),
    fat_g:     r(recipe.fat_g),
    fibre_g:   recipe.fibre_g === null ? null : r(recipe.fibre_g),
  };
}

/**
 * How a logged recipe names itself in the day view.
 *
 * The serving count lives in the name because `quantity_g` stays null for
 * recipe entries: nobody weighed the finished dish, and inventing a gram
 * figure would be a fiction the rest of the food log does not tell.
 */
export function recipeEntryName(name: string, servings: number): string {
  const rounded = Math.round(servings * 100) / 100;
  return `${name} (${rounded} ${rounded === 1 ? 'serving' : 'servings'})`;
}

/** Ingredient quantities scale with servings too, so the cook reads the truth. */
export function scaleIngredientQuantity(
  quantity: number | null,
  serves:   number,
  servings: number,
): number | null {
  if (quantity === null || serves <= 0) return null;
  return Math.round((quantity / serves) * servings * 10) / 10;
}
