import { recipeEntryName, scaleServings, isRecipeUnlocked } from '@/lib/recipes';

/**
 * The pure half of the logging path. logRecipe() itself is exercised through
 * the detail screen in __tests__/app/recipes.test.tsx, where the insert is
 * asserted row by row; these are the rules it depends on.
 */

describe('recipeEntryName', () => {
  it('says serving, singular, for one', () => {
    expect(recipeEntryName('Fruity Cous Cous', 1)).toBe('Fruity Cous Cous (1 serving)');
  });

  it('pluralises everything else, including halves', () => {
    expect(recipeEntryName('Fruity Cous Cous', 2)).toBe('Fruity Cous Cous (2 servings)');
    expect(recipeEntryName('Fruity Cous Cous', 0.5)).toBe('Fruity Cous Cous (0.5 servings)');
  });

  // The serving count is the ONLY record of portion on a recipe entry, because
  // quantity_g is deliberately null. If it were dropped from the name the day
  // view would show a bare recipe title and a calorie figure from nowhere.
  it('always carries the count, so the entry is never portionless', () => {
    for (const n of [0.5, 1, 1.5, 3, 12]) {
      expect(recipeEntryName('X', n)).toMatch(/\(\d+(\.\d+)? servings?\)/);
    }
  });
});

describe('scaleServings', () => {
  const per = { calories: 414.1, carbs_g: 44.4, protein_g: 27.6, fat_g: 13.2, fibre_g: 4.4 };

  it('is the identity at one serving', () => {
    expect(scaleServings(per, 1)).toEqual(per);
  });

  it('scales every macro together', () => {
    expect(scaleServings(per, 2)).toEqual({
      calories: 828.2, carbs_g: 88.8, protein_g: 55.2, fat_g: 26.4, fibre_g: 8.8,
    });
  });

  it('handles half servings', () => {
    expect(scaleServings(per, 0.5).calories).toBe(207.1);
  });

  // Null fibre is unknown. Multiplying an unknown by two is still unknown, and
  // turning it into 0 here would launder a gap into a claim.
  it('keeps unknown fibre unknown', () => {
    expect(scaleServings({ ...per, fibre_g: null }, 3).fibre_g).toBeNull();
  });

  it('rounds to one decimal, matching scaleFood in commonFoods', () => {
    const r = scaleServings({ calories: 33.33, carbs_g: 1.11, protein_g: 2.22, fat_g: 3.33, fibre_g: 0 }, 3);
    expect(r.calories).toBe(100);
    expect(r.carbs_g).toBe(3.3);
  });
});

describe('isRecipeUnlocked', () => {
  // min_tier is null on every seeded recipe, so this is an identity function
  // today. It exists so tiering later is one change, not a scattered check.
  it('lets anyone read a recipe with no tier set', () => {
    expect(isRecipeUnlocked({ minTier: null }, null)).toBe(true);
    expect(isRecipeUnlocked({ minTier: null }, 'plus')).toBe(true);
  });

  it('gates one that names a tier', () => {
    expect(isRecipeUnlocked({ minTier: 'plus' }, null)).toBe(false);
    expect(isRecipeUnlocked({ minTier: 'plus' }, 'free')).toBe(false);
    expect(isRecipeUnlocked({ minTier: 'plus' }, 'plus')).toBe(true);
  });
});
