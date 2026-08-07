import type { CyclePhase } from '@/store/cycle';

export type TrainingLoad = 'rest' | 'easy' | 'moderate' | 'hard';

export interface NutritionTargets {
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
  fibre_g:   number;
}

// Science-based targets for a recreational female runner (~60kg, 40–60km/week)
// Luteal gets highest carbs overall; ovulatory/follicular get higher protein for adaptation
const TARGETS: Record<CyclePhase, Record<TrainingLoad, NutritionTargets>> = {
  menstrual: {
    rest:     { calories: 1750, carbs_g: 175, protein_g: 100, fat_g: 65, fibre_g: 25 },
    easy:     { calories: 1950, carbs_g: 205, protein_g: 110, fat_g: 68, fibre_g: 27 },
    moderate: { calories: 2150, carbs_g: 235, protein_g: 120, fat_g: 70, fibre_g: 30 },
    hard:     { calories: 2350, carbs_g: 265, protein_g: 130, fat_g: 72, fibre_g: 32 },
  },
  follicular: {
    rest:     { calories: 1800, carbs_g: 185, protein_g: 105, fat_g: 65, fibre_g: 25 },
    easy:     { calories: 2050, carbs_g: 220, protein_g: 120, fat_g: 68, fibre_g: 27 },
    moderate: { calories: 2350, carbs_g: 265, protein_g: 138, fat_g: 68, fibre_g: 30 },
    hard:     { calories: 2650, carbs_g: 315, protein_g: 155, fat_g: 68, fibre_g: 32 },
  },
  ovulatory: {
    rest:     { calories: 1850, carbs_g: 195, protein_g: 108, fat_g: 65, fibre_g: 25 },
    easy:     { calories: 2100, carbs_g: 235, protein_g: 125, fat_g: 68, fibre_g: 27 },
    moderate: { calories: 2400, carbs_g: 280, protein_g: 142, fat_g: 68, fibre_g: 30 },
    hard:     { calories: 2700, carbs_g: 330, protein_g: 158, fat_g: 68, fibre_g: 32 },
  },
  luteal: {
    rest:     { calories: 1900, carbs_g: 215, protein_g: 105, fat_g: 70, fibre_g: 25 },
    easy:     { calories: 2100, carbs_g: 245, protein_g: 115, fat_g: 72, fibre_g: 27 },
    moderate: { calories: 2300, carbs_g: 275, protein_g: 130, fat_g: 72, fibre_g: 30 },
    hard:     { calories: 2550, carbs_g: 310, protein_g: 145, fat_g: 75, fibre_g: 32 },
  },
};

// Flat load-based targets for users without cycle phase data.
// Values are the arithmetic mean across all four phases, rounded to sensible numbers.
const FLAT_TARGETS: Record<TrainingLoad, NutritionTargets> = {
  rest:     { calories: 1825, carbs_g: 192, protein_g: 105, fat_g: 67, fibre_g: 25 },
  easy:     { calories: 2050, carbs_g: 226, protein_g: 118, fat_g: 69, fibre_g: 27 },
  moderate: { calories: 2300, carbs_g: 264, protein_g: 133, fat_g: 70, fibre_g: 30 },
  hard:     { calories: 2563, carbs_g: 305, protein_g: 147, fat_g: 71, fibre_g: 32 },
};

export function getNutritionTargets(phase: CyclePhase | null, load: TrainingLoad): NutritionTargets {
  if (!phase) return FLAT_TARGETS[load];
  return TARGETS[phase][load];
}

// ---------------------------------------------------------------------------
// Personalised engine
// ---------------------------------------------------------------------------
// The tables above assume a ~60kg reference runner. When we know a user's own
// body metrics we compute her targets from first principles instead, and the
// tables become the fallback for users who skipped the body-metrics step.
//
// Calories: female Mifflin-St Jeor resting metabolic rate, scaled by an
// activity factor for the day's training load, then nudged by cycle phase.
// Macros: protein and carbohydrate are set per-kg bodyweight (the athlete
// standard) and modulated by phase; fat fills the remaining calories above a
// floor that protects hormonal health; fibre scales with total intake.
//
// The constants are calibrated so the reference athlete (60kg / 165cm / 30yo)
// reproduces the legacy table's calories and macros closely — see the tests.

export interface PersonalMetrics {
  weightKg: number;
  heightCm: number;
  age:      number;
}

// Whole-day activity factors (PAL) applied to RMR, indexed by the day's load.
const LOAD_PAL: Record<TrainingLoad, number> = {
  rest:     1.40,
  easy:     1.55,
  moderate: 1.75,
  hard:     1.95,
};

// Cycle-phase energy multiplier. Luteal RMR rises ~5%; the menstrual phase
// dips slightly. Absent phase data → no modulation (factor 1).
const PHASE_ENERGY: Record<CyclePhase, number> = {
  menstrual:  0.98,
  follicular: 1.00,
  ovulatory:  1.01,
  luteal:     1.05,
};

// Protein grams per kg bodyweight — repair demand climbs with training load.
const LOAD_PROTEIN_PER_KG: Record<TrainingLoad, number> = {
  rest:     1.75,
  easy:     2.00,
  moderate: 2.20,
  hard:     2.45,
};

// Carbohydrate grams per kg bodyweight — the primary training fuel.
const LOAD_CARB_PER_KG: Record<TrainingLoad, number> = {
  rest:     3.20,
  easy:     3.75,
  moderate: 4.40,
  hard:     5.10,
};

// Carb phase factor — glycogen access is impaired in the luteal phase, so carbs
// go highest there; follicular/ovulatory sit near baseline.
const PHASE_CARB: Record<CyclePhase, number> = {
  menstrual:  0.97,
  follicular: 1.00,
  ovulatory:  1.05,
  luteal:     1.10,
};

// Protein phase factor — luteal protein catabolism rises, so nudge protein up.
const PHASE_PROTEIN: Record<CyclePhase, number> = {
  menstrual:  1.00,
  follicular: 1.02,
  ovulatory:  1.03,
  luteal:     1.05,
};

// Fat never drops below this (g/kg) — guards against low energy availability,
// which disrupts menstrual and bone health in female athletes.
const FAT_FLOOR_PER_KG = 0.9;

// Fibre tracks intake at ~14g per 1000 kcal (standard dietary guidance).
const FIBRE_PER_1000_KCAL = 14;

// Defensive input bounds — clamp so a stray onboarding value can't produce a
// nonsensical target. These are generous physiological limits, not validation.
const WEIGHT_KG_RANGE = { min: 35, max: 200 } as const;
const HEIGHT_CM_RANGE = { min: 120, max: 220 } as const;
const AGE_RANGE       = { min: 12,  max: 90  } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mifflin-St Jeor resting metabolic rate for females (kcal/day). */
function femaleRMR(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export function computePersonalisedTargets(
  metrics: PersonalMetrics,
  phase:   CyclePhase | null,
  load:    TrainingLoad,
): NutritionTargets {
  const weightKg = clamp(metrics.weightKg, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max);
  const heightCm = clamp(metrics.heightCm, HEIGHT_CM_RANGE.min, HEIGHT_CM_RANGE.max);
  const age      = clamp(metrics.age,      AGE_RANGE.min,      AGE_RANGE.max);

  const phaseEnergy  = phase ? PHASE_ENERGY[phase]  : 1;
  const phaseCarb    = phase ? PHASE_CARB[phase]    : 1;
  const phaseProtein = phase ? PHASE_PROTEIN[phase] : 1;

  const calories  = femaleRMR(weightKg, heightCm, age) * LOAD_PAL[load] * phaseEnergy;
  const protein_g = weightKg * LOAD_PROTEIN_PER_KG[load] * phaseProtein;
  const carbs_g   = weightKg * LOAD_CARB_PER_KG[load]    * phaseCarb;

  // Fat fills the calories left after protein/carbs, but never below the floor.
  const remainderFat = (calories - protein_g * 4 - carbs_g * 4) / 9;
  const fat_g        = Math.max(weightKg * FAT_FLOOR_PER_KG, remainderFat);

  const fibre_g = (calories / 1000) * FIBRE_PER_1000_KCAL;

  return {
    calories:  Math.round(calories),
    carbs_g:   Math.round(carbs_g),
    protein_g: Math.round(protein_g),
    fat_g:     Math.round(fat_g),
    fibre_g:   Math.round(fibre_g),
  };
}

function hasCompleteMetrics(m: Partial<PersonalMetrics> | null | undefined): m is PersonalMetrics {
  return (
    !!m &&
    typeof m.weightKg === 'number' && m.weightKg > 0 &&
    typeof m.heightCm === 'number' && m.heightCm > 0 &&
    typeof m.age      === 'number' && m.age      > 0
  );
}

/**
 * Targets tuned to the individual when her metrics are known, otherwise the
 * reference table. This is the single entry point UI code should call.
 */
export function resolveNutritionTargets(
  metrics: Partial<PersonalMetrics> | null | undefined,
  phase:   CyclePhase | null,
  load:    TrainingLoad,
): NutritionTargets {
  if (hasCompleteMetrics(metrics)) return computePersonalisedTargets(metrics, phase, load);
  return getNutritionTargets(phase, load);
}

/** True when the resolver will personalise rather than fall back to the table. */
export function isPersonalised(metrics: Partial<PersonalMetrics> | null | undefined): boolean {
  return hasCompleteMetrics(metrics);
}

/**
 * Build metrics from raw profile fields. Returns null unless weight, height and
 * a birth date are all present — the resolver then falls back to the table.
 * `today` is injectable for deterministic tests.
 */
export function buildPersonalMetrics(
  fields: { weightKg: number | null; heightCm: number | null; dateOfBirth: string | null },
  today: Date = new Date(),
): PersonalMetrics | null {
  const { weightKg, heightCm, dateOfBirth } = fields;
  if (weightKg == null || heightCm == null || !dateOfBirth) return null;

  const age = ageFromDob(dateOfBirth, today);
  if (age == null) return null;

  return { weightKg, heightCm, age };
}

/** Whole years from an ISO 'YYYY-MM-DD' birth date. Null if unparseable. */
export function ageFromDob(dateOfBirth: string, today: Date = new Date()): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;

  return age;
}

export const LOAD_LABELS: Record<TrainingLoad, string> = {
  rest:     'Rest',
  easy:     'Easy',
  moderate: 'Moderate',
  hard:     'Hard',
};
