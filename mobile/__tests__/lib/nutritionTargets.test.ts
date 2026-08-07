import {
  getNutritionTargets,
  computePersonalisedTargets,
  resolveNutritionTargets,
  buildPersonalMetrics,
  ageFromDob,
  isPersonalised,
  type PersonalMetrics,
  type TrainingLoad,
} from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';

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

// The engine is calibrated against this reference athlete — the same body the
// legacy lookup table assumed (~60kg recreational female runner).
const REFERENCE: PersonalMetrics = { weightKg: 60, heightCm: 165, age: 30 };
const LOADS: TrainingLoad[] = ['rest', 'easy', 'moderate', 'hard'];
const PHASES: CyclePhase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

describe('computePersonalisedTargets — reference athlete', () => {
  // With no phase data the engine should land close to the legacy flat table,
  // proving the constants are calibrated rather than arbitrary.
  it('reproduces the legacy flat-table calories within 5%', () => {
    for (const load of LOADS) {
      const table = getNutritionTargets(null, load);
      const engine = computePersonalisedTargets(REFERENCE, null, load);
      const drift = Math.abs(engine.calories - table.calories) / table.calories;
      expect(drift).toBeLessThan(0.05);
    }
  });

  it('matches the legacy per-kg protein and carbs closely', () => {
    const table = getNutritionTargets(null, 'moderate');
    const engine = computePersonalisedTargets(REFERENCE, null, 'moderate');
    expect(Math.abs(engine.protein_g - table.protein_g)).toBeLessThanOrEqual(3);
    expect(Math.abs(engine.carbs_g - table.carbs_g)).toBeLessThanOrEqual(3);
  });
});

describe('computePersonalisedTargets — structural guarantees', () => {
  it('is monotonic in training load for calories, carbs and protein', () => {
    const series = LOADS.map((l) => computePersonalisedTargets(REFERENCE, null, l));
    for (let i = 1; i < series.length; i++) {
      expect(series[i].calories).toBeGreaterThan(series[i - 1].calories);
      expect(series[i].carbs_g).toBeGreaterThan(series[i - 1].carbs_g);
      expect(series[i].protein_g).toBeGreaterThan(series[i - 1].protein_g);
    }
  });

  it('scales calories and protein up with bodyweight', () => {
    const light = computePersonalisedTargets({ ...REFERENCE, weightKg: 50 }, null, 'moderate');
    const heavy = computePersonalisedTargets({ ...REFERENCE, weightKg: 75 }, null, 'moderate');
    expect(heavy.calories).toBeGreaterThan(light.calories);
    expect(heavy.protein_g).toBeGreaterThan(light.protein_g);
  });

  it('keeps macro calories from overshooting the calorie target', () => {
    for (const load of LOADS) {
      for (const phase of [...PHASES, null]) {
        const t = computePersonalisedTargets(REFERENCE, phase, load);
        const macroKcal = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
        // Fat is the exact remainder unless the floor binds, so macro kcal
        // tracks the target closely rather than ballooning past it.
        expect(macroKcal).toBeLessThan(t.calories * 1.1);
        expect(macroKcal).toBeGreaterThan(t.calories * 0.9);
      }
    }
  });

  it('enforces the fat floor at very low intake', () => {
    // A tiny body on a rest day drives the remainder below the 0.9 g/kg floor.
    const tiny = computePersonalisedTargets({ weightKg: 40, heightCm: 150, age: 55 }, null, 'rest');
    expect(tiny.fat_g).toBeGreaterThanOrEqual(Math.round(40 * 0.9) - 1);
  });

  it('clamps absurd inputs instead of producing garbage', () => {
    const t = computePersonalisedTargets({ weightKg: 5000, heightCm: 5, age: 900 }, null, 'moderate');
    expect(Number.isFinite(t.calories)).toBe(true);
    expect(t.calories).toBeGreaterThan(0);
  });
});

describe('cycle-phase modulation', () => {
  it('gives luteal more calories and carbs than menstrual at the same load', () => {
    const luteal = computePersonalisedTargets(REFERENCE, 'luteal', 'moderate');
    const menstrual = computePersonalisedTargets(REFERENCE, 'menstrual', 'moderate');
    expect(luteal.calories).toBeGreaterThan(menstrual.calories);
    expect(luteal.carbs_g).toBeGreaterThan(menstrual.carbs_g);
  });

  it('modulates upward in luteal versus an unmodulated null phase', () => {
    const flat = computePersonalisedTargets(REFERENCE, null, 'easy');
    const luteal = computePersonalisedTargets(REFERENCE, 'luteal', 'easy');
    expect(luteal.calories).toBeGreaterThan(flat.calories);
  });
});

describe('resolveNutritionTargets — fallback behaviour', () => {
  it('personalises when metrics are complete', () => {
    expect(resolveNutritionTargets(REFERENCE, 'luteal', 'hard')).toEqual(
      computePersonalisedTargets(REFERENCE, 'luteal', 'hard'),
    );
  });

  it('falls back to the table when metrics are missing or partial', () => {
    const table = getNutritionTargets('luteal', 'hard');
    expect(resolveNutritionTargets(null, 'luteal', 'hard')).toEqual(table);
    expect(
      resolveNutritionTargets({ weightKg: 60, heightCm: null as unknown as number, age: 30 }, 'luteal', 'hard'),
    ).toEqual(table);
    expect(resolveNutritionTargets({ weightKg: 0, heightCm: 165, age: 30 }, 'luteal', 'hard')).toEqual(table);
  });

  it('isPersonalised reflects metric completeness', () => {
    expect(isPersonalised(REFERENCE)).toBe(true);
    expect(isPersonalised(null)).toBe(false);
    expect(isPersonalised({ weightKg: 60, heightCm: 165 })).toBe(false);
  });
});

describe('buildPersonalMetrics + ageFromDob', () => {
  const TODAY = new Date('2026-08-05T12:00:00Z');

  it('computes whole-year age accounting for month/day', () => {
    expect(ageFromDob('1996-01-01', TODAY)).toBe(30);
    expect(ageFromDob('1996-08-05', TODAY)).toBe(30); // birthday today
    expect(ageFromDob('1996-08-06', TODAY)).toBe(29); // birthday tomorrow
  });

  it('returns null for an unparseable birth date', () => {
    expect(ageFromDob('not-a-date', TODAY)).toBeNull();
  });

  it('builds metrics only when weight, height and DOB are all present', () => {
    expect(
      buildPersonalMetrics({ weightKg: 62, heightCm: 168, dateOfBirth: '1996-01-01' }, TODAY),
    ).toEqual({ weightKg: 62, heightCm: 168, age: 30 });

    expect(buildPersonalMetrics({ weightKg: null, heightCm: 168, dateOfBirth: '1996-01-01' }, TODAY)).toBeNull();
    expect(buildPersonalMetrics({ weightKg: 62, heightCm: null, dateOfBirth: '1996-01-01' }, TODAY)).toBeNull();
    expect(buildPersonalMetrics({ weightKg: 62, heightCm: 168, dateOfBirth: null }, TODAY)).toBeNull();
  });
});
