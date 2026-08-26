import fs from 'fs';
import path from 'path';

/**
 * Checks the seeded recipe content itself, not the code that reads it.
 *
 * The seed migration carries the same Atwater guard in a DO block, but that
 * only fires when somebody runs the migration by hand in the Supabase SQL
 * editor. These recipes came off Emma's own recipe cards, and one of those
 * cards stated 4376 kcal for a breakfast that computes to 414 — a ten-fold
 * typo that nothing but arithmetic would have caught. Running the check in CI
 * means the next batch of content is caught at review time instead.
 *
 * The SQL is parsed with regexes, which is fragile, so every extraction is
 * followed by an assertion on how much it found. A regex that silently stops
 * matching would otherwise turn this whole file into a green no-op.
 */

const SEED = path.join(__dirname, '../../supabase/migrations/20260826010000_seed_recipes_teamfit.sql');
const sql = fs.readFileSync(SEED, 'utf8');

interface SeedRecipe { id: string; serves: number }
interface SeedIngredient {
  recipeId: string; calories: number; carbs: number; protein: number; fat: number;
}

// insert into public.recipes (...) values ( 'id', 'Name', ... , serves, ...)
function parseRecipes(): SeedRecipe[] {
  const out: SeedRecipe[] = [];
  const blocks = sql.split('insert into public.recipes').slice(1);
  for (const block of blocks) {
    const id = block.match(/values \(\s*'([^']+)'/)?.[1];
    // serves is the first bare integer after the dietary array literal
    const serves = block.match(/\]::text\[\],\s*(\d+),/)?.[1]
                ?? block.match(/'\{\}'::text\[\],\s*(\d+),/)?.[1];
    if (id && serves) out.push({ id, serves: Number(serves) });
  }
  return out;
}

function parseIngredients(): SeedIngredient[] {
  const out: SeedIngredient[] = [];
  // ('recipe-id', 3, 'Name', qty|null, 'g', note|null, common|null, cal, c, p, f, fib)
  const row = /\(\s*'([a-z0-9-]+)',\s*\d+,\s*'(?:[^']|'')*',\s*(?:[\d.]+|null),\s*'(?:g|ml)',\s*(?:'(?:[^']|'')*'|null),\s*(?:'[^']*'|null),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = row.exec(sql)) !== null) {
    out.push({
      recipeId: m[1],
      calories: Number(m[2]), carbs: Number(m[3]),
      protein:  Number(m[4]), fat:   Number(m[5]),
    });
  }
  return out;
}

const recipes = parseRecipes();
const ingredients = parseIngredients();

describe('the seed file parses', () => {
  // Guards against the regexes rotting into a vacuous pass.
  it('finds all four recipes', () => {
    expect(recipes.map((r) => r.id).sort()).toEqual([
      'biscoff-overnight-oats', 'fruity-cous-cous',
      'mini-frittata-bites', 'prawn-pineapple-stir-fry',
    ]);
  });

  it('finds ingredients for every recipe', () => {
    expect(ingredients.length).toBeGreaterThanOrEqual(30);
    for (const r of recipes) {
      expect(ingredients.filter((i) => i.recipeId === r.id).length).toBeGreaterThan(0);
    }
  });

  it('reads a plausible serving count for each', () => {
    const byId = Object.fromEntries(recipes.map((r) => [r.id, r.serves]));
    expect(byId['mini-frittata-bites']).toBe(6);
    expect(byId['biscoff-overnight-oats']).toBe(1);
    expect(byId['fruity-cous-cous']).toBe(2);
    expect(byId['prawn-pineapple-stir-fry']).toBe(2);
  });
});

describe('seeded recipe macros', () => {
  const derived = recipes.map((r) => {
    const mine = ingredients.filter((i) => i.recipeId === r.id);
    const sum = (pick: (i: SeedIngredient) => number) =>
      mine.reduce((a, i) => a + pick(i), 0) / r.serves;
    return {
      id: r.id,
      calories: sum((i) => i.calories),
      carbs:    sum((i) => i.carbs),
      protein:  sum((i) => i.protein),
      fat:      sum((i) => i.fat),
    };
  });

  // 4 kcal/g for carbohydrate and protein, 9 for fat. The 15% band absorbs
  // rounding, fibre and alcohol without absorbing a misplaced decimal point.
  it.each(derived.map((d) => [d.id, d] as const))(
    '%s: stated calories agree with its macros',
    (_id, d) => {
      const atwater = 4 * d.carbs + 4 * d.protein + 9 * d.fat;
      expect(Math.abs(d.calories - atwater)).toBeLessThanOrEqual(0.15 * d.calories);
    },
  );

  it.each(derived.map((d) => [d.id, d] as const))(
    '%s: lands in a believable range for one serving',
    (_id, d) => {
      expect(d.calories).toBeGreaterThan(50);
      expect(d.calories).toBeLessThan(1200);
      expect(d.protein).toBeGreaterThanOrEqual(0);
      expect(d.fat).toBeGreaterThanOrEqual(0);
    },
  );
});

describe('seed hygiene', () => {
  // The rest of the app strips em-dashes from user-facing copy; recipe intros
  // and method steps are user-facing copy too.
  it('carries no em-dashes', () => {
    expect(sql).not.toMatch(/—/);
  });

  // phases and loads are the whole point of the feature and are Emma's
  // judgement to make. Seeding a guess would quietly mis-serve every rail, so
  // they ship empty, which the schema reads as "suits any". When she does her
  // content pass this test is the thing to delete.
  it('leaves phase and load tags empty pending Emma content pass', () => {
    const inserts = sql.split('insert into public.recipes').slice(1);
    expect(inserts).toHaveLength(4);
    for (const block of inserts) {
      const values = block.slice(0, block.indexOf(');'));
      expect(values).toContain("'{}'::text[], '{}'::text[]");
    }
  });

  it('is re-runnable: it clears its own rows before inserting', () => {
    expect(sql).toMatch(/delete from public\.recipes where source = 'virra-teamfit'/);
  });

  // Exceed Nutrition's packs are licensed for coach-to-client delivery only.
  // None of their recipes may reach this file. See RECIPE_BOOK_PROPOSAL.md s11.
  it('contains none of the Exceed pack recipes', () => {
    const exceedTitles = [
      'Cheesy Chicken Muffins', 'Bacon Stuffed Mushrooms', 'Tandoori Bowl',
      'Poulet Yassa', 'Blueberry Protein Popsicles', 'Instant Pot Chicken Soup',
      'Smashed Pita Burger', 'Whipped Pesto', 'Beef Soba Noodle Bowl',
    ];
    for (const title of exceedTitles) expect(sql).not.toContain(title);
  });
});
