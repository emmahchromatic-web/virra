import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { detectBaselineDrift, type Verdict, type CompletedRunSample } from '@/lib/baselineCalibration';
import { applyBaselineUpdate } from '@/lib/applyBaselineUpdate';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

const DEFAULT_PACE = 360;
const SNOOZE_DAYS = 21;
const WINDOW_DAYS = 42;

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function useFitnessUpdate(userId: string | null) {
  const cycleProfile   = useCycleStore((s) => s.cycleProfile);
  const hasPlaceboWeek = useCycleStore((s) => s.hasPlaceboWeek);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [statedLevel, setStatedLevel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setVerdict(null); return; }
    const today = todayIso();
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toLocaleDateString('en-CA');

    const [profileRes, assessRes, breaksRes, sessRes, upcomingRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('baseline_pace_seconds_per_km, fitness_level, fitness_check_snoozed_until')
        .eq('id', userId)
        .single(),
      supabase
        .from('fitness_assessments')
        .select('assessed_on')
        .eq('user_id', userId)
        .order('assessed_on', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // training_breaks uses break_start / break_end (not starts_on / ends_on)
      supabase
        .from('training_breaks')
        .select('break_start, break_end')
        .eq('user_id', userId),
      // Step 1 of two-step join (proven pattern from volumePlan.ts):
      // fetch completed run planned_sessions for their label, structure, date, and activity_id
      supabase
        .from('planned_sessions')
        .select('id, session_label, run_structure, scheduled_date')
        .eq('user_id', userId)
        .eq('modality', 'run')
        .eq('status', 'completed')
        .gte('scheduled_date', windowStart),
      supabase
        .from('planned_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('modality', 'run')
        .eq('status', 'planned')
        .gte('scheduled_date', today),
    ]);

    if (profileRes.error) {
      console.warn('[useFitnessUpdate] profile fetch failed:', profileRes.error.message);
      setVerdict(null);
      return;
    }

    const baseline = profileRes.data?.baseline_pace_seconds_per_km ?? DEFAULT_PACE;
    setStatedLevel(profileRes.data?.fitness_level ?? null);

    // Step 2: fetch activities (with run_details) for the session ids we just found.
    // PostgREST returns run_details as an array even for a 1:1 relation; see insightMetrics.ts:239.
    const sessionRows = sessRes.data ?? [];
    const sessionIds = sessionRows.map((r: any) => r.id as string).filter(Boolean);

    let activitiesData: any[] = [];
    if (sessionIds.length > 0) {
      const { data } = await supabase
        .from('activities')
        .select('planned_session_id, distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km, elevation_gain_meters)')
        .in('planned_session_id', sessionIds);
      activitiesData = data ?? [];
    }

    // Build a map from planned_session_id → activity row for quick lookup
    const actBySessionId = new Map<string, any>();
    for (const act of activitiesData) {
      if (act.planned_session_id) actBySessionId.set(act.planned_session_id, act);
    }

    const samples: CompletedRunSample[] = sessionRows.map((row: any) => {
      const act = actBySessionId.get(row.id) ?? null;
      // run_details is a 1:many array from PostgREST even though it's a 1:1 FK
      const rd = act?.run_details ? (Array.isArray(act.run_details) ? act.run_details[0] : act.run_details) : null;
      return {
        avg_pace_secs: rd?.avg_pace_seconds_per_km ?? 0,
        distance_m: act?.distance_meters ?? 0,
        elevation_gain_m: rd?.elevation_gain_meters ?? null,
        phase_at_time: act?.phase_at_time ?? null,
        session_label: row.session_label,
        run_structure: row.run_structure as RunWorkoutStructure | null,
        scheduled_date: row.scheduled_date,
      };
    }).filter((s: CompletedRunSample) => s.avg_pace_secs > 0);

    const v = detectBaselineDrift({
      samples,
      currentBaseline: baseline,
      cycleProfile,
      hasPlaceboWeek,
      today,
      lastAssessmentDate: assessRes.data?.assessed_on ?? null,
      snoozedUntil: profileRes.data?.fitness_check_snoozed_until ?? null,
      // training_breaks real column names: break_start / break_end
      breaks: (breaksRes.data ?? []).map((b: any) => ({ start: b.break_start, end: b.break_end })),
      hasUpcomingRuns: (upcomingRes.count ?? 0) > 0,
    });
    setVerdict(v);
  }, [userId, cycleProfile, hasPlaceboWeek]);

  useEffect(() => { refresh(); }, [refresh]);

  const confirm = useCallback(async () => {
    if (!userId || !verdict) return;
    await applyBaselineUpdate(userId, verdict, todayIso(), statedLevel);
    setVerdict(null);
  }, [userId, verdict, statedLevel]);

  const snooze = useCallback(async () => {
    if (!userId) return;
    const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString();
    await supabase.from('user_profiles').update({ fitness_check_snoozed_until: until }).eq('id', userId);
    setVerdict(null);
  }, [userId]);

  return { verdict, confirm, snooze, refresh };
}
