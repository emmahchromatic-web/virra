import {
  SLOT_SHARE, remainingForSlot, satisfiesDietary, macroDistance,
  scoreRecipe, rankRecipes, recipesForPhase,
  type ScorableRecipe, type MatchContext,
} from '@/lib/recipeMatch';
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
