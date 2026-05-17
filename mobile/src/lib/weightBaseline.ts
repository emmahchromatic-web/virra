import { supabase } from '@/lib/supabase';

interface BaselineRow {
  weight_kg:           number;
  cycle_phase_at_time: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
}

export function medianFollicular(rows: BaselineRow[]): number | null {
  const follicular = rows
    .filter((r) => r.cycle_phase_at_time === 'follicular')
    .map((r) => Number(r.weight_kg))
    .sort((a, b) => a - b);
  if (follicular.length < 5) return null;
  const n   = follicular.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (follicular[mid - 1] + follicular[mid]) / 2
    : follicular[mid];
}

const WINDOW_DAYS = 70;

export async function computeBaseline(userId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('body_weights')
    .select('weight_kg, cycle_phase_at_time')
    .eq('user_id', userId)
    .gte('recorded_on', cutoff);

  if (error) throw new Error(error.message);

  const baseline = medianFollicular((data ?? []) as BaselineRow[]);

  await supabase
    .from('user_profiles')
    .update({
      weight_baseline_kg:          baseline,
      weight_baseline_computed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return baseline;
}
