import { COMMON_FOODS, searchCommonFoods } from '@/lib/commonFoods';

// Card 40: the list had 193 items with no coffee and no juice, so the things
// people drink every day forced a barcode scan or a manual entry.
describe('drinks', () => {
  const find = (q: string) => searchCommonFoods(q);

  it.each([
    ['tea'], ['coffee'], ['espresso'], ['latte'], ['cappuccino'],
    ['orange juice'], ['apple juice'], ['squash'], ['smoothie'],
    ['oat milk'], ['almond milk'], ['soya milk'],
    ['lager'], ['wine'], ['spirit'], ['gin'],
  ])('finds %s by search', (term) => {
    expect(find(term).length).toBeGreaterThan(0);
  });

  // Without this the UI calls a pint 568 grams.
  it('measures every drink in millilitres', () => {
    const drinkIds = [
      'tea-black-infusion','coffee-black-brewed','orange-juice-unsweetened',
      'lager-4-percent','wine-red','spirit-40-percent','latte-semi-skimmed',
      'oat-milk','squash-regular','gin-and-slimline-tonic',
    ];
    const wrong = drinkIds.filter((id) => COMMON_FOODS.find((f) => f.id === id)?.unit !== 'ml');
    expect(wrong).toEqual([]);
  });

  // A default portion of 100 ml is nobody's cup of tea or glass of wine.
  it('defaults to a realistic portion, not 100 ml', () => {
    const expected: Record<string, number> = {
      'tea-black-infusion':   250,   // mug
      'coffee-black-brewed':  250,   // mug
      'orange-juice-unsweetened': 200, // glass
      'lager-4-percent':      568,   // pint
      'wine-red':             175,   // standard UK glass
      'wine-sparkling':       125,   // flute
      'spirit-40-percent':     25,   // single measure
    };
    for (const [id, serving] of Object.entries(expected)) {
      expect(COMMON_FOODS.find((f) => f.id === id)!.serving_g).toBe(serving);
    }
  });

  it('gives every drink a complete set of macros including fibre', () => {
    const bad: string[] = [];
    for (const f of COMMON_FOODS.filter((x) => x.unit === 'ml')) {
      for (const k of ['calories','carbs_g','protein_g','fat_g','fibre_g'] as const) {
        const v = f[k];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) bad.push(`${f.id}.${k}=${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // Macros are per 100, so the energy should roughly reconcile with the macros
  // that carry it. Alcohol is exempt: ethanol is 7 kcal/g and is not a macro
  // field, so a spirit legitimately shows 222 kcal against zero carbs.
  it('has energy consistent with its macros for non-alcoholic drinks', () => {
    const alcoholic = new Set([
      'lager-4-percent','bitter-ale','wine-red','wine-white-dry',
      'wine-sparkling','spirit-40-percent','gin-and-slimline-tonic',
    ]);
    const off: string[] = [];
    for (const f of COMMON_FOODS.filter((x) => x.unit === 'ml' && !alcoholic.has(x.id))) {
      const fromMacros = f.carbs_g * 4 + f.protein_g * 4 + f.fat_g * 9;
      const tolerance  = Math.max(5, f.calories * 0.25);
      if (Math.abs(fromMacros - f.calories) > tolerance) {
        off.push(`${f.id}: macros imply ${fromMacros.toFixed(1)} kcal, listed ${f.calories}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('has no duplicate ids anywhere in the list', () => {
    const ids = COMMON_FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
