import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightBand {
  lower: number;
  upper: number;
}

// Population fallback, used only until a user has enough of their own readings
// in a phase to learn a personal band (see buildPhaseBands). These are generic
// averages: real women vary enormously (many have almost no luteal water rise),
// which is why we personalise as soon as the data allows.
export const EXPECTED_BAND: Record<CyclePhase, WeightBand> = {
  menstrual:  { lower: -0.3, upper: 0.6 },
  follicular: { lower: -0.2, upper: 0.5 },
  ovulatory:  { lower:  0.0, upper: 1.0 },
  luteal:     { lower:  0.5, upper: 2.0 },
};

/** A user's own per-phase bands, learned from their history. Phases without
 *  enough data are absent and fall back to EXPECTED_BAND via bandFor(). */
export type PhaseBands = Partial<Record<CyclePhase, WeightBand>>;

// Personalisation tuning.
const MIN_SAMPLES    = 4;   // per phase; below this, keep the population band
const NOISE_PAD      = 0.2; // kg cushion beyond the observed range for daily noise
const MIN_HALF_WIDTH = 0.5; // band is never tighter than ±0.5 kg around the median

/** Linear-interpolated quantile of an already-ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Learn one phase's band from the user's deltas (weight − baseline) recorded in
 * that phase. Centres on the median and spans the 10th–90th percentile plus a
 * noise cushion, never narrower than ±MIN_HALF_WIDTH. Returns null when there
 * aren't enough readings to be meaningful, so the caller can fall back.
 */
export function personalBandForPhase(deltas: number[]): WeightBand | null {
  if (deltas.length < MIN_SAMPLES) return null;
  const s      = [...deltas].sort((a, b) => a - b);
  const median = quantile(s, 0.5);
  const lower  = Math.min(quantile(s, 0.10) - NOISE_PAD, median - MIN_HALF_WIDTH);
  const upper  = Math.max(quantile(s, 0.90) + NOISE_PAD, median + MIN_HALF_WIDTH);
  return { lower: round1(lower), upper: round1(upper) };
}

/** Build the full set of personal bands from deltas grouped by phase. Phases
 *  with too little data are omitted (population fallback applies). */
export function buildPhaseBands(deltasByPhase: Partial<Record<CyclePhase, number[]>>): PhaseBands {
  const out: PhaseBands = {};
  (Object.keys(deltasByPhase) as CyclePhase[]).forEach((phase) => {
    const band = personalBandForPhase(deltasByPhase[phase] ?? []);
    if (band) out[phase] = band;
  });
  return out;
}

/** The band to use for a phase: the user's own if learned, else the population one. */
export function bandFor(phase: CyclePhase, personal?: PhaseBands | null): WeightBand {
  return personal?.[phase] ?? EXPECTED_BAND[phase];
}

export type BandPosition = 'below' | 'in_band' | 'above';

export function classifyDelta(delta: number, band: WeightBand): BandPosition {
  if (delta < band.lower) return 'below';
  if (delta > band.upper) return 'above';
  return 'in_band';
}

export function classifyReading(delta: number, phase: CyclePhase, personal?: PhaseBands | null): BandPosition {
  return classifyDelta(delta, bandFor(phase, personal));
}

export const STEADY_BAND: WeightBand = { lower: -0.5, upper: 0.5 };

export function classifySteady(delta: number): BandPosition {
  return classifyDelta(delta, STEADY_BAND);
}
