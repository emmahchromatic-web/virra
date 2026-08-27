import type { RunWorkoutStructure, RunWorkoutType } from './workoutStructure';
import { buildRunSession } from './runProgramme/sessionShapes';

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

// Bands come from the pace model, which expresses them as ratios of THRESHOLD
// pace. The multipliers that used to live here were applied to the runner's 5K
// pace, which made every prescribed pace too fast and the fast end worst of all
// — see card 228 and the header of paceModel.ts.
//
// `baseline_pace_secs` below is therefore threshold pace once the re-anchor
// migration has run. `user_profiles.baseline_anchor` records which it holds.
export { paceForBand } from '@/lib/runProgramme/paceModel';

/**
 * Legacy entry point. Session shapes now live in runProgramme/sessionShapes.ts,
 * parameterised by goal, phase and intensity. This call site has none of those
 * to give, so it passes the `general` pack, which reproduces exactly what this
 * module used to build. PR 4 replaces these calls with real specs.
 */
export interface GenerateRunInput {
  session_label:      string;
  baseline_pace_secs: number;
  distance_km:        number;
}

export function generateRunStructure(input: GenerateRunInput): RunWorkoutStructure {
  return buildRunSession({
    type:          inferWorkoutType(input.session_label),
    distanceKm:    input.distance_km,
    thresholdSecs: input.baseline_pace_secs,
    goal:          'general',
  });
}
