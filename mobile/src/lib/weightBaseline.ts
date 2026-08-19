import { supabase } from '@/lib/supabase';
import { buildPhaseBands, type PhaseBands } from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

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

/** Group each reading's delta-from-baseline by the phase it was recorded in,
 *  so buildPhaseBands can learn a per-phase band from the user's own history. */
export function phaseDeltas(rows: BaselineRow[], baseline: number): Partial<Record<CyclePhase, number[]>> {
  const out: Partial<Record<CyclePhase, number[]>> = {};
  for (const r of rows) {
    const phase = r.cycle_phase_at_time;
    if (!phase) continue;
    (out[phase] ??= []).push(Number(r.weight_kg) - baseline);
  }
  return out;
}

const WINDOW_DAYS = 70;

export async function computeBaseline(userId: string): Promise<{ baseline: number | null; bands: PhaseBands | null }> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('body_weights')
    .select('weight_kg, cycle_phase_at_time')
    .eq('user_id', userId)
    .gte('recorded_on', cutoff);

  if (error) throw new Error(error.message);

  const rows     = (data ?? []) as BaselineRow[];
  const baseline = medianFollicular(rows);
  // Bands are deltas from the baseline, so they only make sense once a baseline
  // exists. Until then, consumers use the population fallback.
  const bands    = baseline !== null ? buildPhaseBands(phaseDeltas(rows, baseline)) : null;

  await supabase
    .from('user_profiles')
    .update({
      weight_baseline_kg:          baseline,
      weight_phase_bands:          bands,
      weight_baseline_computed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return { baseline, bands };
}
