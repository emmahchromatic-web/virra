import { supabase } from './supabase';
import { generateRunStructure } from './runWorkoutGenerator';

/**
 * Race distances in kilometres. 'ultra' has no fixed distance, so it keeps
 * whatever the plan already had rather than inventing a number.
 */
const DISTANCE_KM: Record<string, number | null> = {
  '5k':            5,
  '10k':           10,
  half_marathon:   21.1,
  marathon:        42.2,
  ultra:           null,
};

const DEFAULT_BASELINE_PACE_SECS = 360;

export interface RaceEvent {
  event_date:    string;
  distance_goal: string | null;
}

export interface RaceApplyResult {
  /** 'converted' an existing session, or 'none' when there was nothing to convert. */
  outcome: 'converted' | 'none';
  reason?: string;
}

/**
 * Make the plan agree with the calendar on race day.
 *
 * Adding an event used to write a user_events row and nothing else: the
 * schedule generator has never been event-aware, and recomputeSeasonForUser
 * only fires for two or more future events. So a parkrun added as a race left
 * the day's generated session untouched, and the calendar went on showing a
 * 3.9km tempo run with a small flag beside it. Raised in build 11 UAT, card 26.
 *
 * Converting rather than inserting is deliberate: planned_sessions.block_id is
 * NOT NULL, so a session cannot exist outside a training block. On a day with
 * no run planned there is nothing to attach a race to, and the event stays an
 * annotation until the user builds a plan that covers it.
 */
export async function applyRaceToSchedule(
  userId: string,
  event:  RaceEvent,
): Promise<RaceApplyResult> {
  const { data: sessions, error } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status, run_structure')
    .eq('user_id', userId)
    .eq('scheduled_date', event.event_date)
    .eq('modality', 'run')
    .eq('status', 'planned')
    .order('created_at');

  if (error) return { outcome: 'none', reason: error.message };
  if (!sessions?.length) return { outcome: 'none', reason: 'no run planned on that date' };

  // Only ever one race per day. If the plan somehow put two runs on the date,
  // the first is the race and the rest are left alone for the user to move.
  const target = sessions[0];
  if (target.session_label === 'race') return { outcome: 'converted' };

  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('baseline_pace_seconds_per_km')
    .eq('id', userId)
    .maybeSingle();
  const baselinePaceSecs =
    profileRow?.baseline_pace_seconds_per_km ?? DEFAULT_BASELINE_PACE_SECS;

  const plannedKm =
    (target.run_structure as { total_distance_m?: number } | null)?.total_distance_m != null
      ? (target.run_structure as { total_distance_m: number }).total_distance_m / 1000
      : null;
  const distanceKm =
    (event.distance_goal ? DISTANCE_KM[event.distance_goal] : null) ?? plannedKm ?? 10;

  const { error: updateErr } = await supabase
    .from('planned_sessions')
    .update({
      session_label: 'race',
      run_structure: generateRunStructure({
        session_label:      'race',
        baseline_pace_secs: baselinePaceSecs,
        distance_km:        distanceKm,
      }),
    })
    .eq('id', target.id);

  if (updateErr) return { outcome: 'none', reason: updateErr.message };
  return { outcome: 'converted' };
}
