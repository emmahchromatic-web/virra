import { deriveCycleMode, type CyclePhase, type CycleProfile } from './cycleEngine';

export type SessionType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'strength';

export interface SessionPaceTarget {
  pace_seconds_per_km?: number;
  duration_minutes?:    number;
  intensity_label:      string;
}

export interface ModulationResult {
  adjusted_target:    SessionPaceTarget;
  reason:             string | null;
  source_cycle_phase: CyclePhase | null;
}

interface PaceModifier {
  pace_delta_pct?:      number;   // negative = slower pace
  intensity_delta_pct?: number;   // positive = push harder; negative = back off
  skip?:                boolean;
  fuel_caution?:        boolean;
  reason:               string;
}

// Conservative evidence-based defaults. Negative pace_delta = slower.
const MATRIX: Record<SessionType, Record<CyclePhase, PaceModifier | null>> = {
  easy: {
    menstrual:  { pace_delta_pct: -3, reason: 'Menstrual phase — body is recovering. Easy means easy today.' },
    follicular: null,
    ovulatory:  null,
    luteal:     { pace_delta_pct: -2, reason: 'Luteal phase — thermoregulation is harder. A touch slower keeps the effort easy.' },
  },
  tempo: {
    menstrual:  { intensity_delta_pct: -8, reason: 'Menstrual phase — threshold work is taxing. Lower intensity protects recovery.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct:  3, reason: 'Ovulatory phase — peak power window. Today\'s the day to push.' },
    luteal:     { intensity_delta_pct: -6, reason: 'Luteal phase — body temperature is up, lactate threshold shifts. Today\'s adjusted target is the same physiological work as your follicular pace.' },
  },
  intervals: {
    menstrual:  { skip: true, intensity_delta_pct: -10, reason: 'Menstrual phase — high-intensity intervals on Day 1–3 typically underperform and prolong recovery. Substitute easy aerobic.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct: 3,  reason: 'Ovulatory phase — peak neuromuscular window. Sharp intervals land best here.' },
    luteal:     { intensity_delta_pct: -6, reason: 'Luteal phase — power output drops. Adjusted intensity matches your actual readiness.' },
  },
  long: {
    menstrual:  { pace_delta_pct: -5, reason: 'Menstrual phase — long runs are fine, but walk breaks are okay if needed.' },
    follicular: null,
    ovulatory:  null,
    luteal:     { pace_delta_pct: -3, fuel_caution: true, reason: 'Luteal phase — carb needs are up, hydration matters more. Pace adjusted, fuel earlier and more often.' },
  },
  race: {
    menstrual:  { reason: 'Race day in your menstrual phase — manage cramps with magnesium pre-race. Pace is unchanged; awareness matters.' },
    follicular: null,
    ovulatory:  null,
    luteal:     { fuel_caution: true, reason: 'Race day in your luteal phase — body temp is elevated, carb burn is higher. Hydrate aggressively and carb-load through race week.' },
  },
  strength: {
    menstrual:  { intensity_delta_pct: -5, reason: 'Menstrual phase — bar work feels heavier than it is. Drop 5% and own the form.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct: 3,  reason: 'Ovulatory phase — strongest lifting window. PR attempts land best here.' },
    luteal:     { intensity_delta_pct: -3, reason: 'Luteal phase — recovery from heavy lifts is slower. Slight reduction protects the cycle\'s second half.' },
  },
};

function applyModifier(base: SessionPaceTarget, mod: PaceModifier): SessionPaceTarget {
  // For pace-less targets (strength with weight-based intensity, or duration-only),
  // the numeric modifier is a no-op but the reason still surfaces in the why-card.
  const next = { ...base };
  if (mod.pace_delta_pct !== undefined && next.pace_seconds_per_km) {
    next.pace_seconds_per_km = Math.round(next.pace_seconds_per_km * (1 - mod.pace_delta_pct / 100));
  }
  if (mod.intensity_delta_pct !== undefined && next.pace_seconds_per_km) {
    // Intensity decrease translates to slower pace. -8% intensity ~= +4% pace
    const paceShift = -mod.intensity_delta_pct / 2;
    next.pace_seconds_per_km = Math.round(next.pace_seconds_per_km * (1 + paceShift / 100));
  }
  return next;
}

function conservativeReason(reason: string): string {
  return reason.replace(/today\b/gi, 'today (estimated)');
}

export function modulateForCycle(
  base_target:      SessionPaceTarget,
  session_type:     SessionType,
  cycle_phase:      CyclePhase | null,
  cycle_profile:    CycleProfile,
  has_placebo_week: boolean | null = null,
): ModulationResult {
  const mode = deriveCycleMode(cycle_profile, has_placebo_week);
  if (mode === 'steady') {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }
  if (!cycle_phase) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }

  const mod = MATRIX[session_type]?.[cycle_phase];
  if (!mod) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: cycle_phase };
  }

  const effectiveMod: PaceModifier = cycle_profile === 'irregular'
    ? {
        ...mod,
        pace_delta_pct:      mod.pace_delta_pct      !== undefined ? mod.pace_delta_pct      / 2 : undefined,
        intensity_delta_pct: mod.intensity_delta_pct !== undefined ? mod.intensity_delta_pct / 2 : undefined,
        reason:              conservativeReason(mod.reason),
      }
    : mod;

  const adjusted = applyModifier(base_target, effectiveMod);

  return {
    adjusted_target:    adjusted,
    reason:             effectiveMod.reason,
    source_cycle_phase: cycle_phase,
  };
}

import type { RunWorkoutStructure, RunStep } from './workoutStructure';

/**
 * Apply cycle modulation to every pace target in a run structure.
 * Recurses into `repeat.sub_steps`. Steps without a `pace_secs_per_km`
 * target (e.g. duration-only walk segments) pass through unchanged.
 *
 * The first non-null modulation reason encountered is surfaced as the
 * aggregate `reason`. Pass `null` profile to default to 'natural'.
 */
export function modulateRunStructure(
  structure:      RunWorkoutStructure,
  phase:          CyclePhase | null,
  profile:        CycleProfile | null,
  hasPlaceboWeek: boolean | null = null,
): { adjusted: RunWorkoutStructure; reason: string | null } {
  let firstReason: string | null = null;
  const effectiveProfile: CycleProfile = profile ?? 'natural';

  function modulateStep(step: RunStep): RunStep {
    if (step.kind === 'repeat' && step.sub_steps) {
      return { ...step, sub_steps: step.sub_steps.map(modulateStep) };
    }
    const pace = step.target.pace_secs_per_km;
    if (pace == null) return step;

    // Map step kind + pace band → SessionType for the existing modulation MATRIX.
    const sessionType: SessionType =
      step.kind === 'work' && step.target.pace_band === 'vo2'       ? 'intervals' :
      step.kind === 'work' && step.target.pace_band === 'tempo'     ? 'tempo' :
      step.kind === 'work' && step.target.pace_band === 'threshold' ? 'tempo' :
      step.target.pace_band === 'recovery'                          ? 'easy' :
                                                                      'easy';

    const r = modulateForCycle(
      { pace_seconds_per_km: pace, intensity_label: step.label ?? step.kind },
      sessionType,
      phase,
      effectiveProfile,
      hasPlaceboWeek,
    );
    if (r.reason && !firstReason) firstReason = r.reason;
    const newPace = r.adjusted_target.pace_seconds_per_km;
    return { ...step, target: { ...step.target, pace_secs_per_km: newPace ?? pace } };
  }

  return {
    adjusted: { ...structure, steps: structure.steps.map(modulateStep) },
    reason:   firstReason,
  };
}

export function shouldAnchorKeySession(session_type: SessionType): boolean {
  return session_type === 'long' || session_type === 'tempo' || session_type === 'intervals' || session_type === 'strength';
}

const ANCHOR_RANK: Record<SessionType, Record<CyclePhase, number>> = {
  long:      { follicular: 0, ovulatory: 1, luteal: 2, menstrual: 3 },
  tempo:     { follicular: 0, ovulatory: 1, luteal: 2, menstrual: 3 },
  intervals: { ovulatory:  0, follicular: 1, luteal: 2, menstrual: 3 },
  easy:      { follicular: 0, ovulatory: 0, luteal: 0, menstrual: 0 },
  race:      { follicular: 0, ovulatory: 0, luteal: 0, menstrual: 0 },
  strength:  { ovulatory:  0, follicular: 1, luteal: 2, menstrual: 3 },
};

export function anchorKeySession(
  candidates:   { date: string; cycle_phase: CyclePhase | null }[],
  session_type: SessionType,
): string {
  if (candidates.length === 0) throw new Error('anchorKeySession: empty candidates');
  if (!shouldAnchorKeySession(session_type)) return candidates[0].date;

  return candidates
    .map((c) => ({
      date: c.date,
      rank: c.cycle_phase ? ANCHOR_RANK[session_type][c.cycle_phase] : 99,
    }))
    .sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date))
    [0].date;
}
