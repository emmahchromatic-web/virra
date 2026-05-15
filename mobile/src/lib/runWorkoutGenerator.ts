import type {
  RunWorkoutStructure, RunWorkoutType, RunStep, PaceBand,
} from './workoutStructure';

export function inferWorkoutType(sessionLabel: string): RunWorkoutType {
  const L = sessionLabel.toLowerCase();
  if (L.includes('long'))                            return 'long';
  if (L.includes('tempo'))                           return 'tempo';
  if (L.includes('threshold'))                       return 'threshold';
  if (L.includes('interval') || L.includes('vo2'))   return 'intervals';
  if (L.includes('progression'))                     return 'progression';
  if (L.includes('race'))                            return 'race';
  if (L.includes('recovery'))                        return 'recovery';
  if (L.includes('run_walk') || L.includes('walk'))  return 'run_walk';
  if (L.includes('negative'))                        return 'negative_split';
  return 'easy';
}

const PACE_MULT: Record<PaceBand, number> = {
  recovery:  1.25,
  easy:      1.15,
  steady:    1.05,
  tempo:     0.95,
  threshold: 0.90,
  vo2:       0.83,
};

export function paceForBand(baselineSecsPerKm: number, band: PaceBand): number {
  return Math.round(baselineSecsPerKm * PACE_MULT[band]);
}

function makeIdFactory(): () => string {
  let i = 0;
  return () => `s${++i}`;
}

export interface GenerateRunInput {
  session_label:      string;
  baseline_pace_secs: number;
  distance_km:        number;
}

export function generateRunStructure(input: GenerateRunInput): RunWorkoutStructure {
  throw new Error('generateRunStructure not yet implemented for ' + input.session_label);
}
