import type { RunWorkoutStructure, RunStep } from './workoutStructure';
import { modulateRunStructure } from './cycleModulation';
import type { CyclePhase, CycleProfile } from '@/store/cycle';

/** A leaf step's distance + pace, after expanding repeats. */
export interface FlatStep {
  distance_m: number;
  pace_secs_per_km: number;
}

/**
 * Flatten a run structure to its leaf (distance, pace) pairs, expanding
 * `repeat` blocks by `repeat_count`. Steps lacking either a distance or a
 * pace target are dropped (they can't contribute to a distance-weighted pace).
 */
export function flattenRunSteps(structure: RunWorkoutStructure): FlatStep[] {
  const out: FlatStep[] = [];
  function walk(step: RunStep, times: number) {
    if (step.kind === 'repeat' && step.sub_steps) {
      const n = step.repeat_count ?? 1;
      for (let i = 0; i < n * times; i++) {
        for (const sub of step.sub_steps) walk(sub, 1);
      }
      return;
    }
    const d = step.target.distance_m;
    const p = step.target.pace_secs_per_km;
    if (d != null && d > 0 && p != null && p > 0) {
      for (let i = 0; i < times; i++) out.push({ distance_m: d, pace_secs_per_km: p });
    }
  }
  for (const s of structure.steps) walk(s, 1);
  return out;
}

/**
 * The distance-weighted average target pace (s/km) of a structure AFTER
 * read-time cycle modulation — i.e. the pace the runner was actually shown
 * for that session. Returns null if no step carries a usable pace+distance.
 */
export function expectedModulatedAvgPace(
  structure: RunWorkoutStructure,
  phase: CyclePhase | null,
  profile: CycleProfile | null,
): number | null {
  const { adjusted } = modulateRunStructure(structure, phase, profile);
  const flat = flattenRunSteps(adjusted);
  if (flat.length === 0) return null;
  const totalDist = flat.reduce((a, s) => a + s.distance_m, 0);
  if (totalDist <= 0) return null;
  const weighted = flat.reduce((a, s) => a + s.pace_secs_per_km * s.distance_m, 0);
  return Math.round(weighted / totalDist);
}

/**
 * Back a single run's actual average pace out to the baseline that would have
 * produced it, given the session's structure + the phase it was run in:
 *   baseline_equivalent = current_baseline × (actual / expected_modulated)
 * Returns null if the expected pace can't be computed.
 */
export function baselineEquivalentForRun(
  currentBaseline: number,
  actualAvgPace: number,
  structure: RunWorkoutStructure,
  phase: CyclePhase | null,
  profile: CycleProfile | null,
): number | null {
  const expected = expectedModulatedAvgPace(structure, phase, profile);
  if (expected == null || expected <= 0) return null;
  return Math.round(currentBaseline * (actualAvgPace / expected));
}
