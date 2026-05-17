import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightBand {
  lower: number;
  upper: number;
}

export const EXPECTED_BAND: Record<CyclePhase, WeightBand> = {
  menstrual:  { lower: -0.3, upper: 0.6 },
  follicular: { lower: -0.2, upper: 0.5 },
  ovulatory:  { lower:  0.0, upper: 1.0 },
  luteal:     { lower:  0.5, upper: 2.0 },
};

export type BandPosition = 'below' | 'in_band' | 'above';

export function classifyReading(delta: number, phase: CyclePhase): BandPosition {
  const { lower, upper } = EXPECTED_BAND[phase];
  if (delta < lower) return 'below';
  if (delta > upper) return 'above';
  return 'in_band';
}
