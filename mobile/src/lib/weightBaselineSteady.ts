import { supabase } from '@/lib/supabase';

interface SteadyRow {
  weight_kg: number;
}

const MIN_READINGS = 7;
const WINDOW_DAYS  = 30;

export function medianAll(rows: SteadyRow[]): number | null {
  if (rows.length < MIN_READINGS) return null;
  const sorted = rows.map((r) => Number(r.weight_kg)).sort((a, b) => a - b);
  const n   = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) * 50) / 100
    : sorted[mid];
}

export async function computeSteadyBaseline(userId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('body_weights')
    .select('weight_kg')
    .eq('user_id', userId)
    .gte('recorded_on', cutoff);

  if (error) throw new Error(error.message);

  const baseline = medianAll((data ?? []) as SteadyRow[]);

  await supabase
    .from('user_profiles')
    .update({
      weight_steady_baseline_kg:          baseline,
      weight_steady_baseline_computed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return baseline;
}
