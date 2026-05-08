export interface VirraFood {
  id:        string;
  name:      string;
  detail?:   string;   // e.g. 'raw', 'cooked', 'canned in water'
  serving_g: number;   // suggested default serving in grams
  // all macros are per 100g
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
}

export const COMMON_FOODS: VirraFood[] = [
  // Carbs & grains
  { id: 'oats',           name: 'Oats',            detail: 'raw',            serving_g: 80,  calories: 389, carbs_g: 66,  protein_g: 17,  fat_g: 7   },
  { id: 'white-rice',     name: 'White rice',       detail: 'cooked',         serving_g: 200, calories: 130, carbs_g: 28,  protein_g: 2.7, fat_g: 0.3 },
  { id: 'brown-rice',     name: 'Brown rice',       detail: 'cooked',         serving_g: 200, calories: 112, carbs_g: 24,  protein_g: 2.6, fat_g: 0.9 },
  { id: 'pasta',          name: 'Pasta',            detail: 'cooked',         serving_g: 220, calories: 131, carbs_g: 25,  protein_g: 5,   fat_g: 1.1 },
  { id: 'wholegrain-bread', name: 'Wholegrain bread', detail: '1 slice ≈ 40g', serving_g: 40, calories: 247, carbs_g: 43,  protein_g: 9,   fat_g: 3.4 },
  { id: 'bagel',          name: 'Bagel',            detail: 'plain',          serving_g: 100, calories: 250, carbs_g: 50,  protein_g: 10,  fat_g: 1.6 },
  { id: 'sweet-potato',   name: 'Sweet potato',     detail: 'baked',          serving_g: 150, calories: 90,  carbs_g: 21,  protein_g: 2,   fat_g: 0.1 },
  { id: 'white-potato',   name: 'White potato',     detail: 'boiled',         serving_g: 180, calories: 87,  carbs_g: 20,  protein_g: 1.9, fat_g: 0.1 },
  { id: 'quinoa',         name: 'Quinoa',           detail: 'cooked',         serving_g: 185, calories: 120, carbs_g: 22,  protein_g: 4.4, fat_g: 1.9 },
  { id: 'granola',        name: 'Granola',                                     serving_g: 60,  calories: 450, carbs_g: 65,  protein_g: 10,  fat_g: 16  },
  // Fruit
  { id: 'banana',         name: 'Banana',                                      serving_g: 120, calories: 89,  carbs_g: 23,  protein_g: 1.1, fat_g: 0.3 },
  { id: 'blueberries',    name: 'Blueberries',                                 serving_g: 100, calories: 57,  carbs_g: 14,  protein_g: 0.7, fat_g: 0.3 },
  { id: 'apple',          name: 'Apple',                                       serving_g: 150, calories: 52,  carbs_g: 14,  protein_g: 0.3, fat_g: 0.2 },
  { id: 'medjool-dates',  name: 'Medjool dates',    detail: '1 date ≈ 25g',   serving_g: 25,  calories: 277, carbs_g: 75,  protein_g: 1.8, fat_g: 0.2 },
  { id: 'orange-juice',   name: 'Orange juice',                                serving_g: 250, calories: 45,  carbs_g: 10,  protein_g: 0.7, fat_g: 0.2 },
  // Protein
  { id: 'chicken-breast', name: 'Chicken breast',   detail: 'cooked',         serving_g: 150, calories: 165, carbs_g: 0,   protein_g: 31,  fat_g: 3.6 },
  { id: 'salmon',         name: 'Salmon',           detail: 'fillet',         serving_g: 140, calories: 208, carbs_g: 0,   protein_g: 20,  fat_g: 13  },
  { id: 'tuna',           name: 'Tuna',             detail: 'canned in water', serving_g: 120, calories: 116, carbs_g: 0,   protein_g: 26,  fat_g: 1   },
  { id: 'lean-beef-mince', name: 'Lean beef mince', detail: 'cooked',         serving_g: 150, calories: 215, carbs_g: 0,   protein_g: 26,  fat_g: 12  },
  { id: 'eggs-whole',     name: 'Eggs',             detail: '1 large ≈ 60g',  serving_g: 60,  calories: 155, carbs_g: 1.1, protein_g: 13,  fat_g: 11  },
  { id: 'egg-whites',     name: 'Egg whites',       detail: '1 white ≈ 35g',  serving_g: 35,  calories: 52,  carbs_g: 0.7, protein_g: 11,  fat_g: 0.2 },
  { id: 'greek-yogurt',   name: 'Greek yogurt',     detail: 'full fat',       serving_g: 200, calories: 97,  carbs_g: 6,   protein_g: 9,   fat_g: 5   },
  { id: 'cottage-cheese', name: 'Cottage cheese',                              serving_g: 150, calories: 98,  carbs_g: 3.4, protein_g: 11,  fat_g: 4.3 },
  { id: 'tofu',           name: 'Tofu',             detail: 'firm',           serving_g: 150, calories: 76,  carbs_g: 1.9, protein_g: 8,   fat_g: 4.8 },
  { id: 'lentils',        name: 'Lentils',          detail: 'cooked',         serving_g: 200, calories: 116, carbs_g: 20,  protein_g: 9,   fat_g: 0.4 },
  { id: 'chickpeas',      name: 'Chickpeas',        detail: 'cooked',         serving_g: 200, calories: 164, carbs_g: 27,  protein_g: 9,   fat_g: 2.6 },
  { id: 'edamame',        name: 'Edamame',          detail: 'shelled',        serving_g: 150, calories: 121, carbs_g: 9,   protein_g: 12,  fat_g: 5   },
  { id: 'whey-protein',   name: 'Protein powder',   detail: 'whey, 1 scoop ≈ 30g', serving_g: 30, calories: 375, carbs_g: 6, protein_g: 75, fat_g: 5 },
  // Dairy & fats
  { id: 'full-fat-milk',  name: 'Milk',             detail: 'full fat',       serving_g: 200, calories: 61,  carbs_g: 4.8, protein_g: 3.2, fat_g: 3.3 },
  { id: 'skimmed-milk',   name: 'Milk',             detail: 'skimmed',        serving_g: 200, calories: 34,  carbs_g: 5,   protein_g: 3.4, fat_g: 0.1 },
  { id: 'avocado',        name: 'Avocado',          detail: '½ ≈ 75g',        serving_g: 75,  calories: 160, carbs_g: 9,   protein_g: 2,   fat_g: 15  },
  { id: 'almonds',        name: 'Almonds',                                     serving_g: 30,  calories: 579, carbs_g: 22,  protein_g: 21,  fat_g: 50  },
  { id: 'peanut-butter',  name: 'Peanut butter',                               serving_g: 30,  calories: 588, carbs_g: 20,  protein_g: 25,  fat_g: 50  },
  { id: 'mixed-nuts',     name: 'Mixed nuts',                                  serving_g: 30,  calories: 607, carbs_g: 21,  protein_g: 20,  fat_g: 52  },
  { id: 'olive-oil',      name: 'Olive oil',                                   serving_g: 15,  calories: 884, carbs_g: 0,   protein_g: 0,   fat_g: 100 },
  // Fuel & extras
  { id: 'dark-chocolate', name: 'Dark chocolate',   detail: '70%+',           serving_g: 30,  calories: 600, carbs_g: 46,  protein_g: 7.8, fat_g: 43  },
  { id: 'honey',          name: 'Honey',                                       serving_g: 20,  calories: 304, carbs_g: 82,  protein_g: 0.3, fat_g: 0   },
  { id: 'coconut-water',  name: 'Coconut water',                               serving_g: 330, calories: 19,  carbs_g: 4.7, protein_g: 0.2, fat_g: 0.2 },
  { id: 'spinach',        name: 'Spinach',          detail: 'raw',            serving_g: 80,  calories: 23,  carbs_g: 3.6, protein_g: 2.9, fat_g: 0.4 },
  { id: 'energy-gel',     name: 'Energy gel',       detail: 'generic, 1 sachet ≈ 40g', serving_g: 40, calories: 100, carbs_g: 25, protein_g: 0, fat_g: 0 },
];

export function searchCommonFoods(query: string): VirraFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMON_FOODS;
  return COMMON_FOODS.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.detail?.toLowerCase().includes(q) ?? false),
  );
}

export function scaleFood(
  food: VirraFood,
  grams: number,
): { calories: number; carbs_g: number; protein_g: number; fat_g: number } {
  const f = grams / 100;
  return {
    calories:  Math.round(food.calories  * f * 10) / 10,
    carbs_g:   Math.round(food.carbs_g   * f * 10) / 10,
    protein_g: Math.round(food.protein_g * f * 10) / 10,
    fat_g:     Math.round(food.fat_g     * f * 10) / 10,
  };
}
