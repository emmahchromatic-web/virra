import { getNutritionTargets } from '@/lib/nutritionTargets';

describe('getNutritionTargets', () => {
  it('returns phase-specific targets when phase is provided', () => {
    const t = getNutritionTargets('luteal', 'hard');
    expect(t.calories).toBe(2550);
    expect(t.carbs_g).toBe(310);
    expect(t.protein_g).toBe(145);
    expect(t.fat_g).toBe(75);
  });

  it('returns flat targets when phase is null', () => {
    const t = getNutritionTargets(null, 'easy');
    expect(t.calories).toBeGreaterThan(0);
    expect(t.carbs_g).toBeGreaterThan(0);
    expect(t.protein_g).toBeGreaterThan(0);
    expect(t.fat_g).toBeGreaterThan(0);
  });

  it('flat targets scale with training load', () => {
    const rest = getNutritionTargets(null, 'rest');
    const hard = getNutritionTargets(null, 'hard');
    expect(hard.calories).toBeGreaterThan(rest.calories);
    expect(hard.carbs_g).toBeGreaterThan(rest.carbs_g);
  });

  it('flat targets are within plausible range', () => {
    const t = getNutritionTargets(null, 'moderate');
    expect(t.calories).toBeGreaterThanOrEqual(1500);
    expect(t.calories).toBeLessThanOrEqual(3500);
  });

  it('all four loads return flat targets without error', () => {
    for (const load of ['rest', 'easy', 'moderate', 'hard'] as const) {
      expect(() => getNutritionTargets(null, load)).not.toThrow();
    }
  });
});
