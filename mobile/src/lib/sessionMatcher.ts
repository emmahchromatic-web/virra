import type { Modality } from './dayState';

// Single source of truth for per-label session durations (minutes).
// volumePlan.ts imports this: the matcher derives duration targets from it.
export const SESSION_DURATION_MIN: Record<string, number> = {
  lower:   45,
  upper:   40,
  general: 35,
  yoga:    30,
};
const DEFAULT_DURATION_MIN = 40;

export interface MatchActivity {
  activity_type:    Modality;
  duration_seconds: number;
  distance_meters:  number | null;
}

export interface MatchSession {
  id:            string;
  modality:      Modality;
  session_label: string;
  run_structure: { total_distance_m?: number } | null;
}

export interface MatchCandidate {
  id:           string;
  metric:       'distance' | 'duration';
  target_value: number | null; // metres (distance) or seconds (duration)
}

// Resolve a planned session's completion target.
export function sessionTarget(s: MatchSession): MatchCandidate {
  switch (s.modality) {
    case 'run':
      return { id: s.id, metric: 'distance', target_value: s.run_structure?.total_distance_m ?? null };
    case 'swim':
      return { id: s.id, metric: 'distance', target_value: null }; // no target stored yet
    case 'strength':
      return { id: s.id, metric: 'duration', target_value: (SESSION_DURATION_MIN[s.session_label] ?? DEFAULT_DURATION_MIN) * 60 };
    case 'yoga':
      return { id: s.id, metric: 'duration', target_value: SESSION_DURATION_MIN.yoga * 60 };
    default:
      return { id: s.id, metric: 'duration', target_value: null }; // 'other' excluded
  }
}

// Pick the planned session an activity completes, or null.
// `candidates` must be pre-sorted by created_at for a stable tie-break.
export function matchActivityToSession(
  activity:   MatchActivity,
  candidates: MatchCandidate[],
  opts:       { gateFraction?: number } = {},
): string | null {
  const gate = opts.gateFraction ?? 0.9;
  let best: { id: string; diff: number } | null = null;
  for (const c of candidates) {
    if (c.target_value == null) continue;
    const measured = c.metric === 'distance' ? activity.distance_meters : activity.duration_seconds;
    if (measured == null) continue;
    if (measured < gate * c.target_value) continue;
    const diff = Math.abs(c.target_value - measured);
    if (best === null || diff < best.diff) best = { id: c.id, diff };
  }
  return best?.id ?? null;
}
