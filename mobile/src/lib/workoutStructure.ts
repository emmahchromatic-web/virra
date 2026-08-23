// mobile/src/lib/workoutStructure.ts
// Plan-owned workout structure for Phase I.
// See docs/superpowers/specs/2026-05-15-phase-i-active-workout-engine-design.md

// ---- Run ----

export type RunStepKind = 'warmup' | 'work' | 'rest' | 'cooldown' | 'repeat';

export type PaceBand =
  | 'recovery'
  | 'easy'
  | 'steady'
  | 'tempo'
  | 'threshold'
  | 'vo2';

export interface RunStepTarget {
  distance_m?:       number;
  duration_s?:       number;
  pace_secs_per_km?: number;
  pace_band?:        PaceBand;
}

export interface RunStep {
  id:            string;
  kind:          RunStepKind;
  label?:        string;
  target:        RunStepTarget;
  repeat_count?: number;
  sub_steps?:    RunStep[];
}

export type RunWorkoutType =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'progression'
  | 'race'
  | 'recovery'
  | 'run_walk'
  | 'negative_split';

export interface RunWorkoutStructure {
  version:          1;
  workout_type:     RunWorkoutType;
  steps:            RunStep[];
  total_distance_m: number;
}

// ---- Strength ----

export interface StrengthSetTarget {
  reps:       number;
  weight_kg?: number;
  rpe?:       number;
}

export interface PlannedExercise {
  id:               string;
  name:             string;
  primary_muscles:  string[];
  target_sets:      StrengthSetTarget[];
  rest_seconds:     number;
  notes?:           string;
}

export interface StrengthWorkoutStructure {
  version:           1;
  session_type:      'lower' | 'upper' | 'general';
  exercises:         PlannedExercise[];
  estimated_minutes: number;
}

// ---- Strength v2 (authored Get Strong programmes) ----
//
// v2 carries the exact session Emma authored for a programme day + equipment
// variant + 12-week block (see getStrongSession.ts). Unlike v1, where the
// generator picks exercises from a pool and tempo/description come from
// getExerciseMeta at render time; v2 persists everything the UI needs:
// grouped sections, and per-exercise description / tempo / rest. Readers
// discriminate on `version`: v1 stays untouched.

export interface StrengthV2Exercise {
  name:        string;
  description: string | null;
  /** Authored set count. Null for mobility / activation moves prescribed by time or feel. */
  sets:        number | null;
  /** Authored reps, kept as free text (e.g. "8-10", "30s", "AMRAP"). */
  reps:        string | null;
  /** 4-part tempo (e.g. "3-1-1-0"); null where no tempo is prescribed. */
  tempo:       string | null;
  /** Authored rest (e.g. "90s", "2 min"); null where none is prescribed. */
  rest:        string | null;
  muscles?:    string[];
}

export interface StrengthV2Section {
  section:   'mobility' | 'activation' | 'strength' | 'power_core' | 'accessory';
  label:     string;
  exercises: StrengthV2Exercise[];
}

export interface StrengthWorkoutStructureV2 {
  version:           2;
  session_type:      'lower' | 'upper' | 'general';
  sections:          StrengthV2Section[];
  estimated_minutes: number;
  /** Programme provenance so lazy/recovery paths can re-derive if ever needed. */
  programme?:        { id: string; day_index: number; variant: string; block: number };
  /** Set on deload weeks (non-cycle-tracking users) so the UI can surface it. */
  deload_note?:      string | null;
}

/** Any persisted strength structure; v1 (generated) or v2 (authored programme). */
export type AnyStrengthStructure = StrengthWorkoutStructure | StrengthWorkoutStructureV2;

export function isStrengthV2(s: AnyStrengthStructure | null | undefined): s is StrengthWorkoutStructureV2 {
  return !!s && s.version === 2;
}

// ---- Shared helpers ----

/**
 * One-line text summary of a run structure, e.g.
 *   "4 × 800m @ 4:15/km · 6.8km total"
 *   "18km long run"
 */
export function summariseRunStructure(s: RunWorkoutStructure): string {
  const totalKm = (s.total_distance_m / 1000).toFixed(s.total_distance_m % 1000 === 0 ? 0 : 1);
  if (s.workout_type === 'intervals') {
    const repeat = s.steps.find((st) => st.kind === 'repeat');
    if (repeat?.sub_steps?.length) {
      const work = repeat.sub_steps.find((ss) => ss.kind === 'work');
      const dist = work?.target.distance_m;
      const pace = work?.target.pace_secs_per_km;
      if (dist && pace) {
        const m = Math.floor(pace / 60);
        const sec = String(Math.floor(pace % 60)).padStart(2, '0');
        return `${repeat.repeat_count} × ${dist}m @ ${m}:${sec}/km · ${totalKm}km total`;
      }
    }
  }
  return `${totalKm}km ${s.workout_type.replace('_', ' ')}`;
}

/**
 * One-line text summary of a strength structure, e.g.
 *   "Lower · Romanian Deadlift, Goblet Squat, +3 more · ~45min"
 */
export function summariseStrengthStructure(s: AnyStrengthStructure): string {
  const session = s.session_type.charAt(0).toUpperCase() + s.session_type.slice(1);
  return `${session} · ~${s.estimated_minutes}min`;
}
