const BASE    = 'https://trackapi.nutritionix.com/v2';
const APP_ID  = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_ID  ?? '';
const APP_KEY = process.env.EXPO_PUBLIC_NUTRITIONIX_APP_KEY ?? '';

const HEADERS = {
  'x-app-id':  APP_ID,
  'x-app-key': APP_KEY,
  'Content-Type': 'application/json',
};

export interface NixFood {
  food_name:             string;
  brand_name?:           string;
  nix_item_id?:          string;       // branded
  tag_id?:               string;       // common
  serving_qty:           number;
  serving_unit:          string;
  serving_weight_grams:  number;
  nf_calories:           number;
  nf_total_carbohydrate: number;
  nf_protein:            number;
  nf_total_fat:          number;
  photo?:                { thumb?: string };
}

// Instant search — returns common + branded with basic macros
export async function searchFoods(query: string): Promise<NixFood[]> {
  if (!query.trim() || !APP_ID) return [];
  const res = await fetch(
    `${BASE}/search/instant?query=${encodeURIComponent(query)}&branded=true&common=true&detailed=true`,
    { headers: HEADERS }
  );
  if (!res.ok) return [];
  const json = await res.json();
  const branded: NixFood[] = (json.branded ?? []).slice(0, 10);
  const common:  NixFood[] = (json.common  ?? []).slice(0, 5);
  return [...common, ...branded];
}

// Resolve full nutrients for a common food (by name, natural language)
export async function resolveCommonFood(foodName: string, qty: number, unit: string): Promise<NixFood | null> {
  if (!APP_ID) return null;
  const res = await fetch(`${BASE}/natural/nutrients`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify({ query: `${qty} ${unit} ${foodName}` }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.foods?.[0] as NixFood) ?? null;
}

// Resolve full nutrients for a branded item by ID
export async function resolveBrandedFood(nixItemId: string): Promise<NixFood | null> {
  if (!APP_ID) return null;
  const res = await fetch(`${BASE}/search/item?nix_item_id=${nixItemId}`, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.foods?.[0] as NixFood) ?? null;
}

// Barcode lookup
export async function lookupBarcode(upc: string): Promise<NixFood | null> {
  if (!APP_ID) return null;
  const res = await fetch(`${BASE}/search/item?upc=${upc}`, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.foods?.[0] as NixFood) ?? null;
}

// Scale macros proportionally to a custom serving size
export function scaleNutrition(food: NixFood, grams: number): {
  calories: number; carbs_g: number; protein_g: number; fat_g: number;
} {
  const ratio = food.serving_weight_grams > 0 ? grams / food.serving_weight_grams : 1;
  return {
    calories:  Math.round(food.nf_calories           * ratio),
    carbs_g:   Math.round(food.nf_total_carbohydrate * ratio * 10) / 10,
    protein_g: Math.round(food.nf_protein            * ratio * 10) / 10,
    fat_g:     Math.round(food.nf_total_fat          * ratio * 10) / 10,
  };
}
