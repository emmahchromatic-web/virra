import { supabase } from './supabase';
import type { VirraFood } from './commonFoods';
import { toFoodUnit } from './foodUnits';

/**
 * The user's own previously-logged foods, as a search source.
 *
 * Card 220: searching for a product that had been scanned and logged returned
 * "no results". Food search covered exactly two sources, the static
 * COMMON_FOODS list and an Open Food Facts name query, and neither of them is
 * the user's own history. A barcode-scanned item is stored with whatever name
 * Open Food Facts gave it, so unless OFF's own name search happened to surface
 * the same product again, the food you logged last week was unfindable.
 *
 * These rank above everything else in the results, because a food you have
 * logged before is overwhelmingly the most likely thing you are looking for.
 */

/** How far back to look, and how many distinct foods to offer. */
const LOOKBACK_DAYS = 180;
const MAX_RESULTS   = 8;

interface HistoryRow {
  food_name:     string;
  quantity_g:    number | null;
  quantity_unit: string | null;
  calories:      number;
  carbs_g:       number;
  protein_g:     number;
  fat_g:         number;
  fibre_g:       number;
  created_at:    string;
}

export async function searchMyFoods(userId: string, query: string): Promise<VirraFood[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data: logs, error: logErr } = await supabase
    .from('nutrition_logs')
    .select('id')
    .eq('user_id', userId)
    .gte('recorded_on', since);

  if (logErr || !logs?.length) return [];

  const { data, error } = await supabase
    .from('food_entries')
    .select('food_name, quantity_g, quantity_unit, calories, carbs_g, protein_g, fat_g, fibre_g, created_at')
    .in('log_id', logs.map((l) => l.id))
    .ilike('food_name', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const seen = new Set<string>();
  const out: VirraFood[] = [];

  for (const row of data as HistoryRow[]) {
    const key = row.food_name.trim().toLowerCase();
    if (seen.has(key)) continue;

    // Macros are stored for the portion that was logged, but the picker scales
    // from a per-100 basis, so a portion is needed to convert. Manually entered
    // foods have no quantity at all, and inventing one would silently
    // misreport them, so they are skipped rather than guessed at.
    if (!row.quantity_g || row.quantity_g <= 0) continue;

    seen.add(key);
    const per100 = 100 / row.quantity_g;

    out.push({
      id:        `mine-${key}`,
      name:      row.food_name,
      detail:    'Logged before',
      unit:      toFoodUnit(row.quantity_unit),
      serving_g: Math.round(row.quantity_g),
      calories:  Math.round((row.calories  ?? 0) * per100 * 10) / 10,
      carbs_g:   Math.round((row.carbs_g   ?? 0) * per100 * 10) / 10,
      protein_g: Math.round((row.protein_g ?? 0) * per100 * 10) / 10,
      fat_g:     Math.round((row.fat_g     ?? 0) * per100 * 10) / 10,
      fibre_g:   Math.round((row.fibre_g   ?? 0) * per100 * 10) / 10,
    });

    if (out.length >= MAX_RESULTS) break;
  }

  return out;
}
