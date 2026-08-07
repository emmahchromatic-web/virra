export interface StrengthSet {
  reps:       number;
  weight_kg:  number;
  rpe?:       number;
}

export interface StrengthExercise {
  name:    string;
  sets:    StrengthSet[];
  notes?:  string;
}

export type SessionType = 'lower' | 'upper' | 'general';

/**
 * Map a session label to a strength library key. Labels come from many sources
 * — the scheduler's own 'lower'/'upper'/'general' keys, but also human-friendly
 * plan labels like "Leg day" or "Upper body" authored in plan templates. The
 * exercise library is keyed only by the three canonical types, so anything that
 * feeds `generateStrengthStructure` must normalise first (an unmapped label
 * would otherwise select no exercises). Unknown labels fall back to 'general'.
 */
export function normalizeStrengthSessionType(label: string | null | undefined): SessionType {
  const L = (label ?? '').toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => L.includes(k));
  // Check 'lower' first so "lower back" resolves to legs, not the 'back' → upper rule.
  if (has('leg', 'lower', 'squat', 'glute', 'hamstring', 'quad', 'calf', 'posterior')) return 'lower';
  if (has('upper', 'push', 'pull', 'arm', 'chest', 'back', 'shoulder', 'bench'))       return 'upper';
  return 'general';
}
