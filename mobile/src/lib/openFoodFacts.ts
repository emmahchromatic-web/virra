import { type VirraFood } from './commonFoods';
import { inferUnitFromName, type FoodUnit } from './foodUnits';

const OFF_HOST = 'https://world.openfoodfacts.org';
const OFF_FIELDS =
  'code,product_name,product_name_en,brands,nutriments,' +
  'product_quantity_unit,serving_quantity_unit,quantity';
const USER_AGENT = 'Virra-iOS/1.0 (food logger; hello@virra.app)';

// Throws on network failure (caller can distinguish offline vs not-found).
// Returns null when barcode exists in OFF but has insufficient data.
export async function lookupBarcode(barcode: string): Promise<VirraFood | null> {
  const res = await fetch(`${OFF_HOST}/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;
  const json = await safeJson(res);
  return json ? parseOFFProduct(json, barcode) : null;
}

// Search OFF by free-text name. Returns up to `pageSize` results with usable kcal.
// Throws on network failure or abort.
//
// Uses cgi/search.pl rather than /api/v2/search; the v2 endpoint silently ignores
// search_terms and returns the full database in arbitrary order. The cgi endpoint
// is the canonical free-text route per OFF's wiki and honours sort_by relevance.
export async function searchByName(
  query: string,
  opts?: { pageSize?: number; signal?: AbortSignal },
): Promise<VirraFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pageSize = opts?.pageSize ?? 20;
  const url =
    `${OFF_HOST}/cgi/search.pl?search_terms=${encodeURIComponent(trimmed)}` +
    `&search_simple=1&action=process&json=1` +
    `&sort_by=unique_scans_n` +
    `&page_size=${pageSize}&fields=${OFF_FIELDS}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: opts?.signal,
  });
  if (!res.ok) return [];
  const json = await safeJson(res);
  return json ? parseOFFSearchResults(json) : [];
}

// OFF returns an HTML "temporarily unavailable" page on heavy load instead of JSON.
// Swallow the parse error and treat as empty so the caller doesn't crash.
async function safeJson(res: Response): Promise<unknown | null> {
  try { return await res.json(); }
  catch { return null; }
}

export function parseOFFProduct(data: unknown, barcode: string): VirraFood | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.status !== 1) return null;

  const p = d.product as Record<string, unknown> | undefined;
  if (!p) return null;

  return productToVirraFood(p, `off-${barcode}`);
}

export function parseOFFSearchResults(data: unknown): VirraFood[] {
  if (typeof data !== 'object' || data === null) return [];
  const d = data as Record<string, unknown>;
  const products = Array.isArray(d.products) ? d.products : [];
  const out: VirraFood[] = [];
  for (const raw of products) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const code = typeof p.code === 'string' && p.code.trim() ? p.code.trim() : undefined;
    if (!code) continue;
    const food = productToVirraFood(p, `off-${code}`);
    // Skip products with no usable kcal; they're noise.
    if (!food || food.calories <= 0) continue;
    out.push(food);
  }
  return out;
}

/**
 * Whether an OFF product is sold by volume. OFF records this directly on most
 * products: where it doesn't, the pack size string ("500 ml", "1 L") usually
 * gives it away. Falls back to the product name only when neither is present.
 */
export function unitForOFFProduct(p: Record<string, unknown>, name: string): FoodUnit {
  const direct = [p.product_quantity_unit, p.serving_quantity_unit]
    .find((v) => typeof v === 'string' && v.trim());
  if (typeof direct === 'string') {
    const u = direct.trim().toLowerCase();
    if (u === 'ml' || u === 'l' || u === 'cl' || u === 'dl') return 'ml';
    if (u === 'g' || u === 'kg' || u === 'mg') return 'g';
  }

  // e.g. "500 ml", "1L", "33 cl". Anchored to the end so "250 g (drained 150ml)"
  // style strings don't misfire on a parenthetical.
  const quantity = typeof p.quantity === 'string' ? p.quantity.trim().toLowerCase() : '';
  if (quantity) {
    if (/(?:^|[\d\s])(?:ml|cl|dl|l|litres?|liters?)\s*$/.test(quantity)) return 'ml';
    if (/(?:^|[\d\s])(?:g|kg|mg|grams?)\s*$/.test(quantity)) return 'g';
  }

  return inferUnitFromName(name);
}

function productToVirraFood(p: Record<string, unknown>, id: string): VirraFood | null {
  const name = ((p.product_name_en ?? p.product_name) as string | undefined)?.trim();
  if (!name) return null;

  const n = (p.nutriments ?? {}) as Record<string, unknown>;

  const toNum = (v: unknown): number => {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isNaN(x) ? 0 : Math.round(x * 10) / 10;
  };

  const brand = typeof p.brands === 'string' && p.brands.trim()
    ? p.brands.split(',')[0].trim()
    : undefined;

  return {
    id,
    name,
    detail:    brand,
    // Always explicit for OFF products: unlike the curated catalogue, we have
    // no guarantee a missing unit means grams.
    unit:      unitForOFFProduct(p, name),
    serving_g: 100,
    calories:  toNum(n['energy-kcal_100g']),
    carbs_g:   toNum(n['carbohydrates_100g']),
    protein_g: toNum(n['proteins_100g']),
    fat_g:     toNum(n['fat_100g']),
    fibre_g:   toNum(n['fiber_100g'] ?? n['fibre_100g']),
  };
}
