import type { FoodUnit } from './foodUnits';

export type MealAffinity = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface VirraFood {
  id:        string;
  name:      string;
  detail?:   string;
  // Quantity unit. Omit for foods sold by mass; 'g' is the default everywhere.
  // Set 'ml' for anything sold by volume (oils, drinks) so the UI stops calling
  // a pint 500 grams. The numbers are unchanged: 1 ml ≈ 1 g for these.
  unit?:     FoodUnit;
  serving_g: number;
  calories:  number;
  carbs_g:   number;
  protein_g: number;
  fat_g:     number;
  fibre_g:   number;
  // Strong meal-context bias. Omit for universal ingredients (raw veg, oils,
  // sugars) that don't favour any particular slot. Used for ordering only
  // missing affinity never hides a food, it just won't get the boost.
  meals?:    MealAffinity[];
}

export const COMMON_FOODS: VirraFood[] = [
  // Meat & Poultry
  { id: 'chicken-breast-skinless-raw', name: 'Chicken breast, skinless', detail: 'raw', serving_g: 100, calories: 106, carbs_g: 0, protein_g: 22.3, fat_g: 1.7, fibre_g: 0, meals: ['lunch', 'dinner'] },
  { id: 'chicken-thigh-skinless-boneless-raw', name: 'Chicken thigh, skinless boneless', detail: 'raw', serving_g: 100, calories: 119, carbs_g: 0, protein_g: 19.8, fat_g: 4.3, fibre_g: 0, meals: ['lunch', 'dinner'] },
  { id: 'chicken-leg-with-skin-raw', name: 'Chicken leg, with skin', detail: 'raw', serving_g: 100, calories: 178, carbs_g: 0, protein_g: 17.5, fat_g: 12, fibre_g: 0, meals: ['dinner'] },
  { id: 'whole-chicken-with-skin-raw', name: 'Whole chicken, with skin', detail: 'raw', serving_g: 100, calories: 197, carbs_g: 0, protein_g: 17.6, fat_g: 14, fibre_g: 0, meals: ['dinner'] },
  { id: 'turkey-breast-skinless-raw', name: 'Turkey breast, skinless', detail: 'raw', serving_g: 100, calories: 105, carbs_g: 0, protein_g: 22.6, fat_g: 1.4, fibre_g: 0, meals: ['lunch', 'dinner'] },
  { id: 'turkey-mince-raw', name: 'Turkey mince', detail: 'raw', serving_g: 100, calories: 150, carbs_g: 0, protein_g: 21, fat_g: 7.5, fibre_g: 0, meals: ['lunch', 'dinner'] },
  { id: 'beef-mince-lean-5-fat-raw', name: 'Beef mince, lean (5% fat)', detail: 'raw', serving_g: 100, calories: 137, carbs_g: 0, protein_g: 21.5, fat_g: 5, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-mince-standard-15-20-fat-raw', name: 'Beef mince, standard (15-20% fat)', detail: 'raw', serving_g: 100, calories: 220, carbs_g: 0, protein_g: 18, fat_g: 16, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-rump-steak-raw-lean', name: 'Beef rump steak', detail: 'raw, lean', serving_g: 100, calories: 174, carbs_g: 0, protein_g: 22, fat_g: 9.7, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-sirloin-steak-raw-lean', name: 'Beef sirloin steak', detail: 'raw, lean', serving_g: 100, calories: 183, carbs_g: 0, protein_g: 21, fat_g: 11, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-ribeye-steak-raw', name: 'Beef ribeye steak', detail: 'raw', serving_g: 100, calories: 230, carbs_g: 0, protein_g: 20, fat_g: 17, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-stewing-steak-chuck-raw', name: 'Beef stewing steak (chuck)', detail: 'raw', serving_g: 100, calories: 145, carbs_g: 0, protein_g: 21, fat_g: 7, fibre_g: 0, meals: ['dinner'] },
  { id: 'beef-brisket-raw', name: 'Beef brisket', detail: 'raw', serving_g: 100, calories: 155, carbs_g: 0, protein_g: 21, fat_g: 8, fibre_g: 0, meals: ['dinner'] },
  { id: 'pork-loin-lean-raw', name: 'Pork loin, lean', detail: 'raw', serving_g: 100, calories: 147, carbs_g: 0, protein_g: 22, fat_g: 6.6, fibre_g: 0, meals: ['dinner'] },
  { id: 'pork-shoulder-raw', name: 'Pork shoulder', detail: 'raw', serving_g: 100, calories: 213, carbs_g: 0, protein_g: 19, fat_g: 15, fibre_g: 0, meals: ['dinner'] },
  { id: 'pork-mince-raw', name: 'Pork mince', detail: 'raw', serving_g: 100, calories: 184, carbs_g: 0, protein_g: 19, fat_g: 12, fibre_g: 0, meals: ['dinner'] },
  { id: 'bacon-back-raw', name: 'Bacon, back', detail: 'raw', serving_g: 100, calories: 215, carbs_g: 0, protein_g: 17, fat_g: 16, fibre_g: 0, meals: ['breakfast'] },
  { id: 'bacon-streaky-raw', name: 'Bacon, streaky', detail: 'raw', serving_g: 100, calories: 305, carbs_g: 0, protein_g: 14, fat_g: 28, fibre_g: 0, meals: ['breakfast'] },
  { id: 'gammon-raw', name: 'Gammon', detail: 'raw', serving_g: 100, calories: 132, carbs_g: 0, protein_g: 21, fat_g: 5, fibre_g: 0, meals: ['dinner'] },
  { id: 'cooked-ham-sliced-as-eaten', name: 'Cooked ham, sliced', detail: 'as eaten', serving_g: 100, calories: 107, carbs_g: 1, protein_g: 18.4, fat_g: 3.3, fibre_g: 0, meals: ['lunch', 'snack'] },
  { id: 'lamb-leg-raw-lean', name: 'Lamb leg', detail: 'raw, lean', serving_g: 100, calories: 200, carbs_g: 0, protein_g: 20, fat_g: 13, fibre_g: 0, meals: ['dinner'] },
  { id: 'lamb-shoulder-raw', name: 'Lamb shoulder', detail: 'raw', serving_g: 100, calories: 235, carbs_g: 0, protein_g: 17, fat_g: 18, fibre_g: 0, meals: ['dinner'] },
  { id: 'lamb-mince-raw', name: 'Lamb mince', detail: 'raw', serving_g: 100, calories: 235, carbs_g: 0, protein_g: 18, fat_g: 18, fibre_g: 0, meals: ['dinner'] },
  { id: 'lamb-chops-raw', name: 'Lamb chops', detail: 'raw', serving_g: 100, calories: 277, carbs_g: 0, protein_g: 16, fat_g: 23, fibre_g: 0, meals: ['dinner'] },
  { id: 'pork-sausage-raw', name: 'Pork sausage', detail: 'raw', serving_g: 100, calories: 290, carbs_g: 9, protein_g: 13, fat_g: 23, fibre_g: 0.5, meals: ['breakfast', 'dinner'] },
  { id: 'lamb-s-liver-raw', name: 'Lamb\'s liver', detail: 'raw', serving_g: 100, calories: 137, carbs_g: 1.6, protein_g: 20, fat_g: 6, fibre_g: 0 },
  { id: 'chicken-liver-raw', name: 'Chicken liver', detail: 'raw', serving_g: 100, calories: 119, carbs_g: 0.7, protein_g: 19, fat_g: 4.5, fibre_g: 0 },

  // Fish & Seafood
  { id: 'cod-fillet-raw', name: 'Cod fillet', detail: 'raw', serving_g: 100, calories: 76, carbs_g: 0, protein_g: 17.4, fat_g: 0.6, fibre_g: 0 },
  { id: 'haddock-fillet-raw', name: 'Haddock fillet', detail: 'raw', serving_g: 100, calories: 81, carbs_g: 0, protein_g: 19, fat_g: 0.6, fibre_g: 0 },
  { id: 'plaice-raw', name: 'Plaice', detail: 'raw', serving_g: 100, calories: 79, carbs_g: 0, protein_g: 17, fat_g: 1.4, fibre_g: 0 },
  { id: 'sea-bass-raw', name: 'Sea bass', detail: 'raw', serving_g: 100, calories: 100, carbs_g: 0, protein_g: 18, fat_g: 2.5, fibre_g: 0 },
  { id: 'salmon-fresh-farmed-raw', name: 'Salmon, fresh (farmed)', detail: 'raw', serving_g: 100, calories: 215, carbs_g: 0, protein_g: 20.4, fat_g: 14.6, fibre_g: 0, meals: ['lunch', 'dinner'] },
  { id: 'salmon-smoked-as-eaten', name: 'Salmon, smoked', detail: 'as eaten', serving_g: 100, calories: 142, carbs_g: 0, protein_g: 25.4, fat_g: 4.5, fibre_g: 0, meals: ['breakfast', 'lunch'] },
  { id: 'tuna-fresh-raw', name: 'Tuna, fresh', detail: 'raw', serving_g: 100, calories: 136, carbs_g: 0, protein_g: 23.3, fat_g: 4.6, fibre_g: 0, meals: ['dinner'] },
  { id: 'tuna-canned-in-spring-water-drained', name: 'Tuna, canned in spring water', detail: 'drained', serving_g: 100, calories: 99, carbs_g: 0, protein_g: 23.5, fat_g: 0.6, fibre_g: 0, meals: ['lunch'] },
  { id: 'tuna-canned-in-oil-drained', name: 'Tuna, canned in oil', detail: 'drained', serving_g: 100, calories: 189, carbs_g: 0, protein_g: 27, fat_g: 9, fibre_g: 0, meals: ['lunch'] },
  { id: 'mackerel-fresh-raw', name: 'Mackerel, fresh', detail: 'raw', serving_g: 100, calories: 220, carbs_g: 0, protein_g: 18.7, fat_g: 16.1, fibre_g: 0 },
  { id: 'sardines-canned-in-oil-drained', name: 'Sardines, canned in oil', detail: 'drained', serving_g: 100, calories: 220, carbs_g: 0, protein_g: 23, fat_g: 14, fibre_g: 0 },
  { id: 'sardines-canned-in-tomato-sauce-as-packed', name: 'Sardines, canned in tomato sauce', detail: 'as packed', serving_g: 100, calories: 162, carbs_g: 1.4, protein_g: 17, fat_g: 9.9, fibre_g: 0.5 },
  { id: 'prawns-cooked-peeled-as-eaten', name: 'Prawns, cooked & peeled', detail: 'as eaten', serving_g: 100, calories: 99, carbs_g: 0, protein_g: 22.6, fat_g: 0.9, fibre_g: 0 },
  { id: 'king-prawns-raw-raw', name: 'King prawns, raw', detail: 'raw', serving_g: 100, calories: 71, carbs_g: 0, protein_g: 16.5, fat_g: 0.3, fibre_g: 0 },
  { id: 'mussels-raw', name: 'Mussels', detail: 'raw', serving_g: 100, calories: 74, carbs_g: 3.4, protein_g: 12.1, fat_g: 1.8, fibre_g: 0 },

  // Dairy & Eggs
  { id: 'whole-milk-as-packed', name: 'Whole milk', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 67, carbs_g: 4.7, protein_g: 3.4, fat_g: 4, fibre_g: 0, meals: ['breakfast'] },
  { id: 'semi-skimmed-milk-as-packed', name: 'Semi-skimmed milk', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 50, carbs_g: 4.7, protein_g: 3.5, fat_g: 1.7, fibre_g: 0, meals: ['breakfast'] },
  { id: 'skimmed-milk-as-packed', name: 'Skimmed milk', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 35, carbs_g: 4.8, protein_g: 3.4, fat_g: 0.3, fibre_g: 0, meals: ['breakfast'] },
  { id: 'cheddar-mature-as-eaten', name: 'Cheddar, mature', detail: 'as eaten', serving_g: 100, calories: 416, carbs_g: 0.1, protein_g: 25, fat_g: 35, fibre_g: 0 },
  { id: 'mozzarella-as-eaten', name: 'Mozzarella', detail: 'as eaten', serving_g: 100, calories: 256, carbs_g: 1, protein_g: 18.6, fat_g: 19, fibre_g: 0 },
  { id: 'feta-as-eaten', name: 'Feta', detail: 'as eaten', serving_g: 100, calories: 264, carbs_g: 1.5, protein_g: 14, fat_g: 22, fibre_g: 0 },
  { id: 'cottage-cheese-as-eaten', name: 'Cottage cheese', detail: 'as eaten', serving_g: 100, calories: 101, carbs_g: 3.1, protein_g: 12.6, fat_g: 4.3, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'cream-cheese-full-fat-as-eaten', name: 'Cream cheese, full fat', detail: 'as eaten', serving_g: 100, calories: 245, carbs_g: 4, protein_g: 6, fat_g: 23, fibre_g: 0 },
  { id: 'parmesan-as-eaten', name: 'Parmesan', detail: 'as eaten', serving_g: 100, calories: 415, carbs_g: 0, protein_g: 36, fat_g: 30, fibre_g: 0 },
  { id: 'greek-yogurt-full-fat-10-as-packed', name: 'Greek yogurt, full fat (10%)', detail: 'as packed', serving_g: 100, calories: 133, carbs_g: 4.7, protein_g: 5.7, fat_g: 10, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'greek-yogurt-0-fat-as-packed', name: 'Greek yogurt, 0% fat', detail: 'as packed', serving_g: 100, calories: 57, carbs_g: 4, protein_g: 10, fat_g: 0.4, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'natural-yogurt-whole-as-packed', name: 'Natural yogurt, whole', detail: 'as packed', serving_g: 100, calories: 79, carbs_g: 7.8, protein_g: 5.7, fat_g: 3, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'butter-as-eaten', name: 'Butter', detail: 'as eaten', serving_g: 100, calories: 744, carbs_g: 0.6, protein_g: 0.5, fat_g: 82, fibre_g: 0 },
  { id: 'single-cream-as-packed', name: 'Single cream', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 193, carbs_g: 4, protein_g: 2.4, fat_g: 19, fibre_g: 0 },
  { id: 'double-cream-as-packed', name: 'Double cream', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 467, carbs_g: 2.7, protein_g: 1.7, fat_g: 50, fibre_g: 0 },
  { id: 'soured-cream-as-packed', name: 'Soured cream', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 205, carbs_g: 3.8, protein_g: 2.9, fat_g: 20, fibre_g: 0 },
  { id: 'whole-egg-raw', name: 'Whole egg', detail: 'raw', serving_g: 100, calories: 143, carbs_g: 0.7, protein_g: 12.5, fat_g: 9.7, fibre_g: 0, meals: ['breakfast', 'lunch'] },
  { id: 'egg-white-raw', name: 'Egg white', detail: 'raw', serving_g: 100, calories: 52, carbs_g: 0.7, protein_g: 11, fat_g: 0, fibre_g: 0, meals: ['breakfast'] },
  { id: 'egg-yolk-raw', name: 'Egg yolk', detail: 'raw', serving_g: 100, calories: 322, carbs_g: 1, protein_g: 16, fat_g: 27, fibre_g: 0, meals: ['breakfast'] },

  // Grains, Bread & Starches
  { id: 'white-rice-basmati-dry', name: 'White rice, basmati', detail: 'dry', serving_g: 100, calories: 357, carbs_g: 78, protein_g: 7.4, fat_g: 0.7, fibre_g: 1.4, meals: ['lunch', 'dinner'] },
  { id: 'white-rice-long-grain-dry', name: 'White rice, long grain', detail: 'dry', serving_g: 100, calories: 355, carbs_g: 78, protein_g: 7, fat_g: 0.6, fibre_g: 1.4, meals: ['lunch', 'dinner'] },
  { id: 'brown-rice-dry', name: 'Brown rice', detail: 'dry', serving_g: 100, calories: 357, carbs_g: 76, protein_g: 7.5, fat_g: 2.8, fibre_g: 3.5, meals: ['lunch', 'dinner'] },
  { id: 'pasta-white-dry', name: 'Pasta, white', detail: 'dry', serving_g: 100, calories: 371, carbs_g: 75, protein_g: 13, fat_g: 1.5, fibre_g: 3, meals: ['lunch', 'dinner'] },
  { id: 'pasta-wholemeal-dry', name: 'Pasta, wholemeal', detail: 'dry', serving_g: 100, calories: 348, carbs_g: 67, protein_g: 13, fat_g: 2.5, fibre_g: 8.5, meals: ['lunch', 'dinner'] },
  { id: 'bread-white-sliced-as-eaten', name: 'Bread, white sliced', detail: 'as eaten', serving_g: 100, calories: 235, carbs_g: 49, protein_g: 8.4, fat_g: 1.9, fibre_g: 2.4, meals: ['breakfast', 'lunch'] },
  { id: 'bread-wholemeal-as-eaten', name: 'Bread, wholemeal', detail: 'as eaten', serving_g: 100, calories: 217, carbs_g: 42, protein_g: 9.4, fat_g: 2.5, fibre_g: 6, meals: ['breakfast', 'lunch'] },
  { id: 'bread-sourdough-as-eaten', name: 'Bread, sourdough', detail: 'as eaten', serving_g: 100, calories: 256, carbs_g: 51, protein_g: 9, fat_g: 1.2, fibre_g: 2.4, meals: ['breakfast', 'lunch'] },
  { id: 'pitta-bread-white-as-eaten', name: 'Pitta bread, white', detail: 'as eaten', serving_g: 100, calories: 263, carbs_g: 53, protein_g: 9.2, fat_g: 1.2, fibre_g: 2.7, meals: ['lunch', 'dinner'] },
  { id: 'rolled-porridge-oats-dry', name: 'Rolled / porridge oats', detail: 'dry', serving_g: 100, calories: 363, carbs_g: 60, protein_g: 11, fat_g: 8, fibre_g: 9, meals: ['breakfast'] },
  { id: 'plain-flour-dry', name: 'Plain flour', detail: 'dry', serving_g: 100, calories: 341, carbs_g: 78, protein_g: 9.4, fat_g: 1.3, fibre_g: 3.1 },
  { id: 'self-raising-flour-dry', name: 'Self-raising flour', detail: 'dry', serving_g: 100, calories: 339, carbs_g: 76, protein_g: 9.3, fat_g: 1.2, fibre_g: 3.1 },
  { id: 'wholemeal-flour-dry', name: 'Wholemeal flour', detail: 'dry', serving_g: 100, calories: 324, carbs_g: 64, protein_g: 12, fat_g: 2.5, fibre_g: 9 },
  { id: 'strong-white-bread-flour-dry', name: 'Strong white bread flour', detail: 'dry', serving_g: 100, calories: 341, carbs_g: 75, protein_g: 11, fat_g: 1.3, fibre_g: 3.1 },
  { id: 'couscous-dry', name: 'Couscous', detail: 'dry', serving_g: 100, calories: 376, carbs_g: 77, protein_g: 13, fat_g: 1.9, fibre_g: 5, meals: ['lunch', 'dinner'] },
  { id: 'quinoa-dry', name: 'Quinoa', detail: 'dry', serving_g: 100, calories: 368, carbs_g: 64, protein_g: 14, fat_g: 6.1, fibre_g: 7, meals: ['lunch', 'dinner'] },
  { id: 'bulgur-wheat-dry', name: 'Bulgur wheat', detail: 'dry', serving_g: 100, calories: 342, carbs_g: 76, protein_g: 12, fat_g: 1.3, fibre_g: 12.5, meals: ['lunch', 'dinner'] },
  { id: 'egg-noodles-dry', name: 'Egg noodles', detail: 'dry', serving_g: 100, calories: 384, carbs_g: 73, protein_g: 12, fat_g: 4.4, fibre_g: 3, meals: ['lunch', 'dinner'] },
  { id: 'rice-noodles-dry', name: 'Rice noodles', detail: 'dry', serving_g: 100, calories: 364, carbs_g: 80, protein_g: 5.9, fat_g: 0.6, fibre_g: 1.6, meals: ['lunch', 'dinner'] },
  { id: 'potato-white-raw', name: 'Potato, white', detail: 'raw', serving_g: 100, calories: 75, carbs_g: 17, protein_g: 2, fat_g: 0.2, fibre_g: 1.7 },
  { id: 'new-potato-raw', name: 'New potato', detail: 'raw', serving_g: 100, calories: 70, carbs_g: 16, protein_g: 1.7, fat_g: 0.3, fibre_g: 1.5 },
  { id: 'sweet-potato-raw', name: 'Sweet potato', detail: 'raw', serving_g: 100, calories: 87, carbs_g: 21, protein_g: 1.6, fat_g: 0.3, fibre_g: 2.4 },

  // Legumes & Pulses
  { id: 'baked-beans-in-tomato-sauce-canned', name: 'Baked beans in tomato sauce', detail: 'canned', serving_g: 100, calories: 81, carbs_g: 13, protein_g: 4.7, fat_g: 0.6, fibre_g: 3.7 },
  { id: 'kidney-beans-dry', name: 'Kidney beans', detail: 'dry', serving_g: 100, calories: 332, carbs_g: 60, protein_g: 23, fat_g: 0.8, fibre_g: 15 },
  { id: 'kidney-beans-canned-drained', name: 'Kidney beans', detail: 'canned, drained', serving_g: 100, calories: 100, carbs_g: 17, protein_g: 7, fat_g: 0.5, fibre_g: 6 },
  { id: 'chickpeas-dry', name: 'Chickpeas', detail: 'dry', serving_g: 100, calories: 320, carbs_g: 50, protein_g: 19, fat_g: 6, fibre_g: 12 },
  { id: 'chickpeas-canned-drained', name: 'Chickpeas', detail: 'canned, drained', serving_g: 100, calories: 115, carbs_g: 16, protein_g: 7.2, fat_g: 2.9, fibre_g: 5.4 },
  { id: 'black-beans-dry', name: 'Black beans', detail: 'dry', serving_g: 100, calories: 339, carbs_g: 62, protein_g: 21, fat_g: 1.4, fibre_g: 16 },
  { id: 'butter-beans-canned-drained', name: 'Butter beans', detail: 'canned, drained', serving_g: 100, calories: 77, carbs_g: 13, protein_g: 5.9, fat_g: 0.5, fibre_g: 5 },
  { id: 'cannellini-beans-canned-drained', name: 'Cannellini beans', detail: 'canned, drained', serving_g: 100, calories: 95, carbs_g: 16, protein_g: 7.4, fat_g: 0.5, fibre_g: 6 },
  { id: 'lentils-red-dry', name: 'Lentils, red', detail: 'dry', serving_g: 100, calories: 318, carbs_g: 56, protein_g: 24, fat_g: 1.3, fibre_g: 11 },
  { id: 'lentils-green-brown-dry', name: 'Lentils, green / brown', detail: 'dry', serving_g: 100, calories: 297, carbs_g: 49, protein_g: 24, fat_g: 1.9, fibre_g: 12 },
  { id: 'lentils-green-canned-drained', name: 'Lentils, green', detail: 'canned, drained', serving_g: 100, calories: 99, carbs_g: 17, protein_g: 7.6, fat_g: 0.5, fibre_g: 4 },
  { id: 'split-peas-dry', name: 'Split peas', detail: 'dry', serving_g: 100, calories: 311, carbs_g: 56, protein_g: 22, fat_g: 1, fibre_g: 10 },
  { id: 'tofu-firm-as-packed', name: 'Tofu, firm', detail: 'as packed', serving_g: 100, calories: 73, carbs_g: 0.7, protein_g: 8.1, fat_g: 4.2, fibre_g: 0.4 },
  { id: 'tofu-silken-as-packed', name: 'Tofu, silken', detail: 'as packed', serving_g: 100, calories: 55, carbs_g: 1.6, protein_g: 5.3, fat_g: 3, fibre_g: 0.2 },

  // Vegetables
  { id: 'onion-raw', name: 'Onion', detail: 'raw', serving_g: 100, calories: 36, carbs_g: 7.9, protein_g: 1.2, fat_g: 0.2, fibre_g: 1.4 },
  { id: 'garlic-raw', name: 'Garlic', detail: 'raw', serving_g: 100, calories: 98, carbs_g: 16, protein_g: 7.9, fat_g: 0.6, fibre_g: 4.1 },
  { id: 'leek-raw', name: 'Leek', detail: 'raw', serving_g: 100, calories: 22, carbs_g: 2.9, protein_g: 1.6, fat_g: 0.5, fibre_g: 2.2 },
  { id: 'spring-onion-raw', name: 'Spring onion', detail: 'raw', serving_g: 100, calories: 23, carbs_g: 3, protein_g: 2, fat_g: 0.5, fibre_g: 1.5 },
  { id: 'carrot-raw', name: 'Carrot', detail: 'raw', serving_g: 100, calories: 35, carbs_g: 7.9, protein_g: 0.6, fat_g: 0.3, fibre_g: 2.4 },
  { id: 'parsnip-raw', name: 'Parsnip', detail: 'raw', serving_g: 100, calories: 64, carbs_g: 12.5, protein_g: 1.8, fat_g: 1.1, fibre_g: 4.6 },
  { id: 'swede-raw', name: 'Swede', detail: 'raw', serving_g: 100, calories: 24, carbs_g: 5, protein_g: 0.7, fat_g: 0.3, fibre_g: 1.9 },
  { id: 'beetroot-raw', name: 'Beetroot', detail: 'raw', serving_g: 100, calories: 36, carbs_g: 7.6, protein_g: 1.7, fat_g: 0.1, fibre_g: 1.9 },
  { id: 'broccoli-raw', name: 'Broccoli', detail: 'raw', serving_g: 100, calories: 33, carbs_g: 1.8, protein_g: 4.4, fat_g: 0.9, fibre_g: 2.6 },
  { id: 'cauliflower-raw', name: 'Cauliflower', detail: 'raw', serving_g: 100, calories: 34, carbs_g: 3, protein_g: 3.6, fat_g: 0.9, fibre_g: 1.8 },
  { id: 'cabbage-white-raw', name: 'Cabbage, white', detail: 'raw', serving_g: 100, calories: 27, carbs_g: 5, protein_g: 1.7, fat_g: 0.2, fibre_g: 2.1 },
  { id: 'cabbage-red-raw', name: 'Cabbage, red', detail: 'raw', serving_g: 100, calories: 21, carbs_g: 3.7, protein_g: 1.1, fat_g: 0.2, fibre_g: 2.1 },
  { id: 'brussels-sprouts-raw', name: 'Brussels sprouts', detail: 'raw', serving_g: 100, calories: 42, carbs_g: 4.1, protein_g: 3.5, fat_g: 1.4, fibre_g: 4.1 },
  { id: 'kale-raw', name: 'Kale', detail: 'raw', serving_g: 100, calories: 33, carbs_g: 1.4, protein_g: 3.4, fat_g: 1.6, fibre_g: 3 },
  { id: 'spinach-raw', name: 'Spinach', detail: 'raw', serving_g: 100, calories: 25, carbs_g: 1.6, protein_g: 2.8, fat_g: 0.8, fibre_g: 2.1 },
  { id: 'tomato-raw', name: 'Tomato', detail: 'raw', serving_g: 100, calories: 17, carbs_g: 3.1, protein_g: 0.7, fat_g: 0.3, fibre_g: 1 },
  { id: 'tomatoes-chopped-canned', name: 'Tomatoes, chopped', detail: 'canned', serving_g: 100, calories: 18, carbs_g: 3, protein_g: 1, fat_g: 0.2, fibre_g: 1 },
  { id: 'passata-as-packed', name: 'Passata', detail: 'as packed', serving_g: 100, calories: 35, carbs_g: 6, protein_g: 1.4, fat_g: 0.2, fibre_g: 1.5 },
  { id: 'tomato-pur-e-as-packed', name: 'Tomato puree', detail: 'as packed', serving_g: 100, calories: 76, carbs_g: 14, protein_g: 4.5, fat_g: 0.3, fibre_g: 3.3 },
  { id: 'cucumber-raw', name: 'Cucumber', detail: 'raw', serving_g: 100, calories: 10, carbs_g: 1.5, protein_g: 0.6, fat_g: 0.1, fibre_g: 0.6 },
  { id: 'lettuce-round-raw', name: 'Lettuce, round', detail: 'raw', serving_g: 100, calories: 14, carbs_g: 1.7, protein_g: 0.8, fat_g: 0.5, fibre_g: 0.9 },
  { id: 'rocket-raw', name: 'Rocket', detail: 'raw', serving_g: 100, calories: 25, carbs_g: 2, protein_g: 2.6, fat_g: 0.7, fibre_g: 1.6 },
  { id: 'watercress-raw', name: 'Watercress', detail: 'raw', serving_g: 100, calories: 22, carbs_g: 0.4, protein_g: 3, fat_g: 1, fibre_g: 1.5 },
  { id: 'bell-pepper-red-raw', name: 'Bell pepper, red', detail: 'raw', serving_g: 100, calories: 32, carbs_g: 6, protein_g: 1, fat_g: 0.4, fibre_g: 1.7 },
  { id: 'bell-pepper-green-raw', name: 'Bell pepper, green', detail: 'raw', serving_g: 100, calories: 20, carbs_g: 3, protein_g: 0.9, fat_g: 0.3, fibre_g: 1.7 },
  { id: 'courgette-raw', name: 'Courgette', detail: 'raw', serving_g: 100, calories: 18, carbs_g: 1.8, protein_g: 1.8, fat_g: 0.4, fibre_g: 0.9 },
  { id: 'aubergine-raw', name: 'Aubergine', detail: 'raw', serving_g: 100, calories: 15, carbs_g: 2.2, protein_g: 0.9, fat_g: 0.4, fibre_g: 2 },
  { id: 'mushrooms-button-raw', name: 'Mushrooms, button', detail: 'raw', serving_g: 100, calories: 13, carbs_g: 0.4, protein_g: 1.8, fat_g: 0.5, fibre_g: 1.1 },
  { id: 'mushrooms-chestnut-raw', name: 'Mushrooms, chestnut', detail: 'raw', serving_g: 100, calories: 15, carbs_g: 0.5, protein_g: 2, fat_g: 0.5, fibre_g: 1 },
  { id: 'peas-frozen', name: 'Peas', detail: 'frozen', serving_g: 100, calories: 66, carbs_g: 9.7, protein_g: 5.8, fat_g: 0.9, fibre_g: 5.5 },
  { id: 'green-beans-raw', name: 'Green beans', detail: 'raw', serving_g: 100, calories: 24, carbs_g: 3.2, protein_g: 1.9, fat_g: 0.5, fibre_g: 2.4 },
  { id: 'runner-beans-raw', name: 'Runner beans', detail: 'raw', serving_g: 100, calories: 22, carbs_g: 3, protein_g: 1.6, fat_g: 0.4, fibre_g: 2 },
  { id: 'sweetcorn-canned', name: 'Sweetcorn', detail: 'canned', serving_g: 100, calories: 122, carbs_g: 26.6, protein_g: 2.9, fat_g: 1.2, fibre_g: 1.4 },
  { id: 'sweetcorn-frozen', name: 'Sweetcorn', detail: 'frozen', serving_g: 100, calories: 96, carbs_g: 19, protein_g: 3, fat_g: 1.4, fibre_g: 2 },
  { id: 'celery-raw', name: 'Celery', detail: 'raw', serving_g: 100, calories: 7, carbs_g: 0.9, protein_g: 0.5, fat_g: 0.2, fibre_g: 1.1 },
  { id: 'asparagus-raw', name: 'Asparagus', detail: 'raw', serving_g: 100, calories: 25, carbs_g: 1.4, protein_g: 2.9, fat_g: 0.6, fibre_g: 1.7 },
  { id: 'butternut-squash-raw', name: 'Butternut squash', detail: 'raw', serving_g: 100, calories: 36, carbs_g: 8.3, protein_g: 1.1, fat_g: 0.1, fibre_g: 1.4 },
  { id: 'pumpkin-raw', name: 'Pumpkin', detail: 'raw', serving_g: 100, calories: 13, carbs_g: 2.2, protein_g: 0.7, fat_g: 0.2, fibre_g: 1 },

  // Fruits
  { id: 'apple-with-skin-raw', name: 'Apple, with skin', detail: 'raw', serving_g: 100, calories: 47, carbs_g: 11.6, protein_g: 0.4, fat_g: 0.1, fibre_g: 1.8, meals: ['snack', 'breakfast'] },
  { id: 'banana-raw', name: 'Banana', detail: 'raw', serving_g: 100, calories: 95, carbs_g: 23, protein_g: 1.2, fat_g: 0.3, fibre_g: 1.1, meals: ['breakfast', 'snack'] },
  { id: 'orange-raw', name: 'Orange', detail: 'raw', serving_g: 100, calories: 37, carbs_g: 8.5, protein_g: 1.1, fat_g: 0.1, fibre_g: 1.7, meals: ['breakfast', 'snack'] },
  { id: 'pear-raw', name: 'Pear', detail: 'raw', serving_g: 100, calories: 40, carbs_g: 10, protein_g: 0.3, fat_g: 0.1, fibre_g: 2.2, meals: ['snack'] },
  { id: 'grapes-raw', name: 'Grapes', detail: 'raw', serving_g: 100, calories: 60, carbs_g: 15.4, protein_g: 0.4, fat_g: 0.1, fibre_g: 0.7, meals: ['snack'] },
  { id: 'strawberries-raw', name: 'Strawberries', detail: 'raw', serving_g: 100, calories: 27, carbs_g: 6, protein_g: 0.8, fat_g: 0.1, fibre_g: 2, meals: ['breakfast', 'snack'] },
  { id: 'blueberries-raw', name: 'Blueberries', detail: 'raw', serving_g: 100, calories: 57, carbs_g: 14, protein_g: 0.7, fat_g: 0.3, fibre_g: 2.4, meals: ['breakfast', 'snack'] },
  { id: 'raspberries-raw', name: 'Raspberries', detail: 'raw', serving_g: 100, calories: 25, carbs_g: 4.6, protein_g: 1.4, fat_g: 0.3, fibre_g: 6.5, meals: ['breakfast', 'snack'] },
  { id: 'blackberries-raw', name: 'Blackberries', detail: 'raw', serving_g: 100, calories: 25, carbs_g: 5.1, protein_g: 0.9, fat_g: 0.2, fibre_g: 5.3, meals: ['breakfast', 'snack'] },
  { id: 'lemon-raw', name: 'Lemon', detail: 'raw', serving_g: 100, calories: 19, carbs_g: 3.2, protein_g: 1, fat_g: 0.3, fibre_g: 2.8 },
  { id: 'lime-raw', name: 'Lime', detail: 'raw', serving_g: 100, calories: 9, carbs_g: 1.6, protein_g: 0.6, fat_g: 0.1, fibre_g: 0.6 },
  { id: 'pineapple-raw', name: 'Pineapple', detail: 'raw', serving_g: 100, calories: 41, carbs_g: 10, protein_g: 0.4, fat_g: 0.2, fibre_g: 1.4, meals: ['snack'] },
  { id: 'mango-raw', name: 'Mango', detail: 'raw', serving_g: 100, calories: 57, carbs_g: 14, protein_g: 0.7, fat_g: 0.2, fibre_g: 1.6, meals: ['snack'] },
  { id: 'kiwi-raw', name: 'Kiwi', detail: 'raw', serving_g: 100, calories: 49, carbs_g: 10.6, protein_g: 1.1, fat_g: 0.5, fibre_g: 3, meals: ['breakfast', 'snack'] },
  { id: 'watermelon-raw', name: 'Watermelon', detail: 'raw', serving_g: 100, calories: 31, carbs_g: 7.1, protein_g: 0.5, fat_g: 0.3, fibre_g: 0.4, meals: ['snack'] },
  { id: 'cantaloupe-melon-raw', name: 'Cantaloupe melon', detail: 'raw', serving_g: 100, calories: 19, carbs_g: 4.2, protein_g: 0.6, fat_g: 0.1, fibre_g: 1, meals: ['breakfast', 'snack'] },
  { id: 'avocado-raw', name: 'Avocado', detail: 'raw', serving_g: 100, calories: 190, carbs_g: 1.9, protein_g: 1.9, fat_g: 19.5, fibre_g: 3.4, meals: ['breakfast', 'lunch'] },
  { id: 'plum-raw', name: 'Plum', detail: 'raw', serving_g: 100, calories: 36, carbs_g: 8.8, protein_g: 0.6, fat_g: 0.1, fibre_g: 1.6, meals: ['snack'] },
  { id: 'peach-raw', name: 'Peach', detail: 'raw', serving_g: 100, calories: 33, carbs_g: 7.6, protein_g: 1, fat_g: 0.1, fibre_g: 1.5, meals: ['snack'] },
  { id: 'nectarine-raw', name: 'Nectarine', detail: 'raw', serving_g: 100, calories: 40, carbs_g: 9, protein_g: 1.4, fat_g: 0.1, fibre_g: 1.5, meals: ['snack'] },
  { id: 'cherries-raw', name: 'Cherries', detail: 'raw', serving_g: 100, calories: 48, carbs_g: 10.6, protein_g: 0.9, fat_g: 0.1, fibre_g: 0.9, meals: ['snack'] },
  { id: 'raisins-dried', name: 'Raisins', detail: 'dried', serving_g: 100, calories: 272, carbs_g: 69, protein_g: 2.1, fat_g: 0.4, fibre_g: 2, meals: ['snack', 'breakfast'] },
  { id: 'dates-medjool-dried', name: 'Dates, Medjool', detail: 'dried', serving_g: 100, calories: 277, carbs_g: 75, protein_g: 1.8, fat_g: 0.2, fibre_g: 6.7, meals: ['snack'] },
  { id: 'prunes-dried', name: 'Prunes', detail: 'dried', serving_g: 100, calories: 141, carbs_g: 34, protein_g: 2.5, fat_g: 0.4, fibre_g: 5.7, meals: ['snack', 'breakfast'] },
  { id: 'apricots-dried', name: 'Apricots', detail: 'dried', serving_g: 100, calories: 188, carbs_g: 43, protein_g: 4, fat_g: 0.5, fibre_g: 7.3, meals: ['snack'] },

  // Nuts & Seeds
  { id: 'almonds-raw', name: 'Almonds', detail: 'raw', serving_g: 100, calories: 612, carbs_g: 6.9, protein_g: 21.1, fat_g: 55.8, fibre_g: 7.4 },
  { id: 'walnuts-raw', name: 'Walnuts', detail: 'raw', serving_g: 100, calories: 688, carbs_g: 3.3, protein_g: 14.7, fat_g: 68.5, fibre_g: 5.9 },
  { id: 'cashews-raw', name: 'Cashews', detail: 'raw', serving_g: 100, calories: 583, carbs_g: 18, protein_g: 17.7, fat_g: 48, fibre_g: 3 },
  { id: 'peanuts-raw', name: 'Peanuts', detail: 'raw', serving_g: 100, calories: 564, carbs_g: 12.5, protein_g: 25.6, fat_g: 46, fibre_g: 6.2 },
  { id: 'hazelnuts-raw', name: 'Hazelnuts', detail: 'raw', serving_g: 100, calories: 650, carbs_g: 6, protein_g: 14, fat_g: 63, fibre_g: 6.5 },
  { id: 'pistachios-raw', name: 'Pistachios', detail: 'raw', serving_g: 100, calories: 601, carbs_g: 8.2, protein_g: 17.9, fat_g: 55, fibre_g: 6.1 },
  { id: 'brazil-nuts-raw', name: 'Brazil nuts', detail: 'raw', serving_g: 100, calories: 682, carbs_g: 3.1, protein_g: 14, fat_g: 68, fibre_g: 4.4 },
  { id: 'pecans-raw', name: 'Pecans', detail: 'raw', serving_g: 100, calories: 689, carbs_g: 5.8, protein_g: 9.2, fat_g: 70, fibre_g: 4.7 },
  { id: 'sunflower-seeds-raw', name: 'Sunflower seeds', detail: 'raw', serving_g: 100, calories: 581, carbs_g: 18, protein_g: 20, fat_g: 47, fibre_g: 6, meals: ['breakfast', 'snack'] },
  { id: 'pumpkin-seeds-raw', name: 'Pumpkin seeds', detail: 'raw', serving_g: 100, calories: 569, carbs_g: 15, protein_g: 24, fat_g: 46, fibre_g: 5.3, meals: ['breakfast', 'snack'] },
  { id: 'chia-seeds-raw', name: 'Chia seeds', detail: 'raw', serving_g: 100, calories: 422, carbs_g: 4, protein_g: 17, fat_g: 31, fibre_g: 34, meals: ['breakfast'] },
  { id: 'flaxseed-linseed-raw', name: 'Flaxseed (linseed)', detail: 'raw', serving_g: 100, calories: 534, carbs_g: 1.6, protein_g: 18, fat_g: 42, fibre_g: 27, meals: ['breakfast'] },
  { id: 'sesame-seeds-raw', name: 'Sesame seeds', detail: 'raw', serving_g: 100, calories: 573, carbs_g: 11.7, protein_g: 17.7, fat_g: 49.7, fibre_g: 11.8 },
  { id: 'peanut-butter-smooth-no-added-sugar', name: 'Peanut butter, smooth', detail: 'no added sugar', serving_g: 100, calories: 606, carbs_g: 13, protein_g: 23, fat_g: 50, fibre_g: 6, meals: ['breakfast', 'snack'] },

  // Fats & Oils
  { id: 'olive-oil-as-packed', name: 'Olive oil', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 899, carbs_g: 0, protein_g: 0, fat_g: 99.9, fibre_g: 0 },
  { id: 'rapeseed-oil-as-packed', name: 'Rapeseed oil', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 899, carbs_g: 0, protein_g: 0, fat_g: 99.9, fibre_g: 0 },
  { id: 'sunflower-oil-as-packed', name: 'Sunflower oil', detail: 'as packed', unit: 'ml', serving_g: 100, calories: 899, carbs_g: 0, protein_g: 0, fat_g: 99.9, fibre_g: 0 },
  { id: 'coconut-oil-as-packed', name: 'Coconut oil', detail: 'as packed', serving_g: 100, calories: 892, carbs_g: 0, protein_g: 0, fat_g: 99.1, fibre_g: 0 },
  { id: 'lard-as-packed', name: 'Lard', detail: 'as packed', serving_g: 100, calories: 891, carbs_g: 0, protein_g: 0, fat_g: 99, fibre_g: 0 },

  // Sweeteners
  { id: 'sugar-white-granulated-as-packed', name: 'Sugar, white granulated', detail: 'as packed', serving_g: 100, calories: 400, carbs_g: 100, protein_g: 0, fat_g: 0, fibre_g: 0 },
  { id: 'sugar-brown-as-packed', name: 'Sugar, brown', detail: 'as packed', serving_g: 100, calories: 380, carbs_g: 98, protein_g: 0, fat_g: 0, fibre_g: 0 },
  { id: 'honey-as-packed', name: 'Honey', detail: 'as packed', serving_g: 100, calories: 334, carbs_g: 82, protein_g: 0.4, fat_g: 0, fibre_g: 0 },
  { id: 'maple-syrup-as-packed', name: 'Maple syrup', detail: 'as packed', serving_g: 100, calories: 260, carbs_g: 67, protein_g: 0, fat_g: 0.1, fibre_g: 0 },
  { id: 'golden-syrup-as-packed', name: 'Golden syrup', detail: 'as packed', serving_g: 100, calories: 325, carbs_g: 79, protein_g: 0.4, fat_g: 0, fibre_g: 0 },


  // Drinks. Card 40: the list had 193 items, no coffee and no juice, so the
  // things people consume every single day forced a barcode scan or a manual
  // entry.
  //
  // Macros are per 100 ml, matching the rest of this file, and serving_g is the
  // default portion, so one tap logs a realistic amount: a mug rather than
  // 100 ml, a pint rather than a splash, a 175 ml glass of wine.
  //
  // Everything here is `unit: 'ml'`. These are sold and drunk by volume, and
  // without it the UI calls a pint 568 grams.
  //
  // PROVENANCE: values follow UK CoFID where the dataset covers the drink, and
  // the milk-based ones are derived from the milk entries already above so they
  // stay internally consistent. The prepared drinks (latte, squash, G&T) are
  // not single CoFID entries and are marked as extras below. Emma should check
  // these against her own reference before this card closes: the card asks for
  // numbers she is happy to stand behind, and mine are matched to CoFID rather
  // than read out of it.
  { id: 'tea-black-infusion', name: 'Tea, black', detail: 'no milk', unit: 'ml', serving_g: 250, calories: 1, carbs_g: 0.1, protein_g: 0.1, fat_g: 0, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'tea-herbal-infusion', name: 'Herbal tea', detail: 'infusion', unit: 'ml', serving_g: 250, calories: 1, carbs_g: 0.2, protein_g: 0, fat_g: 0, fibre_g: 0, meals: ['snack'] },
  { id: 'coffee-black-brewed', name: 'Coffee, black', detail: 'brewed, no milk', unit: 'ml', serving_g: 250, calories: 2, carbs_g: 0.3, protein_g: 0.2, fat_g: 0, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'coffee-espresso', name: 'Espresso', detail: 'single, 30 ml', unit: 'ml', serving_g: 30, calories: 9, carbs_g: 1.7, protein_g: 0.1, fat_g: 0.2, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'orange-juice-unsweetened', name: 'Orange juice', detail: 'unsweetened', unit: 'ml', serving_g: 200, calories: 42, carbs_g: 8.8, protein_g: 0.5, fat_g: 0.1, fibre_g: 0.1, meals: ['breakfast'] },
  { id: 'apple-juice-unsweetened', name: 'Apple juice', detail: 'unsweetened', unit: 'ml', serving_g: 200, calories: 42, carbs_g: 9.9, protein_g: 0.1, fat_g: 0.1, fibre_g: 0, meals: ['breakfast'] },
  { id: 'soya-milk-unsweetened', name: 'Soya milk', detail: 'unsweetened', unit: 'ml', serving_g: 200, calories: 33, carbs_g: 0.6, protein_g: 3.3, fat_g: 1.8, fibre_g: 0.5, meals: ['breakfast'] },
  { id: 'lager-4-percent', name: 'Lager', detail: '4% ABV', unit: 'ml', serving_g: 568, calories: 43, carbs_g: 2.4, protein_g: 0.3, fat_g: 0, fibre_g: 0 },
  { id: 'bitter-ale', name: 'Bitter / ale', detail: 'draught', unit: 'ml', serving_g: 568, calories: 32, carbs_g: 2.3, protein_g: 0.3, fat_g: 0, fibre_g: 0 },
  { id: 'wine-red', name: 'Wine, red', detail: '175 ml glass', unit: 'ml', serving_g: 175, calories: 68, carbs_g: 0.2, protein_g: 0.1, fat_g: 0, fibre_g: 0 },
  { id: 'wine-white-dry', name: 'Wine, white dry', detail: '175 ml glass', unit: 'ml', serving_g: 175, calories: 66, carbs_g: 0.6, protein_g: 0.1, fat_g: 0, fibre_g: 0 },
  { id: 'wine-sparkling', name: 'Sparkling wine', detail: '125 ml flute', unit: 'ml', serving_g: 125, calories: 76, carbs_g: 1.4, protein_g: 0.3, fat_g: 0, fibre_g: 0 },
  { id: 'spirit-40-percent', name: 'Spirit', detail: 'gin, vodka or whisky, 25 ml measure', unit: 'ml', serving_g: 25, calories: 222, carbs_g: 0, protein_g: 0, fat_g: 0, fibre_g: 0 },

  // Extras: not in UK CoFID dataset
  { id: 'bagel', name: 'bagel', detail: 'plain', serving_g: 100, calories: 250, carbs_g: 50, protein_g: 10, fat_g: 1.6, fibre_g: 2.0, meals: ['breakfast', 'lunch'] },
  { id: 'granola', name: 'Granola', serving_g: 60, calories: 450, carbs_g: 65, protein_g: 10, fat_g: 16, fibre_g: 4.0, meals: ['breakfast', 'snack'] },
  { id: 'edamame', name: 'Edamame', detail: 'shelled', serving_g: 150, calories: 121, carbs_g: 9, protein_g: 12, fat_g: 5, fibre_g: 4.8, meals: ['snack', 'lunch'] },
  { id: 'whey-protein', name: 'Protein powder', detail: 'whey, 1 scoop ~30g', serving_g: 30, calories: 375, carbs_g: 6, protein_g: 75, fat_g: 5, fibre_g: 0.0, meals: ['snack', 'breakfast'] },
  { id: 'mixed-nuts', name: 'Mixed nuts', serving_g: 30, calories: 607, carbs_g: 21, protein_g: 20, fat_g: 52, fibre_g: 5.0, meals: ['snack'] },
  { id: 'dark-chocolate', name: 'Dark chocolate', detail: '70%+', serving_g: 30, calories: 600, carbs_g: 46, protein_g: 7.8, fat_g: 43, fibre_g: 11.0, meals: ['snack'] },
  { id: 'coconut-water', name: 'Coconut water', unit: 'ml', serving_g: 330, calories: 19, carbs_g: 4.7, protein_g: 0.2, fat_g: 0.2, fibre_g: 0.0, meals: ['snack'] },
  { id: 'energy-gel', name: 'Energy gel', detail: 'generic, 1 sachet ~40g', serving_g: 40, calories: 100, carbs_g: 25, protein_g: 0, fat_g: 0, fibre_g: 0.0, meals: ['snack'] },

  // Drinks not covered by a single CoFID entry. Derived from the milk entries
  // above plus a standard preparation, so they stay consistent with the rest of
  // the list rather than importing a second source's assumptions.
  { id: 'tea-with-semi-skimmed', name: 'Tea, with milk', detail: 'semi-skimmed, splash', unit: 'ml', serving_g: 250, calories: 7, carbs_g: 0.6, protein_g: 0.4, fat_g: 0.2, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'coffee-white-semi-skimmed', name: 'Coffee, white', detail: 'semi-skimmed, splash', unit: 'ml', serving_g: 250, calories: 8, carbs_g: 0.7, protein_g: 0.5, fat_g: 0.2, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'latte-semi-skimmed', name: 'Latte', detail: 'semi-skimmed, medium', unit: 'ml', serving_g: 350, calories: 45, carbs_g: 4.3, protein_g: 3.2, fat_g: 1.5, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'cappuccino-semi-skimmed', name: 'Cappuccino', detail: 'semi-skimmed, medium', unit: 'ml', serving_g: 250, calories: 35, carbs_g: 3.3, protein_g: 2.5, fat_g: 1.2, fibre_g: 0, meals: ['breakfast', 'snack'] },
  { id: 'oat-milk', name: 'Oat milk', detail: 'barista, as packed', unit: 'ml', serving_g: 200, calories: 45, carbs_g: 6.7, protein_g: 1, fat_g: 1.5, fibre_g: 0.8, meals: ['breakfast'] },
  { id: 'almond-milk-unsweetened', name: 'Almond milk', detail: 'unsweetened', unit: 'ml', serving_g: 200, calories: 13, carbs_g: 0.1, protein_g: 0.4, fat_g: 1.1, fibre_g: 0.4, meals: ['breakfast'] },
  { id: 'squash-no-added-sugar', name: 'Squash', detail: 'no added sugar, diluted', unit: 'ml', serving_g: 250, calories: 2, carbs_g: 0.2, protein_g: 0, fat_g: 0, fibre_g: 0 },
  { id: 'squash-regular', name: 'Squash', detail: 'regular, diluted', unit: 'ml', serving_g: 250, calories: 20, carbs_g: 4.8, protein_g: 0, fat_g: 0, fibre_g: 0 },
  { id: 'smoothie-fruit', name: 'Smoothie', detail: 'fruit, shop-bought', unit: 'ml', serving_g: 250, calories: 55, carbs_g: 12.5, protein_g: 0.7, fat_g: 0.2, fibre_g: 1.2, meals: ['breakfast', 'snack'] },
  { id: 'gin-and-slimline-tonic', name: 'Gin & slimline tonic', detail: '25 ml gin, 150 ml tonic', unit: 'ml', serving_g: 175, calories: 32, carbs_g: 0.1, protein_g: 0, fat_g: 0, fibre_g: 0 },
];

// When `mealType` is provided, items whose `meals` includes that meal float
// to the top while preserving original order within each group. Items with no
// meals annotation are treated as universal; they keep their natural rank
// among the non-affinity group. Matching is unaffected by mealType; this is a
// pure reorder, never a filter.
export function searchCommonFoods(query: string, mealType?: MealAffinity): VirraFood[] {
  const q = query.trim().toLowerCase();
  const base = q
    ? COMMON_FOODS.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.detail?.toLowerCase().includes(q) ?? false),
      )
    : COMMON_FOODS;

  if (!mealType) return base;

  const top: VirraFood[] = [];
  const rest: VirraFood[] = [];
  for (const f of base) {
    if (f.meals?.includes(mealType)) top.push(f);
    else rest.push(f);
  }
  return [...top, ...rest];
}

export function scaleFood(
  food: VirraFood,
  grams: number,
): { calories: number; carbs_g: number; protein_g: number; fat_g: number; fibre_g: number } {
  const f = grams / 100;
  return {
    calories:  Math.round(food.calories  * f * 10) / 10,
    carbs_g:   Math.round(food.carbs_g   * f * 10) / 10,
    protein_g: Math.round(food.protein_g * f * 10) / 10,
    fat_g:     Math.round(food.fat_g     * f * 10) / 10,
    fibre_g:   Math.round(food.fibre_g   * f * 10) / 10,
  };
}
