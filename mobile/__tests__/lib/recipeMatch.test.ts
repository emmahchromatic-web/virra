import {
  SLOT_SHARE, remainingForSlot, satisfiesDietary, macroDistance,
  scoreRecipe, rankRecipes, recipesForPhase, slotIsCovered, lightestFirst,
  type ScorableRecipe, type MatchContext, type MacroSet,
} from '@/lib/recipeMatch';
import { normaliseDietaryPrefs } from '@/lib/recipes';
import type { NutritionTargets } from '@/lib/nutritionTargets';

const TARGETS: NutritionTargets = {
  calories: 2000, carbs_g: 240, protein_g: 120, fat_g: 70, fibre_g: 30,
};

function recipe(over: Partial<ScorableRecipe> = {}): ScorableRecipe {
  return {
    id: 'r', meal_types: ['dinner'], phases: [], loads: [], dietary: [],
    calories: 700, carbs_g: 84, protein_g: 42, fat_g: 24.5,
    ...over,
  };
}

function ctx(over: Partial<MatchContext> = {}): MatchContext {
  return {
    slot: 'dinner', phase: null, load: 'moderate',
    remaining: remainingForSlot(TARGETS, 'dinner'),
    ...over,
  };
}

describe('meal-slot shares', () => {
  it('sums to exactly one across the four slots', () => {
    const total = Object.values(SLOT_SHARE).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('weights dinner heaviest and snack lightest', () => {
    expect(SLOT_SHARE.dinner).toBeGreaterThan(SLOT_SHARE.lunch);
    expect(SLOT_SHARE.lunch).toBeGreaterThan(SLOT_SHARE.breakfast);
    expect(SLOT_SHARE.breakfast).toBeGreaterThan(SLOT_SHARE.snack);
  });
});

describe('remainingForSlot', () => {
  it('gives a slot its share of the day when nothing is logged', () => {
    expect(remainingForSlot(TARGETS, 'dinner')).toEqual({
      calories: 700, carbs_g: 84, protein_g: 42, fat_g: 24.5,
    });
  });

  it('subtracts what is already in that slot', () => {
    const left = remainingForSlot(TARGETS, 'breakfast', { calories: 200, protein_g: 10 });
    expect(left.calories).toBe(300);    // 2000 * 0.25 - 200
    expect(left.protein_g).toBe(20);    // 120 * 0.25 - 10
    expect(left.carbs_g).toBe(60);      // untouched macros keep the full share
  });

  // A negative remainder would invert the distance scoring and start pushing
  // the biggest recipes at somebody who has already eaten plenty.
  it('never goes negative when the slot is already over its share', () => {
    const left = remainingForSlot(TARGETS, 'snack', { calories: 9999, carbs_g: 500 });
    expect(left.calories).toBe(0);
    expect(left.carbs_g).toBe(0);
  });
});

describe('satisfiesDietary', () => {
  it('accepts anything when nothing is required', () => {
    expect(satisfiesDietary([], [])).toBe(true);
  });

  // The bug this guards: treating the tags as independent flags hides every
  // vegan recipe from somebody who asked for vegetarian.
  it('lets a vegan recipe satisfy a vegetarian requirement', () => {
    expect(satisfiesDietary(['vegan'], ['vegetarian'])).toBe(true);
  });

  it('does not let a vegetarian recipe satisfy a vegan requirement', () => {
    expect(satisfiesDietary(['vegetarian'], ['vegan'])).toBe(false);
  });

  it('lets vegetarian satisfy pescatarian, but not the other way round', () => {
    expect(satisfiesDietary(['vegetarian'],  ['pescatarian'])).toBe(true);
    expect(satisfiesDietary(['pescatarian'], ['vegetarian'])).toBe(false);
  });

  it('requires every requirement, not just one', () => {
    expect(satisfiesDietary(['vegetarian'], ['vegetarian', 'gf'])).toBe(false);
    expect(satisfiesDietary(['vegetarian', 'gf'], ['vegetarian', 'gf'])).toBe(true);
  });
});

describe('macroDistance', () => {
  const left = { calories: 700, carbs_g: 84, protein_g: 42, fat_g: 24.5 };

  it('is zero for a recipe that exactly fills what is left', () => {
    expect(macroDistance(left, left)).toBe(0);
  });

  it('punishes overshooting harder than undershooting by the same amount', () => {
    const over  = { ...left, calories: 1050 };  // +50%
    const under = { ...left, calories: 350 };   // -50%
    expect(macroDistance(over, left)).toBeGreaterThan(macroDistance(under, left));
  });

  it('weights calories above fat', () => {
    const offCalories = { ...left, calories: left.calories * 1.5 };
    const offFat      = { ...left, fat_g:    left.fat_g    * 1.5 };
    expect(macroDistance(offCalories, left)).toBeGreaterThan(macroDistance(offFat, left));
  });

  it('does not divide by zero when a slot has nothing left', () => {
    const none = { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };
    const d = macroDistance(left, none);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(1, 10);
  });
});

describe('scoreRecipe', () => {
  it('returns null for a recipe not offered in this slot', () => {
    expect(scoreRecipe(recipe({ meal_types: ['breakfast'] }), ctx())).toBeNull();
  });

  it('returns null when a dietary requirement is not met', () => {
    expect(scoreRecipe(recipe({ dietary: [] }), ctx({ requires: ['vegan'] }))).toBeNull();
  });

  it('rewards an explicit phase match', () => {
    const plain   = scoreRecipe(recipe(), ctx({ phase: 'luteal' }))!;
    const matched = scoreRecipe(recipe({ phases: ['luteal'] }), ctx({ phase: 'luteal' }))!;
    expect(matched).toBeGreaterThan(plain);
  });

  it('rewards an explicit load match', () => {
    const plain   = scoreRecipe(recipe(), ctx({ load: 'hard' }))!;
    const matched = scoreRecipe(recipe({ loads: ['hard'] }), ctx({ load: 'hard' }))!;
    expect(matched).toBeGreaterThan(plain);
  });

  // Empty tag arrays mean "suits anything". If they were ever treated as
  // "suits nothing", every untagged recipe would sink to the bottom of the
  // rail and the book would look broken until every recipe was tagged.
  it('does not penalise a recipe for having no phase or load tags', () => {
    const untagged = scoreRecipe(recipe({ phases: [], loads: [] }), ctx({ phase: 'luteal' }))!;
    const mismatch = scoreRecipe(
      recipe({ phases: ['menstrual'], loads: ['rest'] }),
      ctx({ phase: 'luteal', load: 'hard' }),
    )!;
    expect(untagged).toBe(mismatch);
  });
});

describe('rankRecipes', () => {
  it('puts the best macro fit first', () => {
    const perfect = recipe({ id: 'perfect' });
    const tiny    = recipe({ id: 'tiny',  calories: 90,   carbs_g: 10, protein_g: 5,  fat_g: 3 });
    const huge    = recipe({ id: 'huge',  calories: 1800, carbs_g: 200, protein_g: 90, fat_g: 70 });
    expect(rankRecipes([tiny, huge, perfect], ctx()).map((r) => r.id))
      .toEqual(['perfect', 'tiny', 'huge']);
  });

  it('drops only what cannot be eaten, and keeps poor fits', () => {
    const wrongSlot = recipe({ id: 'wrong-slot', meal_types: ['breakfast'] });
    const poorFit   = recipe({ id: 'poor-fit', calories: 30, carbs_g: 2, protein_g: 1, fat_g: 1 });
    const ranked    = rankRecipes([wrongSlot, poorFit], ctx());
    expect(ranked.map((r) => r.id)).toEqual(['poor-fit']);
  });

  it('breaks ties on id so the rail does not reshuffle between renders', () => {
    const b = recipe({ id: 'b' });
    const a = recipe({ id: 'a' });
    expect(rankRecipes([b, a], ctx()).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('recipesForPhase', () => {
  const luteal = recipe({ id: 'luteal', phases: ['luteal'] });
  const none   = recipe({ id: 'none' });

  it('returns only recipes tagged to the phase', () => {
    expect(recipesForPhase([luteal, none], 'luteal', ctx()).map((r) => r.id)).toEqual(['luteal']);
  });

  // A rail headed "for your phase" must not be padded with untagged recipes.
  // Empty is honest, and the caller hides the rail.
  it('is empty rather than falling back when nothing is tagged', () => {
    expect(recipesForPhase([none], 'luteal', ctx())).toEqual([]);
  });

  it('is empty when the user does not track a cycle', () => {
    expect(recipesForPhase([luteal], null, ctx())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Legacy dietary vocabulary
// ---------------------------------------------------------------------------

describe('normaliseDietaryPrefs', () => {
  it('maps the deleted onboarding screen values onto the book vocabulary', () => {
    expect(normaliseDietaryPrefs(['dairy-free'])).toEqual(['df']);
    expect(normaliseDietaryPrefs(['gluten-free'])).toEqual(['gf']);
  });

  it('leaves values that are already current alone', () => {
    expect(normaliseDietaryPrefs(['vegan', 'gf', 'df'])).toEqual(['vegan', 'gf', 'df']);
  });

  it('does not duplicate when both spellings are stored', () => {
    expect(normaliseDietaryPrefs(['df', 'dairy-free'])).toEqual(['df']);
  });

  it('passes through a requirement the book cannot express', () => {
    // Dropping it would silently disable a filter somebody may rely on, so it
    // stays and the rail comes back empty instead. 'nut-free' used to be the
    // example here; it now maps onto 'nf', because the book was audited for
    // nuts. 'halal' has no certification data behind it, so it still cannot be
    // answered honestly.
    expect(normaliseDietaryPrefs(['halal'])).toEqual(['halal']);
  });

  it('is what stops a legacy value hiding the entire book', () => {
    const recipe = { dietary: ['df', 'gf'] };
    // The bug: the raw stored value can never be satisfied.
    expect(satisfiesDietary(recipe.dietary, ['dairy-free'])).toBe(false);
    // The fix: mapped first, the same account matches the same recipe.
    expect(satisfiesDietary(recipe.dietary, normaliseDietaryPrefs(['dairy-free']))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A slot that is already covered
// ---------------------------------------------------------------------------

describe('a covered slot', () => {
  const ctx = (remaining: Partial<MacroSet>) => ({
    slot: 'lunch' as const,
    phase: null,
    load: 'easy' as const,
    remaining: { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, ...remaining },
    requires: [] as string[],
  });

  const r = (id: string, calories: number, extra: Partial<ScorableRecipe> = {}) => ({
    id,
    meal_types: ['lunch'] as const,
    phases: [] as never[],
    loads: [] as never[],
    dietary: [] as string[],
    calories,
    carbs_g: 0,
    protein_g: 0,
    fat_g: 0,
    ...extra,
  }) as unknown as ScorableRecipe;

  it('knows when the share is spent', () => {
    expect(slotIsCovered({ calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 })).toBe(true);
    expect(slotIsCovered({ calories: 400, carbs_g: 0, protein_g: 0, fat_g: 0 })).toBe(false);
  });

  it('is why rankRecipes cannot be used there: every score collapses to the same value', () => {
    const recipes = [r('big', 900), r('small', 100), r('medium', 400)];
    const scores = recipes.map((x) => scoreRecipe(x, ctx({})));
    expect(new Set(scores).size).toBe(1);
  });

  it('orders lightest first instead', () => {
    const recipes = [r('big', 900), r('small', 100), r('medium', 400)];
    expect(lightestFirst(recipes, ctx({})).map((x) => x.id)).toEqual(['small', 'medium', 'big']);
  });

  it('still respects the slot and the dietary filter', () => {
    const recipes = [
      r('dinner-only', 50, { meal_types: ['dinner'] }),
      r('has-dairy',   60),
      r('df-lunch',    500, { dietary: ['df'] }),
    ];
    const out = lightestFirst(recipes, { ...ctx({}), requires: ['df'] });
    expect(out.map((x) => x.id)).toEqual(['df-lunch']);
  });

  it('breaks ties on id so the rail does not reshuffle between renders', () => {
    const recipes = [r('b', 300), r('a', 300)];
    expect(lightestFirst(recipes, ctx({})).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Nut free
// ---------------------------------------------------------------------------

describe('the nut free filter', () => {
  // 'nf' is a positive claim: "audited, contains no nuts". The direction is the
  // safety property, so these tests are about what happens when a recipe has
  // NOT been tagged, not just when it has.
  it('lets an audited recipe through', () => {
    expect(satisfiesDietary(['nf'], ['nf'])).toBe(true);
  });

  it('excludes a recipe that was never audited, rather than assuming it is safe', () => {
    expect(satisfiesDietary([], ['nf'])).toBe(false);
    expect(satisfiesDietary(['vegan', 'gf'], ['nf'])).toBe(false);
  });

  it('does not let any other tag imply nut free', () => {
    // Vegan food is full of nuts. This is the whole reason for the audit.
    expect(satisfiesDietary(['vegan'], ['nf'])).toBe(false);
    expect(satisfiesDietary(['gf', 'df', 'vegetarian'], ['nf'])).toBe(false);
  });

  it('combines with other requirements', () => {
    expect(satisfiesDietary(['nf', 'gf'], ['nf', 'gf'])).toBe(true);
    expect(satisfiesDietary(['nf'], ['nf', 'gf'])).toBe(false);
  });

  it('maps the legacy onboarding value onto it', () => {
    expect(normaliseDietaryPrefs(['nut-free'])).toEqual(['nf']);
    // ...and that mapped value now actually filters, which it could not before.
    expect(satisfiesDietary(['nf'], normaliseDietaryPrefs(['nut-free']))).toBe(true);
    expect(satisfiesDietary([],     normaliseDietaryPrefs(['nut-free']))).toBe(false);
  });

  it('still leaves halal unmapped, because there is nothing to map it to', () => {
    expect(normaliseDietaryPrefs(['halal'])).toEqual(['halal']);
  });

  it('drops a nut-bearing recipe out of the ranked rail entirely', () => {
    const ctx = {
      slot: 'breakfast' as const, phase: null, load: 'easy' as const,
      remaining: { calories: 500, carbs_g: 60, protein_g: 30, fat_g: 20 },
      requires: ['nf'],
    };
    const mk = (id: string, dietary: string[]) => ({
      id, meal_types: ['breakfast'], phases: [], loads: [], dietary,
      calories: 400, carbs_g: 40, protein_g: 20, fat_g: 15,
    } as unknown as ScorableRecipe);
    const out = rankRecipes([mk('porridge', []), mk('eggs', ['nf'])], ctx);
    expect(out.map((r) => r.id)).toEqual(['eggs']);
  });
});
