import {
  searchRecipes, searchRecipesRanked, stepServings, formatServings,
  MIN_SERVINGS, MAX_SERVINGS, type Recipe,
} from '@/lib/recipes';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function recipe(name: string, ingredientNames: string[] = [], collectionLabel = 'Weeknight dinners'): Recipe {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'), name, collection: 'c', collectionLabel,
    intro: null, meal_types: [], phases: [], loads: [], dietary: [], serves: 2,
    prepMinutes: null, cookMinutes: null, imageUrl: null, minTier: null,
    calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, fibre_g: null, ingredientNames,
  };
}

// Emma's own example, build 14 regression pass.
const CHIPOTLE_CHICKEN = recipe('Chipotle Chicken', ['chicken thighs', 'chipotle paste', 'lime']);
const MEXICAN_TRAY     = recipe('Mexican Tray Bake', ['sweet potato', 'black beans', 'chipotle paste']);
const PORRIDGE         = recipe('Overnight Oats', ['oats', 'milk'], 'Breakfasts');
const ALL = [MEXICAN_TRAY, PORRIDGE, CHIPOTLE_CHICKEN];

describe('recipe search — ingredients as well as titles', () => {
  it('finds a recipe by an ingredient that is not in its name', () => {
    // The whole card. Search used to read name and collection only, so the
    // tray bake was invisible to a search for what is actually in it.
    const names = searchRecipes(ALL, 'chipotle').map((r) => r.name);
    expect(names).toContain('Mexican Tray Bake');
    expect(names).toContain('Chipotle Chicken');
    expect(names).not.toContain('Overnight Oats');
  });

  it('ranks the title match above the ingredient match', () => {
    // Chipotle Chicken is deliberately LAST in the input, so this proves the
    // ranking rather than the order the recipes happened to arrive in.
    const ranked = searchRecipesRanked(ALL, 'chipotle');
    expect(ranked.map((m) => m.recipe.name)).toEqual(['Chipotle Chicken', 'Mexican Tray Bake']);
    expect(ranked.map((m) => m.match)).toEqual(['title', 'ingredient']);
  });

  it('counts a collection label as a title match', () => {
    expect(searchRecipesRanked(ALL, 'breakfast')[0]).toEqual({ recipe: PORRIDGE, match: 'title' });
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(searchRecipes(ALL, '  CHIPOTLE ').length).toBe(2);
  });

  it('still finds by name when ingredient names failed to load', () => {
    // A failed ingredient read must degrade search to name-only, not to nothing.
    const bare = { ...CHIPOTLE_CHICKEN, ingredientNames: undefined };
    expect(searchRecipes([bare], 'chipotle')).toEqual([bare]);
  });

  it('returns everything for an empty query', () => {
    expect(searchRecipes(ALL, '   ')).toEqual(ALL);
  });
});

describe('servings in quarter steps', () => {
  it('moves by a quarter in each direction', () => {
    expect(stepServings(1, 1)).toBe(1.25);
    expect(stepServings(1, -1)).toBe(0.75);
  });

  it('stays on the quarter grid across many taps', () => {
    // The old arithmetic rounded to one decimal, so 1 - 0.25 = 0.75 became 0.8
    // and every tap after that was off the grid. Walk the whole range both ways.
    let s = MIN_SERVINGS;
    for (let i = 0; i < 60; i++) {
      s = stepServings(s, 1);
      expect((s * 4) % 1).toBe(0);
    }
    expect(s).toBe(MAX_SERVINGS);
    for (let i = 0; i < 60; i++) {
      s = stepServings(s, -1);
      expect((s * 4) % 1).toBe(0);
    }
    expect(s).toBe(MIN_SERVINGS);
  });

  it('clamps at both ends', () => {
    expect(stepServings(MIN_SERVINGS, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MAX_SERVINGS, 1)).toBe(MAX_SERVINGS);
  });
});

describe('formatServings', () => {
  it('shows as many decimals as the value needs and no more', () => {
    // toFixed(1) rendered 0.25 as "0.3" and 1.75 as "1.8": a number the macros
    // were never calculated for.
    expect(formatServings(0.25)).toBe('0.25');
    expect(formatServings(0.5)).toBe('0.5');
    expect(formatServings(0.75)).toBe('0.75');
    expect(formatServings(1)).toBe('1');
    expect(formatServings(1.75)).toBe('1.75');
    expect(formatServings(12)).toBe('12');
  });
});
