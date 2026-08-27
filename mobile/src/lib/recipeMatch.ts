import type { CyclePhase } from '@/store/cycle';
import type { NutritionTargets, TrainingLoad } from '@/lib/nutritionTargets';
import type { MealType } from '@/lib/nutritionLog';

/**
 * Scoring for the Recipes tab's two personalised rails.
 *
 * Deliberately free of Supabase and of React so it can be unit tested against
 * plain numbers, the same way strengthProgramme.ts is: the read-path in
 * recipes.ts fetches the rows, this decides what order they go in.
 *
 * The rule that shapes everything here is RANK, NEVER HIDE. A recipe that does
 * not suit today still appears, just lower down. The tab is a book you browse,
 * not a prescription, and telling a runner a meal is unavailable to her is
 * exactly the diet-culture framing the tone rule rules out. The one exception
 * is a hard dietary exclusion, which is not a preference but a fact about what
 * she can eat.
 */

// ---------------------------------------------------------------------------
// Meal-slot shares
// ---------------------------------------------------------------------------
/**
 * How much of a day's targets each meal is assumed to carry. Dinner-weighted,
 * which is how most people actually eat, and it stops the rail offering the
 * biggest thing in the book at 8am purely because the day is still empty.
 *
 * Snack takes the remainder rather than a share of its own, so the four always
 * total exactly 1 no matter how the others are tuned.
 */
export const SLOT_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch:     0.30,
  dinner:    0.35,
  snack:     0.10,
};

export interface MacroSet {
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
}

/**
 * What is left for one meal slot: that slot's share of the day, minus whatever
 * has already been logged into it.
 *
 * Clamped at zero. A negative remainder would invert the distance scoring and
 * start recommending the largest recipes to somebody who has already eaten
 * more than the slot's share, which is both wrong and unkind.
 */
export function remainingForSlot(
  targets: NutritionTargets,
  slot:    MealType,
  logged:  Partial<MacroSet> = {},
): MacroSet {
  const share = SLOT_SHARE[slot];
  const left = (target: number, eaten: number | undefined) =>
    Math.max(0, target * share - (eaten ?? 0));
  return {
    calories:  left(targets.calories,  logged.calories),
    carbs_g:   left(targets.carbs_g,   logged.carbs_g),
    protein_g: left(targets.protein_g, logged.protein_g),
    fat_g:     left(targets.fat_g,     logged.fat_g),
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** The subset of a recipe row the scorer needs. Keeps the tests small. */
export interface ScorableRecipe {
  id:         string;
  meal_types: MealType[];
  /** Empty means "suits any phase", never "suits none". Same for loads. */
  phases:     CyclePhase[];
  loads:      TrainingLoad[];
  dietary:    string[];
  calories:   number;
  carbs_g:    number;
  protein_g:  number;
  fat_g:      number;
}

export interface MatchContext {
  slot:      MealType;
  phase:     CyclePhase | null;
  load:      TrainingLoad;
  remaining: MacroSet;
  /** Dietary requirements the recipe must satisfy, e.g. ['vegetarian']. */
  requires?: string[];
}

/**
 * Dietary requirements are a lattice, not a set of independent flags: a vegan
 * recipe satisfies a vegetarian requirement, and both satisfy pescatarian.
 * Without this a vegetarian filter would hide every vegan recipe in the book,
 * which is the opposite of what she asked for.
 */
const DIETARY_IMPLIES: Record<string, string[]> = {
  vegan:       ['vegan', 'vegetarian', 'pescatarian', 'df'],
  vegetarian:  ['vegetarian', 'pescatarian'],
  pescatarian: ['pescatarian'],
  gf:          ['gf'],
  df:          ['df'],
};

export function satisfiesDietary(recipeDietary: string[], requires: string[]): boolean {
  if (requires.length === 0) return true;
  const satisfied = new Set(recipeDietary.flatMap((d) => DIETARY_IMPLIES[d] ?? [d]));
  return requires.every((r) => satisfied.has(r));
}

// Bonuses are expressed on the same 0..1 scale as the distance penalty below,
// so a phase match is worth roughly as much as being 12% closer on macros.
const PHASE_BONUS = 0.12;
const LOAD_BONUS  = 0.08;

/**
 * How far a recipe's per-serving macros sit from what is left, as a fraction
 * of what is left. 0 is a perfect fit; 1 is a whole slot's worth out.
 *
 * Overshooting is penalised harder than undershooting (the OVERSHOOT factor),
 * because a meal that is too small is completed by a snack while one that is
 * too big cannot be uneaten. Calories carry the most weight, then protein,
 * because those are the two the rail is really answering.
 */
const OVERSHOOT = 1.6;
const WEIGHTS: Record<keyof MacroSet, number> = {
  calories:  0.45,
  protein_g: 0.25,
  carbs_g:   0.20,
  fat_g:     0.10,
};

function axisDistance(recipe: number, remaining: number): number {
  // Nothing left in this slot: every recipe overshoots equally, so the axis
  // stops discriminating rather than dividing by zero.
  if (remaining <= 0) return recipe > 0 ? 1 : 0;
  const delta = (recipe - remaining) / remaining;
  const scaled = delta > 0 ? delta * OVERSHOOT : -delta;
  return Math.min(1, scaled);
}

export function macroDistance(recipe: MacroSet, remaining: MacroSet): number {
  return (Object.keys(WEIGHTS) as (keyof MacroSet)[])
    .reduce((acc, k) => acc + WEIGHTS[k] * axisDistance(recipe[k], remaining[k]), 0);
}

/**
 * Score a recipe for today. Higher is better; the range is roughly -1..+0.2.
 * Returns null only when the recipe cannot be eaten at all, which is a hard
 * dietary exclusion or a recipe that is not offered in this meal slot.
 */
export function scoreRecipe(recipe: ScorableRecipe, ctx: MatchContext): number | null {
  if (!recipe.meal_types.includes(ctx.slot)) return null;
  if (!satisfiesDietary(recipe.dietary, ctx.requires ?? [])) return null;

  let score = -macroDistance(recipe, ctx.remaining);

  // An empty tag array means "suits anything", so it earns no bonus but is
  // never penalised. Only an explicit match is rewarded.
  if (ctx.phase && recipe.phases.includes(ctx.phase)) score += PHASE_BONUS;
  if (recipe.loads.includes(ctx.load))                score += LOAD_BONUS;

  return score;
}

/**
 * Rank recipes for the "fits what's left today" rail.
 *
 * Ties break on id so the rail is stable between renders; an unstable order on
 * a screen the user is reading is worse than a slightly arbitrary one.
 */
export function rankRecipes<T extends ScorableRecipe>(recipes: T[], ctx: MatchContext): T[] {
  return recipes
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, ctx) }))
    .filter((r): r is { recipe: T; score: number } => r.score !== null)
    .sort((a, b) => (b.score - a.score) || a.recipe.id.localeCompare(b.recipe.id))
    .map((r) => r.recipe);
}

/**
 * The "for your phase" rail: recipes explicitly tagged to today's phase.
 *
 * Unlike rankRecipes this one genuinely filters, because a rail headed "for
 * your phase" containing recipes tagged to no phase would be dishonest. It
 * returns empty rather than falling back, and the caller hides the rail.
 */
export function recipesForPhase<T extends ScorableRecipe>(
  recipes: T[],
  phase:   CyclePhase | null,
  ctx:     Omit<MatchContext, 'phase'>,
): T[] {
  if (!phase) return [];
  const tagged = recipes.filter((r) => r.phases.includes(phase));
  return rankRecipes(tagged, { ...ctx, phase });
}
