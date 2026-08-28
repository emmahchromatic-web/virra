import { COMMON_FOODS, searchCommonFoods } from '@/lib/commonFoods';

/**
 * The staples added alongside the recipe book. These are foods recipes are
 * genuinely built from that the catalogue had no way to price, so a soy sauce
 * or a stock cube forced a manual entry and a recipe ingredient carried
 * reference values instead of the app's own numbers.
 */

const ADDED = [
  'bacon-medallions', 'ricotta', 'skyr-plain', 'cornflour',
  'black-beans-canned-drained', 'sultanas-dried', 'pineapple-canned-in-juice',
  'sesame-oil-toasted', 'soy-sauce-light', 'vegetable-stock-made-up',
];

describe('the staples added with the recipe book', () => {
  it.each(ADDED)('%s is in the catalogue', (id) => {
    expect(COMMON_FOODS.find((f) => f.id === id)).toBeDefined();
  });

  it('gives every one a complete set of macros', () => {
    for (const id of ADDED) {
      const f = COMMON_FOODS.find((x) => x.id === id)!;
      for (const k of ['calories','carbs_g','protein_g','fat_g','fibre_g'] as const) {
        expect(typeof f[k]).toBe('number');
        expect(f[k]).toBeGreaterThanOrEqual(0);
      }
      expect(f.serving_g).toBeGreaterThan(0);
    }
  });

  // Sold and poured by volume. Without this the picker asks for grams of soy
  // sauce, which is the bug foodUnits exists to prevent.
  it.each(['sesame-oil-toasted', 'soy-sauce-light', 'vegetable-stock-made-up'])(
    '%s is measured in millilitres', (id) => {
      expect(COMMON_FOODS.find((f) => f.id === id)!.unit).toBe('ml');
    });

  // The whole point: they have to be findable, or adding them changes nothing.
  it.each([
    ['soy sauce',  'soy-sauce-light'],
    ['skyr',       'skyr-plain'],
    ['ricotta',    'ricotta'],
    ['cornflour',  'cornflour'],
    ['sultanas',   'sultanas-dried'],
    ['stock',      'vegetable-stock-made-up'],
  ])('searching %s finds %s', (query, id) => {
    expect(searchCommonFoods(query).map((f) => f.id)).toContain(id);
  });

  // Sultanas were previously priced as raisins in a recipe. They are a
  // different food and should not resolve to the raisin entry.
  it('keeps sultanas distinct from raisins', () => {
    const s = COMMON_FOODS.find((f) => f.id === 'sultanas-dried')!;
    const r = COMMON_FOODS.find((f) => f.id === 'raisins-dried')!;
    expect(s.calories).not.toBe(r.calories);
  });
});
