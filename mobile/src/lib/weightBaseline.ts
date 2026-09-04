import { supabase } from '@/lib/supabase';
import { buildPhaseBands, type PhaseBands } from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

interface BaselineRow {
  weight_kg:           number;
  cycle_phase_at_time: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
  /** Optional so the pure median/delta helpers can be exercised without it;
   *  only the live-reading count needs a date. */
  recorded_on?:        string;
}

/**
 * Follicular readings that must have been observed rather than back-projected
 * before we offer a PERSONALISED band.
 *
 * Card 239, the second half. The 60-day retro window in healthKitWeight stops
 * us stamping phases we cannot defend, but a user who opts in with two cycles
 * of scale history still meets the five-reading minimum on day one from labels
 * we inferred rather than watched. The baseline survives that -- it is a median
 * of follicular weights and mislabelling moves it very little -- but the per
 * phase bands are deltas, and they do not.
 *
 * So the baseline still computes and the chart still draws; only the
 * personalised band waits, with the population fallback covering the interim.
 */
export const MIN_LIVE_FOLLICULAR = 3;

/**
 * A reading counts as observed once it falls on or after the earliest period
 * start the user has ever logged: from that date on, the app knew where she was
 * in her cycle when the reading arrived. Anything earlier was labelled by
 * projecting backwards.
 */
export function countLiveFollicular(rows: BaselineRow[], firstKnownPeriodStart: string | null): number {
  if (!firstKnownPeriodStart) return 0;
  return rows.filter(
    (r) =>
      r.cycle_phase_at_time === 'follicular' &&
      // No date means we cannot prove it was observed, so it does not count.
      r.recorded_on != null &&
      r.recorded_on >= firstKnownPeriodStart,
  ).length;
}

/**
 * Follicular readings needed before a baseline, and therefore any band, exists.
 * Exported so the calibrating ribbon can show real progress rather than a
 * guess at how many cycles it might take.
 */
export const MIN_FOLLICULAR_READINGS = 5;

export function medianFollicular(rows: BaselineRow[]): number | null {
  const follicular = rows
    .filter((r) => r.cycle_phase_at_time === 'follicular')
    .map((r) => Number(r.weight_kg))
    .sort((a, b) => a - b);
  if (follicular.length < MIN_FOLLICULAR_READINGS) return null;
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

  const [weightsRes, firstCycleRes] = await Promise.all([
    supabase
      .from('body_weights')
      .select('weight_kg, cycle_phase_at_time, recorded_on')
      .eq('user_id', userId)
      .gte('recorded_on', cutoff),
    // Earliest period start we have ever been told about. Everything from that
    // date onwards was labelled from a cycle we knew; everything before it was
    // projected backwards. See MIN_LIVE_FOLLICULAR.
    supabase
      .from('cycle_logs')
      .select('period_start')
      .eq('user_id', userId)
      .order('period_start', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (weightsRes.error) throw new Error(weightsRes.error.message);

  const rows     = (weightsRes.data ?? []) as BaselineRow[];
  const baseline = medianFollicular(rows);

  // Bands are deltas from the baseline, so they only make sense once a baseline
  // exists. Until then, consumers use the population fallback.
  //
  // They ALSO wait until enough of the follicular readings were actually
  // observed. A band learned from back-projected phases looks personalised and
  // authoritative while being wrong, which is worse than the population model
  // it replaced.
  const firstKnownPeriodStart = (firstCycleRes.data as { period_start: string } | null)?.period_start ?? null;
  const liveFollicular        = countLiveFollicular(rows, firstKnownPeriodStart);
  const bands = baseline !== null && liveFollicular >= MIN_LIVE_FOLLICULAR
    ? buildPhaseBands(phaseDeltas(rows, baseline))
    : null;

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
