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
  function walk(step: RunStep) {
    if (step.kind === 'repeat' && step.sub_steps) {
      const n = step.repeat_count ?? 1;
      for (let i = 0; i < n; i++) {
        for (const sub of step.sub_steps) walk(sub);
      }
      return;
    }
    const d = step.target.distance_m;
    const p = step.target.pace_secs_per_km;
    if (d != null && d > 0 && p != null && p > 0) {
      out.push({ distance_m: d, pace_secs_per_km: p });
    }
  }
  for (const s of structure.steps) walk(s);
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

// ---- Detection ------------------------------------------------------------

export interface CompletedRunSample {
  avg_pace_secs: number;
  distance_m: number;
  elevation_gain_m: number | null;
  phase_at_time: CyclePhase | null;
  session_label: string;
  run_structure: RunWorkoutStructure | null;
  scheduled_date: string; // ISO yyyy-mm-dd
}

export interface Verdict {
  direction: 'faster' | 'slower';
  observed: number;   // median baseline-equivalent, s/km
  proposed: number;   // damped + capped new baseline, s/km
  current: number;    // stored baseline, s/km
  evidence: string;
  nRuns: number;
  windowDays: number;
  wouldChangeUpcoming: boolean;
}

export interface DetectConfig {
  minRuns: number;
  windowDays: number;
  minDeltaSecs: number;
  consistencyFraction: number;
  cooldownDays: number;
  postBreakGraceDays: number;
  damping: number;
  capSecs: number;
  maxElevationGainM: number;
  minDistanceM: number;
}

export const DEFAULT_DETECT_CONFIG: DetectConfig = {
  minRuns: 4, windowDays: 42, minDeltaSecs: 8, consistencyFraction: 0.75,
  cooldownDays: 21, postBreakGraceDays: 7, damping: 0.6, capSecs: 15,
  maxElevationGainM: 150, minDistanceM: 1500,
};

export interface DetectParams {
  samples: CompletedRunSample[];
  currentBaseline: number;
  cycleProfile: CycleProfile | null;
  today: string;
  lastAssessmentDate: string | null;
  snoozedUntil: string | null;
  breaks: { start: string; end: string }[];
  hasUpcomingRuns?: boolean;
  config?: Partial<DetectConfig>;
}

const DAY_MS = 86_400_000;
function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(aIso) - Date.parse(bIso)) / DAY_MS);
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function fmtPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function detectBaselineDrift(params: DetectParams): Verdict | null {
  const cfg = { ...DEFAULT_DETECT_CONFIG, ...(params.config ?? {}) };
  const { samples, currentBaseline, cycleProfile, today } = params;

  if (params.snoozedUntil && Date.parse(params.snoozedUntil) > Date.parse(today)) return null;
  if (params.lastAssessmentDate && daysBetween(today, params.lastAssessmentDate) < cfg.cooldownDays) return null;

  const inWindow = samples.filter(
    (s) => daysBetween(today, s.scheduled_date) <= cfg.windowDays && daysBetween(today, s.scheduled_date) >= 0,
  );

  const afterBreaks = inWindow.filter((s) => {
    for (const b of params.breaks) {
      const graceEnd = new Date(Date.parse(b.end) + cfg.postBreakGraceDays * DAY_MS).toISOString().slice(0, 10);
      if (s.scheduled_date >= b.start && s.scheduled_date <= graceEnd) return false;
    }
    return true;
  });

  const qualifying = afterBreaks.filter(
    (s) =>
      s.run_structure != null &&
      s.session_label !== 'recovery' &&
      s.distance_m >= cfg.minDistanceM &&
      (s.elevation_gain_m ?? 0) <= cfg.maxElevationGainM,
  );

  if (qualifying.length < cfg.minRuns) return null;

  const equivs: number[] = [];
  for (const s of qualifying) {
    const eq = baselineEquivalentForRun(currentBaseline, s.avg_pace_secs, s.run_structure!, s.phase_at_time, cycleProfile);
    if (eq != null) equivs.push(eq);
  }
  if (equivs.length < cfg.minRuns) return null;

  const observed = median(equivs);
  const delta = observed - currentBaseline; // negative = faster
  if (Math.abs(delta) < cfg.minDeltaSecs) return null;

  const sign = Math.sign(delta);
  const agreeing = equivs.filter((e) => Math.sign(e - currentBaseline) === sign).length;
  if (agreeing / equivs.length < cfg.consistencyFraction) return null;

  const step = Math.max(-cfg.capSecs, Math.min(cfg.capSecs, Math.round(cfg.damping * delta)));
  const proposed = currentBaseline + step;
  if (proposed === currentBaseline) return null;

  const direction: 'faster' | 'slower' = delta < 0 ? 'faster' : 'slower';
  const evidence =
    `your recent runs work out to about ${fmtPace(observed)}/km — ` +
    `${direction === 'faster' ? 'quicker than' : 'easier than'} the ` +
    `${fmtPace(currentBaseline)} your plan assumes`;

  return {
    direction, observed, proposed, current: currentBaseline, evidence,
    nRuns: equivs.length, windowDays: cfg.windowDays,
    wouldChangeUpcoming: params.hasUpcomingRuns ?? false,
  };
}
