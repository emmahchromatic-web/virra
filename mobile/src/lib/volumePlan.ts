import { supabase } from './supabase';
import type { CyclePhase } from './cycleEngine';
import { getCycleInfo } from './cycleEngine';

// ---- Interfaces ----

export interface GoalPace {
  seconds_per_km: number;
  source: 'event_target' | 'split_calibrated' | 'baseline';
}

export interface WeekVolumePlan {
  week_number: number;
  original_km: number;
  adjusted_km: number;
  phase:       CyclePhase | null;
  is_current:  boolean;
  is_past:     boolean;
}

export interface VolumePlanResult {
  weeks:           WeekVolumePlan[];
  total_km:        number;
  completed_km:    number;
  remaining_km:    number;
  deficit_message: string | null;
}

export interface RunSessionDetail {
  kind:               'run';
  planned_session_id: string;
  session_label:      string;
  distance_km:        number;         // post-stacking (actual target)
  base_distance_km:   number | null;  // pre-gym-scale; null when no stacking
  pace_target_secs:   number;
  estimated_minutes:  number;
  status:             string;
  actual_pace_secs:   number | null;
  actual_distance_km: number | null;
}

export interface StrengthSessionDetail {
  kind:               'strength';
  planned_session_id: string;
  session_label:      string;
  estimated_minutes:  number;
  status:             string;
}

export type SessionDetail = RunSessionDetail | StrengthSessionDetail;

export interface UserEvent {
  id:                 string;
  name:               string;
  event_date:         string;
  priority:           number;
  target_finish_time: string | null;
}

export interface DayDetail {
  date:                   string;
  sessions:               SessionDetail[];
  events:                 UserEvent[];
  phase:                  CyclePhase | null;
  phase_guidance:         string;
  volume_plan:            VolumePlanResult;
  volume_adjustment_note: string | null;
}

// Input type for the pure redistribution function (exported for tests)
export interface WeekInput {
  week_number: number;
  original_km: number;
  phase:       CyclePhase | null;
  is_current:  boolean;
  is_past:     boolean;
  is_taper:    boolean;
}

// ---- Constants ----

const RACE_DISTANCES: Record<string, number | null> = {
  '5k':            5.0,
  '10k':           10.0,
  'half_marathon': 21.0975,
  'marathon':      42.195,
  'general':       null,
};

const TYPE_MODIFIER: Record<string, number> = {
  interval:    0.92,
  tempo:       1.00,
  threshold:   1.00,
  race:        1.00,
  moderate:    1.05,
  progression: 1.05,
  long:        1.15,
  easy:        1.20,
  recovery:    1.20,
  base:        1.20,
};

// Same values — used in split calibration to normalise actual pace to threshold equivalent
const TYPE_INVERSE_MODIFIER: Record<string, number> = { ...TYPE_MODIFIER };

const PHASE_MODIFIER: Record<string, number> = {
  ovulatory:  0.97,
  follicular: 0.98,
  luteal:     1.03,
  menstrual:  1.05,
};

const PHASE_WEIGHT: Record<string, number> = {
  follicular: 1.15,
  ovulatory:  1.10,
  luteal:     0.90,
  menstrual:  0.85,
};

const STRENGTH_DURATION: Record<string, number> = {
  lower:   45,
  upper:   40,
  general: 35,
};

const PHASE_GUIDANCE: Record<string, string> = {
  follicular: 'Ramp up. Your body adapts faster now.',
  ovulatory:  'Hardest sessions belong here.',
  luteal:     'Hold the work, honour fatigue.',
  menstrual:  'Keep effort light — rest is training too.',
};

export function buildVolumeAdjustmentNote(
  loadScale: number,
  phase: CyclePhase | null,
): string | null {
  const gymReduced   = loadScale < 1.0;
  const phaseReduced = phase === 'luteal' || phase === 'menstrual';
  if (!gymReduced && !phaseReduced) return null;
  const parts: string[] = [];
  if (gymReduced)   parts.push('gym block');
  if (phaseReduced) parts.push(`${phase} phase`);
  return `Volume adjusted · ${parts.join(' + ')}`;
}

// ---- Helpers (exported for tests) ----

export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  const mins  = Math.floor(total / 60);
  const secs  = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

// Pure redistribution — takes remaining km and week metadata, returns adjusted km per week.
// Past weeks always get 0 (their original_km is already counted in completed_km).
export function _redistributeKm(remainingKm: number, weeks: WeekInput[]): number[] {
  const remaining = weeks.filter((w) => !w.is_past);
  if (!remaining.length) return weeks.map(() => 0);

  // Weights: phase × front-load decay (0-indexed within remaining weeks)
  const rawWeights = remaining.map((w, i) => {
    const phaseW = PHASE_WEIGHT[w.phase ?? ''] ?? 1.0;
    return phaseW * Math.pow(0.92, i);
  });
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);

  // Initial allocation
  let alloc = remaining.map((w, i) => remainingKm * rawWeights[i] / totalWeight);

  // Apply caps: taper weeks → original_km; others → 1.30 × original_km
  let overflow = 0;
  const uncappedIdx: number[] = [];
  alloc = alloc.map((km, i) => {
    const cap = remaining[i].is_taper
      ? remaining[i].original_km
      : remaining[i].original_km * 1.30;
    if (km > cap) {
      overflow += km - cap;
      return cap;
    }
    uncappedIdx.push(i);
    return km;
  });

  // Redistribute overflow evenly to uncapped weeks (best-effort)
  if (overflow > 0 && uncappedIdx.length > 0) {
    const extra = overflow / uncappedIdx.length;
    uncappedIdx.forEach((i) => {
      const cap = remaining[i].is_taper
        ? remaining[i].original_km
        : remaining[i].original_km * 1.30;
      alloc[i] = Math.min(cap, alloc[i] + extra);
    });
  }

  // Map back to full weeks array (past → 0)
  const result: number[] = [];
  let ri = 0;
  for (const w of weeks) {
    result.push(w.is_past ? 0 : (alloc[ri++] ?? 0));
  }
  return result;
}

// Distribute a week's km budget across sessions by label weight.
// long gets 40%; others split the remaining 60% proportionally by TYPE_MODIFIER.
// Without a long session, all sessions split proportionally by TYPE_MODIFIER.
export function distributeWeeklyKm(
  sessions: Array<{ id: string; session_label: string }>,
  weekKm:   number,
): Record<string, number> {
  const result: Record<string, number> = {};
  const hasLong = sessions.some((s) => s.session_label === 'long');

  if (hasLong) {
    const longS = sessions.find((s) => s.session_label === 'long')!;
    result[longS.id] = weekKm * 0.40;
    const others = sessions.filter((s) => s.session_label !== 'long');
    const remaining = weekKm * 0.60;
    const totalMod = others.reduce((sum, s) => sum + (TYPE_MODIFIER[s.session_label] ?? 1.0), 0);
    others.forEach((s) => {
      result[s.id] = totalMod > 0
        ? remaining * (TYPE_MODIFIER[s.session_label] ?? 1.0) / totalMod
        : remaining / others.length;
    });
  } else {
    const totalMod = sessions.reduce((sum, s) => sum + (TYPE_MODIFIER[s.session_label] ?? 1.0), 0);
    sessions.forEach((s) => {
      result[s.id] = totalMod > 0
        ? weekKm * (TYPE_MODIFIER[s.session_label] ?? 1.0) / totalMod
        : weekKm / sessions.length;
    });
  }
  return result;
}

// ---- 1a. Goal pace ----

export async function getGoalPace(
  userId:  string,
  blockId: string,
  // phase is reserved for future cycle-adjusted goal pacing — not yet applied
  phase:   CyclePhase | null,
): Promise<GoalPace> {
  const DEFAULT_PACE = 360; // 6:00/km fallback

  const [blockRes, profileRes] = await Promise.all([
    supabase
      .from('training_blocks')
      .select('event_id, template:plan_templates(distance_goal)')
      .eq('id', blockId)
      .single(),
    supabase
      .from('user_profiles')
      .select('baseline_pace_seconds_per_km')
      .eq('id', userId)
      .single(),
  ]);

  if (blockRes.error) console.error('[volumePlan] getGoalPace training_blocks fetch:', blockRes.error.message);
  if (profileRes.error) console.error('[volumePlan] getGoalPace user_profiles fetch:', profileRes.error.message);

  const block    = blockRes.data;
  const baseline = profileRes.data?.baseline_pace_seconds_per_km ?? DEFAULT_PACE;

  // Source 1: event target finish time
  if (block?.event_id) {
    const { data: evt } = await supabase
      .from('user_events')
      .select('target_finish_time')
      .eq('id', block.event_id)
      .single();

    const distGoal = (block.template as any)?.distance_goal ?? null;
    const raceKm   = distGoal ? (RACE_DISTANCES[distGoal] ?? null) : null;

    if (evt?.target_finish_time && raceKm) {
      const parts      = evt.target_finish_time.split(':').map(Number);
      const finishSecs = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
      if (finishSecs > 0 && raceKm > 0) {
        return { seconds_per_km: finishSecs / raceKm, source: 'event_target' };
      }
    }
  }

  // Source 2: split-calibrated from ≥3 completed run sessions in this block
  const { data: completedSessions, error: sessionsErr } = await supabase
    .from('planned_sessions')
    .select('id, session_label')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .eq('modality', 'run');

  if (sessionsErr) console.error('[volumePlan] getGoalPace planned_sessions fetch:', sessionsErr.message);

  if ((completedSessions?.length ?? 0) >= 3) {
    const sessionIds = completedSessions!.map((s) => s.id);
    const { data: runData, error: runDataErr } = await supabase
      .from('activities')
      .select('planned_session_id, run_details(avg_pace_seconds_per_km)')
      .in('planned_session_id', sessionIds);

    if (runDataErr) console.error('[volumePlan] getGoalPace activities fetch:', runDataErr.message);

    const labelMap = Object.fromEntries(
      (completedSessions ?? []).map((s) => [s.id, s.session_label])
    );

    const validRuns = (runData ?? []).filter(
      (r: any) => r.run_details?.[0]?.avg_pace_seconds_per_km
    );

    if (validRuns.length >= 3) {
      const estimates = validRuns.map((r: any) => {
        const modifier = TYPE_INVERSE_MODIFIER[labelMap[r.planned_session_id]] ?? 1.0;
        return (r.run_details[0].avg_pace_seconds_per_km as number) / modifier;
      });
      const avg = estimates.reduce((a: number, b: number) => a + b, 0) / estimates.length;
      if (baseline > 0 && Math.abs(avg - baseline) / baseline > 0.05) {
        return { seconds_per_km: avg, source: 'split_calibrated' };
      }
    }
  }

  // Source 3: baseline
  return { seconds_per_km: baseline, source: 'baseline' };
}

// ---- 1b. Session pace target (pure function) ----

export function getSessionPaceTarget(
  goalPace:     number,
  sessionLabel: string,
  phase:        CyclePhase | null,
): number {
  const typeMod  = TYPE_MODIFIER[sessionLabel] ?? 1.0;
  const phaseMod = PHASE_MODIFIER[phase ?? ''] ?? 1.0;
  return goalPace * typeMod * phaseMod;
}

// ---- 1c. Weekly volume plan ----

export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
  loadScale   = 1.0,
): Promise<VolumePlanResult> {
  const EMPTY: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  // Fetch block + template + sessions_json
  const { data: block, error: blockErr } = await supabase
    .from('training_blocks')
    .select('starts_on, event_id, template:plan_templates(sessions_json, distance_goal)')
    .eq('id', blockId)
    .single();

  if (blockErr) console.error('[volumePlan] getWeeklyVolumePlan training_blocks fetch:', blockErr.message);
  if (!block) return EMPTY;
  if (!block.starts_on) return EMPTY;

  const sessionsJson: Array<{ week: number; km: number }> =
    (block.template as any)?.sessions_json ?? [];
  if (!sessionsJson.length) return EMPTY;

  const total_km = sessionsJson.reduce((sum, w) => sum + (w.km ?? 0), 0);

  // Completed km from linked activities
  const { data: completedLinks, error: linksErr } = await supabase
    .from('planned_sessions')
    .select('activity_id')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .not('activity_id', 'is', null);

  if (linksErr) console.error('[volumePlan] getWeeklyVolumePlan completedLinks fetch:', linksErr.message);

  let completed_km = 0;
  const actIds = (completedLinks ?? []).map((r: any) => r.activity_id).filter(Boolean);
  if (actIds.length > 0) {
    const { data: acts, error: actsErr } = await supabase
      .from('activities')
      .select('distance_meters')
      .in('id', actIds);
    if (actsErr) console.error('[volumePlan] getWeeklyVolumePlan activities fetch:', actsErr.message);
    completed_km = (acts ?? []).reduce(
      (sum: number, a: any) => sum + (a.distance_meters ?? 0) / 1000,
      0,
    );
  }

  const remaining_km = Math.max(0, total_km - completed_km);

  // Determine current week index from starts_on
  const startsOn    = new Date(`${block.starts_on}T00:00:00`);
  const today       = new Date();
  const msPerWeek   = 7 * 24 * 60 * 60 * 1000;
  const currentWeek = Math.floor((today.getTime() - startsOn.getTime()) / msPerWeek) + 1;

  // Build week metadata with cycle phase projection
  const weekInputs: WeekInput[] = sessionsJson.map((w, i) => {
    const weekStart = new Date(startsOn.getTime() + i * msPerWeek);
    let phase: CyclePhase | null = null;
    if (cycleStore.periodStart) {
      const info = getCycleInfo(cycleStore.periodStart, cycleStore.cycleLength, weekStart);
      phase = info?.phase ?? null;
    }
    const isPast  = w.week < currentWeek;
    const isTaper = i > 0 && w.km < sessionsJson[i - 1].km;
    return {
      week_number: w.week,
      original_km: w.km,
      phase,
      is_current: w.week === currentWeek,
      is_past:    isPast,
      is_taper:   isTaper,
    };
  });

  const adjustedKms = _redistributeKm(remaining_km, weekInputs);

  const achievableKm = adjustedKms.reduce((sum, km) => sum + km, 0) + completed_km;
  const deficit_km   = Math.max(0, total_km - achievableKm - 0.5); // 0.5 km tolerance

  let deficit_message: string | null = null;
  if (deficit_km > 0) {
    const distGoal = (block.template as any)?.distance_goal ?? null;
    const raceKm   = distGoal ? (RACE_DISTANCES[distGoal] ?? null) : null;

    if (raceKm) {
      const { seconds_per_km: goalPaceSecs } = await getGoalPace(userId, blockId, null);
      const deficitRatio = deficit_km / total_km;
      const revisedPace  = goalPaceSecs * (1 + deficitRatio * 0.3);
      deficit_message    = `Whilst you've missed some sessions, your goal is still within reach. Hit the remaining sessions and aim for a revised pace of ${formatPace(revisedPace)} on race day.`;
    } else {
      deficit_message =
        "Whilst you've missed some sessions, your goal is still within reach — hit the remaining sessions to give yourself the best chance.";
    }
  }

  const weeks: WeekVolumePlan[] = weekInputs.map((w, i) => ({
    week_number: w.week_number,
    original_km: w.original_km,
    adjusted_km: w.is_past
      ? w.original_km
      : Math.round(adjustedKms[i] * loadScale * 10) / 10,
    phase:       w.phase,
    is_current:  w.is_current,
    is_past:     w.is_past,
  }));

  return { weeks, total_km, completed_km, remaining_km, deficit_message };
}

// ---- 1d. Day session detail ----

export async function getDaySessionDetail(
  userId:     string,
  dateISO:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null },
): Promise<DayDetail> {
  const phase          = cycleStore.phase;
  const phase_guidance = PHASE_GUIDANCE[phase ?? ''] ?? '';

  const EMPTY_PLAN: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  // Fetch planned sessions for this date
  const { data: daySessions, error: daySessionsErr } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status, week_number, block_id, activity_id')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .neq('status', 'moved');

  if (daySessionsErr) console.error('[volumePlan] getDaySessionDetail planned_sessions fetch:', daySessionsErr.message);

  // Fetch events on this date
  const { data: events, error: eventsErr } = await supabase
    .from('user_events')
    .select('id, name, event_date, priority, target_finish_time')
    .eq('user_id', userId)
    .eq('event_date', dateISO);

  if (eventsErr) console.error('[volumePlan] getDaySessionDetail user_events fetch:', eventsErr.message);

  if (!daySessions?.length) {
    return {
      date:                   dateISO,
      sessions:               [],
      events:                 (events ?? []) as UserEvent[],
      phase,
      phase_guidance,
      volume_plan:            EMPTY_PLAN,
      volume_adjustment_note: null,
    };
  }

  // Group by block_id
  const blockGroups: Record<string, typeof daySessions> = {};
  for (const s of daySessions) {
    if (!blockGroups[s.block_id]) blockGroups[s.block_id] = [];
    blockGroups[s.block_id].push(s);
  }

  const allSessions: SessionDetail[] = [];
  let volumePlan: VolumePlanResult = EMPTY_PLAN;

  for (const [blockId, sessions] of Object.entries(blockGroups)) {
    const runSessions      = sessions.filter((s) => s.modality === 'run');
    const strengthSessions = sessions.filter((s) => s.modality === 'strength');

    if (runSessions.length > 0) {
      const [goalPace, plan] = await Promise.all([
        getGoalPace(userId, blockId, phase),
        getWeeklyVolumePlan(userId, blockId, {
          periodStart: cycleStore.periodStart,
          cycleLength: cycleStore.cycleLength,
        }),
      ]);
      volumePlan = plan;

      const weekNumber = runSessions[0]?.week_number ?? 1;
      const weekPlan   = plan.weeks.find((w) => w.week_number === weekNumber);
      const weekAdjKm  = weekPlan?.adjusted_km ?? 0;

      // Get all active run sessions in this week for this block (for km distribution)
      const { data: weekSessions, error: weekSessionsErr } = await supabase
        .from('planned_sessions')
        .select('id, session_label')
        .eq('block_id', blockId)
        .eq('week_number', weekNumber)
        .eq('modality', 'run')
        .in('status', ['planned', 'completed']);

      if (weekSessionsErr) console.error('[volumePlan] getDaySessionDetail weekSessions fetch:', weekSessionsErr.message);

      const distMap = distributeWeeklyKm(weekSessions ?? [], weekAdjKm);

      for (const s of runSessions) {
        const distance_km      = distMap[s.id] ?? 0;
        const pace_target_secs = getSessionPaceTarget(goalPace.seconds_per_km, s.session_label, phase);
        const estimated_minutes = pace_target_secs > 0
          ? Math.round(distance_km * pace_target_secs / 60)
          : 0;

        let actual_pace_secs:   number | null = null;
        let actual_distance_km: number | null = null;
        if (s.status === 'completed' && s.activity_id) {
          const [rdRes, actRes] = await Promise.all([
            supabase
              .from('run_details')
              .select('avg_pace_seconds_per_km')
              .eq('activity_id', s.activity_id)
              .maybeSingle(),
            supabase
              .from('activities')
              .select('distance_meters')
              .eq('id', s.activity_id)
              .maybeSingle(),
          ]);
          actual_pace_secs   = rdRes.data?.avg_pace_seconds_per_km ?? null;
          actual_distance_km = actRes.data?.distance_meters
            ? actRes.data.distance_meters / 1000
            : null;
        }

        allSessions.push({
          kind:               'run',
          planned_session_id: s.id,
          session_label:      s.session_label,
          distance_km,
          base_distance_km:   null,
          pace_target_secs,
          estimated_minutes,
          status:             s.status,
          actual_pace_secs,
          actual_distance_km,
        });
      }
    }

    for (const s of strengthSessions) {
      const estimated_minutes = STRENGTH_DURATION[s.session_label] ?? 40;
      allSessions.push({
        kind:               'strength',
        planned_session_id: s.id,
        session_label:      s.session_label,
        estimated_minutes,
        status:             s.status,
      });
    }
  }

  return {
    date:                   dateISO,
    sessions:               allSessions,
    events:                 (events ?? []) as UserEvent[],
    phase,
    phase_guidance,
    volume_plan:            volumePlan,
    volume_adjustment_note: null,
  };
}
