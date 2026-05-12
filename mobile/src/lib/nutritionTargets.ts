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

export const LOAD_LABELS: Record<TrainingLoad, string> = {
  rest:     'Rest',
  easy:     'Easy',
  moderate: 'Moderate',
  hard:     'Hard',
};
