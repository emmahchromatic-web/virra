import { supabase } from './supabase';
import { generateRunStructure } from './runWorkoutGenerator';
import type { Verdict } from './baselineCalibration';
import type { RunWorkoutStructure } from './workoutStructure';

/**
 * Enact a confirmed Fitness Update: write the new baseline, append history,
 * record the assessment (also the cooldown anchor), and regenerate the
 * run_structure of upcoming planned runs from the new baseline.
 *
 * `today` is injected (ISO yyyy-mm-dd) for testability; `statedLevel` is the
 * user's current fitness_level for the assessment record.
 */
export async function applyBaselineUpdate(
  userId: string,
  verdict: Verdict,
  today: string,
  statedLevel: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Read existing assessment_history, then write baseline + appended snapshot.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('assessment_history')
    .eq('id', userId)
    .single();

  const history = [
    ...(Array.isArray(profile?.assessment_history) ? profile!.assessment_history : []),
    {
      on: today,
      from: verdict.current,
      to: verdict.proposed,
      direction: verdict.direction,
      n_runs: verdict.nRuns,
      window_days: verdict.windowDays,
    },
  ];

  const { error: profileErr } = await supabase
    .from('user_profiles')
    .update({ baseline_pace_seconds_per_km: verdict.proposed, assessment_history: history })
    .eq('id', userId);
  if (profileErr) {
    throw new Error(`[applyBaselineUpdate] profile write failed: ${profileErr.message}`);
  }

  // 2. Record the assessment (cooldown anchor). A failed insert is recoverable
  // (the modal may re-fire); a stale baseline would be worse, so log, don't throw.
  const { error: assessErr } = await supabase.from('fitness_assessments').insert({
    user_id: userId,
    assessed_on: today,
    stated_level: statedLevel,
    actual_pace_seconds_per_km: verdict.proposed,
    trigger_description: verdict.evidence,
    direction: verdict.direction,
    celebrated_at: nowIso,
  });
  if (assessErr) {
    console.warn('[applyBaselineUpdate] assessment insert failed:', assessErr.message);
  }

  // 3. Regenerate run_structure for upcoming planned runs from the new baseline.
  const { data: upcoming } = await supabase
    .from('planned_sessions')
    .select('id, session_label, run_structure')
    .eq('user_id', userId)
    .eq('modality', 'run')
    .eq('status', 'planned')
    .gte('scheduled_date', today);

  for (const row of (upcoming ?? []) as Array<{ id: string; session_label: string; run_structure: RunWorkoutStructure | null }>) {
    const distanceM = row.run_structure?.total_distance_m;
    if (!distanceM || distanceM <= 0) continue; // nothing to base distance on; leave as-is
    try {
      const fresh = generateRunStructure({
        session_label: row.session_label,
        baseline_pace_secs: verdict.proposed,
        distance_km: distanceM / 1000,
      });
      await supabase.from('planned_sessions').update({ run_structure: fresh }).eq('id', row.id);
    } catch {
      // Unrecognised workout type: skip this session, keep its existing structure.
    }
  }
}
