import { recipeEntryName, scaleServings, isRecipeUnlocked, noteStatesAnAmount } from '@/lib/recipes';

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

// ---------------------------------------------------------------------------
// Ingredient notes vs scaled quantities
// ---------------------------------------------------------------------------

describe('noteStatesAnAmount', () => {
  // Every note in the seeded book, split by hand into the two kinds. The
  // predicate decides whether a note survives when the quantity beside it has
  // been scaled, so getting it wrong shows a contradiction on the screen: a
  // gram figure for one serving beside a count for the whole recipe.
  const statesAnAmount = [
    '6 eggs, about 50 g each once shelled',
    '2 tomatoes, about 110 g each',
    '1 tin, drained',
    '2 tins, drained',
    '3 cloves',
    '2 large eggs',
    '3 large eggs',
    '1 thick slice, toasted',
    '1 medium, sliced',
    '2 slices',
    '2 breasts',
    '2 fillets',
    '2 nests',
    '2 medallions',
    '1 biscuit',
    '1 pepper, deseeded and cut into thin strips',
    '2 large, diced',
    '1 large, diced',
    '2 sticks, diced',
    'half a pepper',
    'half a lemon',
    'half a tsp',
    'half a lemon, to finish',
    'a wedge',
    'a drizzle, to finish',
    'a drizzle, for the pan',
    'a thin scrape, not a thick layer',
    'a pouch or a drained tin',
    '1 tbsp',
  ];

  const holdsAtAnyScale = [
    'diced',
    'chopped',
    'roughly chopped',
    'fresh, chopped',
    'chopped, to finish',
    'sliced',
    'sliced on the diagonal',
    'grated',
    'halved',
    'torn',
    'trimmed',
    'podded',
    'peeled and cubed',
    'pressed and cubed',
    'raw, peeled',
    'broken into florets',
    'florets',
    'cut into wedges, skin on',
    'toasted',
    'to taste',
    'to finish',
    'for the top, added last',
    'dry weight',
    'dry weight, rinsed',
    'tinned, drained',
    'in juice, save the juice for the sauce',
    'optional, for a bit of body',
    'vanilla works best',
    'vanilla or chocolate',
  ];

  it.each(statesAnAmount)('treats %p as stating an amount', (note) => {
    expect(noteStatesAnAmount(note)).toBe(true);
  });

  it.each(holdsAtAnyScale)('treats %p as holding at any scale', (note) => {
    expect(noteStatesAnAmount(note)).toBe(false);
  });

  it('does not mistake a word that merely starts with a count letter', () => {
    // "an" and "a" are amounts; "almonds" and "apple" are not.
    expect(noteStatesAnAmount('almonds, flaked')).toBe(false);
    expect(noteStatesAnAmount('apple, cored')).toBe(false);
    expect(noteStatesAnAmount('an apple, cored')).toBe(true);
  });
});
