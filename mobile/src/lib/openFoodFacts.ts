import { type VirraFood } from './commonFoods';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,brands,nutriments';
const USER_AGENT = 'Virra-iOS/1.0 (food logger; hello@virra.app)';

// Throws on network failure (caller can distinguish offline vs not-found).
// Returns null when barcode exists in OFF but has insufficient data.
export async function lookupBarcode(barcode: string): Promise<VirraFood | null> {
  const res = await fetch(`${OFF_BASE}/${barcode}.json?fields=${OFF_FIELDS}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;
  return parseOFFProduct(await res.json(), barcode);
}

export function parseOFFProduct(data: unknown, barcode: string): VirraFood | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.status !== 1) return null;

  const p = d.product as Record<string, unknown> | undefined;
  if (!p) return null;

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
    id:        `off-${barcode}`,
    name,
    detail:    brand,
    serving_g: 100,
    calories:  toNum(n['energy-kcal_100g']),
    carbs_g:   toNum(n['carbohydrates_100g']),
    protein_g: toNum(n['proteins_100g']),
    fat_g:     toNum(n['fat_100g']),
    fibre_g:   toNum(n['fiber_100g'] ?? n['fibre_100g']),
  };
}
