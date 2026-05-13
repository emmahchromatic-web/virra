import { supabase } from './supabase';

export interface TodaysSession {
  id:             string;
  modality:       'run' | 'strength' | 'swim' | 'yoga' | 'other';
  session_label:  string;
  status:         'planned' | 'completed' | 'dropped' | 'moved';
  activity_id:    string | null;
  // Hydrated from the linked activity, when status === 'completed'
  actual_distance_m?:  number | null;
  actual_duration_s?:  number | null;
  actual_activity_type?: string | null;
}

interface PlannedSessionRow {
  id:             string;
  modality:       TodaysSession['modality'];
  session_label:  string;
  status:         TodaysSession['status'];
  activity_id:    string | null;
}

interface ActivityRow {
  id:               string;
  activity_type:    string;
  distance_meters:  number | null;
  duration_seconds: number | null;
}

/**
 * Returns the user's planned sessions for today, with linked activity metrics
 * hydrated when the session has been completed. Excludes 'moved' (which leaves
 * a placeholder pointing to a replacement row) and 'dropped' (intentionally
 * abandoned). The caller decides how to render an empty list — e.g. "Rest day"
 * or "No session planned".
 */
export async function getTodaysSessions(userId: string): Promise<TodaysSession[]> {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const { data: planned, error } = await supabase
    .from('planned_sessions')
    .select('id, modality, session_label, status, activity_id')
    .eq('user_id', userId)
    .eq('scheduled_date', today)
    .neq('status', 'moved')
    .neq('status', 'dropped')
    .order('created_at');
  if (error || !planned?.length) return [];

  const rows = planned as PlannedSessionRow[];
  const activityIds = rows.map((r) => r.activity_id).filter((id): id is string => !!id);

  let activityMap: Record<string, ActivityRow> = {};
  if (activityIds.length) {
    const { data: acts } = await supabase
      .from('activities')
      .select('id, activity_type, distance_meters, duration_seconds')
      .in('id', activityIds);
    activityMap = Object.fromEntries(((acts ?? []) as ActivityRow[]).map((a) => [a.id, a]));
  }

  // Also surface any activity logged today that DIDN'T link to a planned session —
  // gives the lenient completion match a chance to recover if the auto-linker missed it.
  // We only fold in matching-modality unmatched activities for sessions still 'planned'.
  const { data: todayActs } = await supabase
    .from('activities')
    .select('id, activity_type, distance_meters, duration_seconds, planned_session_id, started_at')
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`)
    .lt('started_at',  `${today}T23:59:59`);

  const unlinkedByModality: Record<string, ActivityRow> = {};
  for (const a of (todayActs ?? []) as (ActivityRow & { planned_session_id: string | null })[]) {
    if (a.planned_session_id) continue;
    unlinkedByModality[a.activity_type] = a;
  }

  return rows.map((r) => {
    const linked = r.activity_id ? activityMap[r.activity_id] : undefined;
    const fallback = r.status === 'planned' ? unlinkedByModality[r.modality] : undefined;
    const act = linked ?? fallback;
    return {
      id:                    r.id,
      modality:              r.modality,
      session_label:         r.session_label,
      status:                act && r.status === 'planned' ? 'completed' : r.status,
      activity_id:           r.activity_id ?? act?.id ?? null,
      actual_distance_m:     act?.distance_meters ?? null,
      actual_duration_s:     act?.duration_seconds ?? null,
      actual_activity_type:  act?.activity_type ?? null,
    };
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (!meters) return '';
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(1)}km` : `${km.toFixed(2)}km`;
}
