import { computeFuellingGap, describeFuelling, type FuellingAlignment } from '@/lib/insightMetrics';

// A day's worth of targets loosely matching the follicular/moderate row.
const TARGETS = { calories: 2350, carbs_g: 265, protein_g: 138, fat_g: 68, fibre_g: 30 };

const entry = (meal: string, m: Partial<Record<string, number>>) => ({
  meal_type: meal, calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0, fibre_g: 0, ...m,
});

const day = (entries: any[]) => ({ targets_json: TARGETS, food_entries: entries });

describe('computeFuellingGap', () => {
  it('returns nothing when there are no under-fuelled days', () => {
    expect(computeFuellingGap([])).toBeNull();
  });

  // Protein is short by ~50%; carbs are only a little under. Raw grams would
  // pick carbs, which is exactly the failure the share-of-target rule avoids.
  it('picks the macro furthest below target as a share of its own target', () => {
    const d = day([
      entry('breakfast', { carbs_g: 80, protein_g: 10, fat_g: 20, fibre_g: 9 }),
      entry('lunch',     { carbs_g: 80, protein_g: 25, fat_g: 22, fibre_g: 9 }),
      entry('dinner',    { carbs_g: 80, protein_g: 34, fat_g: 22, fibre_g: 9 }),
    ]);
    const gap = computeFuellingGap([d, d]);
    expect(gap?.macro).toBe('protein_g');
    expect(gap?.avgShortfallG).toBe(69); // 138 target - 69 eaten
  });

  it('names the meal holding least of the offending macro', () => {
    const d = day([
      entry('breakfast', { carbs_g: 80, protein_g: 5,  fat_g: 20, fibre_g: 9 }),
      entry('lunch',     { carbs_g: 80, protein_g: 30, fat_g: 22, fibre_g: 9 }),
      entry('dinner',    { carbs_g: 80, protein_g: 34, fat_g: 22, fibre_g: 9 }),
    ]);
    expect(computeFuellingGap([d, d, d])?.meal).toBe('breakfast');
  });

  // Low on calories but proportionally fine on every macro: there is no single
  // useful thing to change, so it must not invent one.
  it('returns nothing when every macro sits inside the margin', () => {
    const d = day([
      entry('breakfast', { carbs_g: 85, protein_g: 45, fat_g: 22, fibre_g: 10 }),
      entry('lunch',     { carbs_g: 85, protein_g: 45, fat_g: 22, fibre_g: 10 }),
      entry('dinner',    { carbs_g: 85, protein_g: 45, fat_g: 22, fibre_g: 10 }),
    ]);
    expect(computeFuellingGap([d, d])).toBeNull();
  });

  it('ignores macros with no target rather than counting them as a total miss', () => {
    const noTargets = { targets_json: { calories: 2000 }, food_entries: [entry('lunch', {})] };
    expect(computeFuellingGap([noTargets])).toBeNull();
  });
});

describe('describeFuelling', () => {
  const withGap: FuellingAlignment = {
    daysOverTarget: 0, daysUnderTarget: 3, daysOnTarget: 2,
    gap: { macro: 'protein_g', avgShortfallG: 28, shortfallPct: 20, meal: 'lunch', daysUnderTarget: 3 },
  };

  it('names the macro, the meal, a food, and why it matters', () => {
    const text = describeFuelling(withGap)!;
    expect(text).toContain('3 days');
    expect(text).toContain('protein');
    expect(text).toContain('28g');
    expect(text).toContain('Lunch');
    expect(text).toContain('Greek yoghurt');
    expect(text).toContain('adaptation');
  });

  it('says it is volume, not shape, when no macro stands out', () => {
    const text = describeFuelling({ daysOverTarget: 0, daysUnderTarget: 4, daysOnTarget: 1, gap: null })!;
    expect(text).toContain('no single');
    expect(text).not.toContain('undefined');
  });

  // The margin is the point: people should not be told off for a 4% miss.
  it('reassures and states the margin when fuelling is on track', () => {
    const text = describeFuelling({ daysOverTarget: 0, daysUnderTarget: 1, daysOnTarget: 5, gap: null })!;
    expect(text).toContain('well matched');
    expect(text).toContain('10%');
  });

  it('is quiet when there is no data at all', () => {
    expect(describeFuelling(null)).toBeNull();
    expect(describeFuelling({ daysOverTarget: 0, daysUnderTarget: 0, daysOnTarget: 0, gap: null })).toBeNull();
  });
});
