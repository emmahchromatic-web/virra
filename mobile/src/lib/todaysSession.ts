import { supabase } from './supabase';
import { modulateForCycle, modulateRunStructure, type SessionType } from './cycleModulation';
import { summariseRunStructure, summariseStrengthStructure } from './workoutStructure';
import { useCycleStore } from '@/store/cycle';
import { hydratePlannedSessionStructures, persistHydratedRows } from './hydratePlannedSessions';

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
  // Cycle modulation badge
  cycle_adjusted_pace_secs: number | null; // null if no modulation OR no pace target
  cycle_reason_short:       string | null; // first sentence of the modulation reason
  cycle_pace_arrow:         '↑' | '↓' | null; // direction of pace adjustment
  // Phase I — one-line workout structure summary (null when no structure stored yet)
  structure_summary: string | null;
}

interface PlannedSessionRow {
  id:             string;
  modality:       TodaysSession['modality'];
  session_label:  string;
  status:         TodaysSession['status'];
  activity_id:    string | null;
  run_structure?:      import('./workoutStructure').RunWorkoutStructure | null;
  strength_structure?: import('./workoutStructure').StrengthWorkoutStructure | null;
}

function mapLabelToSessionType(label: string): SessionType {
  const L = label.toLowerCase();
  if (L.includes('long'))                                                  return 'long';
  if (L.includes('tempo') || L.includes('threshold'))                     return 'tempo';
  if (L.includes('interval') || L.includes('vo2'))                        return 'intervals';
  if (L.includes('race'))                                                  return 'race';
  if (L.includes('lower') || L.includes('upper') || L.includes('strength')) return 'strength';
  return 'easy';
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
    .select('id, modality, session_label, status, activity_id, run_structure, strength_structure')
    .eq('user_id', userId)
    .eq('scheduled_date', today)
    .neq('status', 'moved')
    .neq('status', 'dropped')
    .order('created_at');
  if (error || !planned?.length) return [];

  return enrichTodaysSessions(userId, planned as PlannedSessionRow[]);
}

/**
 * Enrichment-only variant: takes planned rows that have already been fetched
 * (e.g. from the shared session store) and returns hydrated `TodaysSession`s.
 * Excludes 'moved' and 'dropped' rows defensively.
 */
export async function enrichTodaysSessions(
  userId: string,
  plannedRows: PlannedSessionRow[],
): Promise<TodaysSession[]> {
  const rows = plannedRows.filter((r) => r.status !== 'moved' && r.status !== 'dropped');
  if (!rows.length) return [];

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const activityIds = rows.map((r) => r.activity_id).filter((id): id is string => !!id);

  // Fetch baseline pace and activity data in parallel
  const [activityResult, profileResult, todayActsResult] = await Promise.all([
    activityIds.length
      ? supabase
          .from('activities')
          .select('id, activity_type, distance_meters, duration_seconds')
          .in('id', activityIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('user_profiles')
      .select('baseline_pace_seconds_per_km, weekly_mileage_km')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('activities')
      .select('id, activity_type, distance_meters, duration_seconds, planned_session_id, started_at')
      .eq('user_id', userId)
      .gte('started_at', `${today}T00:00:00`)
      .lt('started_at',  `${today}T23:59:59`),
  ]);

  const activityMap: Record<string, ActivityRow> = Object.fromEntries(
    ((activityResult.data ?? []) as ActivityRow[]).map((a) => [a.id, a])
  );

  const baselinePace: number = profileResult.data?.baseline_pace_seconds_per_km ?? 360;
  const weeklyKm:    number = profileResult.data?.weekly_mileage_km ?? 30;

  const hydrated = hydratePlannedSessionStructures(
    rows.map((r) => ({
      id:                 r.id,
      modality:           r.modality,
      session_label:      r.session_label,
      run_structure:      r.run_structure ?? null,
      strength_structure: r.strength_structure ?? null,
    })),
    { baseline_pace_secs: baselinePace, weekly_km: weeklyKm },
  );

  // Fire-and-forget persistence
  persistHydratedRows(hydrated, supabase as any).catch(() => {});

  // Merge hydrated structures back onto the planned rows (preserves status/activity_id)
  const structureById: Record<string, { run_structure: any; strength_structure: any }> = {};
  for (const h of hydrated) {
    structureById[h.id] = {
      run_structure:      h.run_structure ?? null,
      strength_structure: h.strength_structure ?? null,
    };
  }

  // Also surface any activity logged today that DIDN'T link to a planned session —
  // gives the lenient completion match a chance to recover if the auto-linker missed it.
  // We only fold in matching-modality unmatched activities for sessions still 'planned'.
  const unlinkedByModality: Record<string, ActivityRow> = {};
  for (const a of (todayActsResult.data ?? []) as (ActivityRow & { planned_session_id: string | null })[]) {
    if (a.planned_session_id) continue;
    unlinkedByModality[a.activity_type] = a;
  }

  // Read cycle state synchronously from Zustand — free, no DB round trip
  const cycleState     = useCycleStore.getState();
  const cyclePhase     = cycleState.cycleInfo?.phase ?? null;
  const cycleProfile   = cycleState.cycleProfile;
  const hasPlaceboWeek = cycleState.hasPlaceboWeek;

  return rows.map((r) => {
    const linked = r.activity_id ? activityMap[r.activity_id] : undefined;
    const fallback = r.status === 'planned' ? unlinkedByModality[r.modality] : undefined;
    const act = linked ?? fallback;

    // Compute cycle modulation for run sessions only (strength has no pace target)
    let cycle_adjusted_pace_secs: number | null = null;
    let cycle_reason_short: string | null        = null;
    let cycle_pace_arrow: '↑' | '↓' | null      = null;

    if (r.modality === 'run') {
      const sessionType = mapLabelToSessionType(r.session_label);
      const baseTarget = {
        pace_seconds_per_km: baselinePace,
        intensity_label:     r.session_label,
      };
      const result = modulateForCycle(baseTarget, sessionType, cyclePhase, cycleProfile, hasPlaceboWeek);

      if (result.reason) {
        cycle_reason_short = result.reason.split(/[.—]/)[0]?.trim() ?? null;

        const adjustedPace = result.adjusted_target.pace_seconds_per_km;
        if (adjustedPace && adjustedPace !== baselinePace) {
          cycle_adjusted_pace_secs = adjustedPace;
          // Faster pace = lower seconds/km value
          cycle_pace_arrow = adjustedPace < baselinePace ? '↑' : '↓';
        }
      }
    } else if (r.modality === 'strength') {
      // Strength sessions: surface reason text only, no pace arrow
      const sessionType = mapLabelToSessionType(r.session_label);
      const baseTarget = { intensity_label: r.session_label };
      const result = modulateForCycle(baseTarget, sessionType, cyclePhase, cycleProfile, hasPlaceboWeek);
      if (result.reason) {
        cycle_reason_short = result.reason.split(/[.—]/)[0]?.trim() ?? null;
      }
    }

    const hydratedRun      = structureById[r.id]?.run_structure ?? r.run_structure;
    const hydratedStrength = structureById[r.id]?.strength_structure ?? r.strength_structure;

    let structure_summary: string | null = null;
    if (r.modality === 'run' && hydratedRun) {
      const modulated = modulateRunStructure(hydratedRun, cyclePhase, cycleProfile, hasPlaceboWeek).adjusted;
      structure_summary = summariseRunStructure(modulated);
    } else if (r.modality === 'strength' && hydratedStrength) {
      structure_summary = summariseStrengthStructure(hydratedStrength);
    }

    return {
      id:                    r.id,
      modality:              r.modality,
      session_label:         r.session_label,
      status:                act && r.status === 'planned' ? 'completed' : r.status,
      activity_id:           r.activity_id ?? act?.id ?? null,
      actual_distance_m:     act?.distance_meters ?? null,
      actual_duration_s:     act?.duration_seconds ?? null,
      actual_activity_type:  act?.activity_type ?? null,
      cycle_adjusted_pace_secs,
      cycle_reason_short,
      cycle_pace_arrow,
      structure_summary,
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
