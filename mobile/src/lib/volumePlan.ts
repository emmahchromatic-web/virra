import { supabase } from './supabase';
import { SESSION_DURATION_MIN } from './sessionMatcher';
import type { CyclePhase } from './cycleEngine';
import { getCycleInfo } from './cycleEngine';
import { getActiveBlocks, computeBlockLoad } from './trainingBlocks';
import type { ModulationResult, SessionType, SessionPaceTarget } from './cycleModulation';
import { modulateForCycle, modulateRunStructure } from './cycleModulation';
import type { CycleProfile } from '@/store/cycle';
import type { RunWorkoutStructure, AnyStrengthStructure } from './workoutStructure';
import { hydratePlannedSessionStructures, persistHydratedRows } from './hydratePlannedSessions';

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
  cycle_modulation:   ModulationResult | null;
  // Phase I: workout structure
  structure:           RunWorkoutStructure | null;
  modulated_structure: RunWorkoutStructure | null;
}

export interface StrengthSessionDetail {
  kind:               'strength';
  planned_session_id: string;
  session_label:      string;
  estimated_minutes:  number;
  status:             string;
  cycle_modulation:   ModulationResult | null;
  // Phase I: workout structure
  structure:          AnyStrengthStructure | null;
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

// Same values: used in split calibration to normalise actual pace to threshold equivalent
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


const PHASE_GUIDANCE: Record<string, string> = {
  follicular: 'Ramp up. Your body adapts faster now.',
  ovulatory:  'Hardest sessions belong here.',
  luteal:     'Hold the work, honour fatigue.',
  menstrual:  'Keep effort light. Rest is training too.',
};

// ---- Cycle modulation helpers ----

function mapLabelToSessionType(label: string): SessionType {
  const L = label.toLowerCase();
  if (L.includes('long'))                                     return 'long';
  if (L.includes('tempo') || L.includes('threshold'))        return 'tempo';
  if (L.includes('interval') || L.includes('vo2'))           return 'intervals';
  if (L.includes('race'))                                     return 'race';
  if (L.includes('lower') || L.includes('upper') || L.includes('strength')) return 'strength';
  return 'easy';
}

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

// Distribute a week's km budget across sessions by label weight.
// long gets 40%: others split the remaining 60% proportionally by TYPE_MODIFIER.
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
  // phase is reserved for future cycle-adjusted goal pacing, not yet applied
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

/**
 * The weekly shape of a block, read from the sessions that actually exist.
 *
 * Two things changed here together, and they are the same change.
 *
 * It used to read the template's `sessions_json`, which stopped being true the
 * moment plans started being generated for the runner rather than copied from a
 * template — the template is now presentation, not content.
 *
 * And it used to REDISTRIBUTE: missed volume was quietly spread across the
 * remaining weeks, inflating them by up to 30%, with a reassuring message when
 * the sum stopped working. The runner never saw any of it, because the session
 * card read its distance from the stored structure rather than from the
 * redistributed figure. Reassuring arithmetic performed on someone's behalf,
 * invisible to them, is not adaptation. Nothing is moved without being asked;
 * the prompt that does the asking lands with the realignment work, and until it
 * does, a missed session is simply a missed session.
 *
 * So: planned volume comes from the sessions themselves, completed volume from
 * the activities linked to them, and nothing is moved without being asked.
 */
export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
  loadScale   = 1.0,
): Promise<VolumePlanResult> {
  const EMPTY: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  const { data: block, error: blockErr } = await supabase
    .from('training_blocks')
    .select('starts_on')
    .eq('id', blockId)
    .single();

  if (blockErr) console.error('[volumePlan] getWeeklyVolumePlan training_blocks fetch:', blockErr.message);
  if (!block?.starts_on) return EMPTY;

  const { data: rows, error: rowsErr } = await supabase
    .from('planned_sessions')
    .select('week_number, status, activity_id, run_structure')
    .eq('block_id', blockId)
    .eq('modality', 'run')
    .in('status', ['planned', 'completed']);

  if (rowsErr) console.error('[volumePlan] getWeeklyVolumePlan planned_sessions fetch:', rowsErr.message);
  if (!rows?.length) return EMPTY;

  const plannedByWeek = new Map<number, number>();
  const activityIds: string[] = [];
  for (const r of rows as Array<{ week_number: number; activity_id: string | null; run_structure: RunWorkoutStructure | null }>) {
    const km = (r.run_structure?.total_distance_m ?? 0) / 1000;
    plannedByWeek.set(r.week_number, (plannedByWeek.get(r.week_number) ?? 0) + km);
    if (r.activity_id) activityIds.push(r.activity_id);
  }

  let completed_km = 0;
  if (activityIds.length > 0) {
    const { data: acts, error: actsErr } = await supabase
      .from('activities')
      .select('distance_meters')
      .in('id', activityIds);
    if (actsErr) console.error('[volumePlan] getWeeklyVolumePlan activities fetch:', actsErr.message);
    completed_km = (acts ?? []).reduce((sum: number, a: any) => sum + (a.distance_meters ?? 0) / 1000, 0);
  }

  const startsOn  = new Date(`${block.starts_on}T00:00:00`);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const currentWeek = Math.floor((Date.now() - startsOn.getTime()) / msPerWeek) + 1;

  const weeks: WeekVolumePlan[] = [...plannedByWeek.keys()]
    .sort((a, b) => a - b)
    .map((weekNumber) => {
      const original = plannedByWeek.get(weekNumber) ?? 0;
      const weekStart = new Date(startsOn.getTime() + (weekNumber - 1) * msPerWeek);
      let phase: CyclePhase | null = null;
      if (cycleStore.periodStart) {
        phase = getCycleInfo(cycleStore.periodStart, cycleStore.cycleLength, weekStart)?.phase ?? null;
      }
      const isPast = weekNumber < currentWeek;
      return {
        week_number: weekNumber,
        original_km: Math.round(original * 10) / 10,
        // Load scaling still applies: a stacked gym block genuinely does take
        // capacity from the run block, and the runner is told that it has.
        adjusted_km: Math.round(original * (isPast ? 1 : loadScale) * 10) / 10,
        phase,
        is_current:  weekNumber === currentWeek,
        is_past:     isPast,
      };
    });

  const total_km = Math.round(weeks.reduce((sum, w) => sum + w.original_km, 0) * 10) / 10;

  return {
    weeks,
    total_km,
    completed_km: Math.round(completed_km * 10) / 10,
    remaining_km: Math.round(Math.max(0, total_km - completed_km) * 10) / 10,
    // Retired with the redistribution it existed to explain. Missing sessions
    // is now a conversation, not a recalculation.
    deficit_message: null,
  };
}

// ---- 1d. Day session detail ----

export async function getDaySessionDetail(
  userId:           string,
  dateISO:          string,
  cycleStore:       { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null },
  cycle_profile:    CycleProfile = 'natural',
  has_placebo_week: boolean | null = null,
): Promise<DayDetail> {
  // Today's phase is used for block-load stacking and goal-pace forecasting
  // (those are forward-looking, "what's my current readiness" concerns).
  const phaseToday = cycleStore.phase;

  // For everything tied to THIS date; the banner, per-session pace modulation,
  // and the volume-adjustment note; use the phase predicted for the date.
  const dateForPhase = new Date(`${dateISO}T00:00:00`);
  const phaseForDate: CyclePhase | null = cycleStore.periodStart
    ? getCycleInfo(cycleStore.periodStart, cycleStore.cycleLength, dateForPhase).phase
    : null;

  const phase_guidance = PHASE_GUIDANCE[phaseForDate ?? ''] ?? '';

  const EMPTY_PLAN: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  // Fetch planned sessions for this date.
  // Filter to planned|completed to match the rest of the app's surfaces
  // (WeekStrip / MonthCalendar / week-move / week-ahead all hide dropped+moved).
  const { data: daySessions, error: daySessionsErr } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status, week_number, block_id, activity_id, run_structure, strength_structure')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .in('status', ['planned', 'completed']);

  if (daySessionsErr) console.error('[volumePlan] getDaySessionDetail planned_sessions fetch:', daySessionsErr.message);

  // Fetch events on this date
  const { data: events, error: eventsErr } = await supabase
    .from('user_events')
    .select('id, name, event_date, priority, target_finish_time')
    .eq('user_id', userId)
    .eq('event_date', dateISO);

  if (eventsErr) console.error('[volumePlan] getDaySessionDetail user_events fetch:', eventsErr.message);

  // Hydrate legacy rows missing workout structure (fire-and-forget persist)
  const { data: profileForCtx } = await supabase
    .from('user_profiles')
    .select('baseline_pace_seconds_per_km, weekly_mileage_km')
    .eq('id', userId)
    .maybeSingle();
  const baselinePaceSecs = profileForCtx?.baseline_pace_seconds_per_km ?? 360;
  const weeklyKm         = profileForCtx?.weekly_mileage_km ?? 30;

  const hydrated = daySessions?.length
    ? hydratePlannedSessionStructures(
        daySessions.map((s: any) => ({
          id:                 s.id,
          modality:           s.modality,
          session_label:      s.session_label,
          run_structure:      s.run_structure ?? null,
          strength_structure: s.strength_structure ?? null,
        })),
        { baseline_pace_secs: baselinePaceSecs, weekly_km: weeklyKm },
      )
    : [];

  persistHydratedRows(hydrated, supabase as any).catch(() => {});

  const structureById: Record<string, { run_structure: any; strength_structure: any }> = {};
  for (const h of hydrated) {
    structureById[h.id] = {
      run_structure:      h.run_structure ?? null,
      strength_structure: h.strength_structure ?? null,
    };
  }

  if (!daySessions?.length) {
    return {
      date:                   dateISO,
      sessions:               [],
      events:                 (events ?? []) as UserEvent[],
      phase:                  phaseForDate,
      phase_guidance,
      volume_plan:            EMPTY_PLAN,
      volume_adjustment_note: buildVolumeAdjustmentNote(1.0, phaseForDate),
    };
  }

  // Group by block_id
  const blockGroups: Record<string, typeof daySessions> = {};
  for (const s of daySessions) {
    if (!blockGroups[s.block_id]) blockGroups[s.block_id] = [];
    blockGroups[s.block_id].push(s);
  }

  // Fetch all active blocks once for stacking computation
  let allActiveBlocks: Awaited<ReturnType<typeof getActiveBlocks>> = [];
  let computedBlocks: ReturnType<typeof computeBlockLoad> = [];
  try {
    allActiveBlocks = await getActiveBlocks(userId);
    computedBlocks  = computeBlockLoad(allActiveBlocks, phaseToday ?? 'follicular');
  } catch (e) {
    console.error('[volumePlan] getDaySessionDetail getActiveBlocks:', e);
  }

  const allSessions: SessionDetail[] = [];
  let volumePlan: VolumePlanResult = EMPTY_PLAN;
  let minRunLoadScale = 1.0;

  for (const [blockId, sessions] of Object.entries(blockGroups)) {
    const runSessions      = sessions.filter((s) => s.modality === 'run');
    const strengthSessions = sessions.filter((s) => s.modality === 'strength');

    if (runSessions.length > 0) {
      const blockIdx = allActiveBlocks.findIndex((b) => b.id === blockId);
      const loadScale = blockIdx >= 0 && computedBlocks[blockIdx]
        ? Math.min(1.0, computedBlocks[blockIdx].effective_load / (computedBlocks[blockIdx].load_modifier || 1))
        : 1.0;
      if (loadScale < minRunLoadScale) minRunLoadScale = loadScale;

      const [goalPace, plan] = await Promise.all([
        getGoalPace(userId, blockId, phaseToday),
        getWeeklyVolumePlan(userId, blockId, {
          periodStart: cycleStore.periodStart,
          cycleLength: cycleStore.cycleLength,
        }, loadScale),
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

      // Distance comes from the session's own structure. It used to come from
      // a share of the redistributed weekly total, while the card's headline
      // read the structure — two different numbers for the same run, and the
      // runner only ever saw one of them. One source now.
      const distMap = distributeWeeklyKm(weekSessions ?? [], weekAdjKm);

      for (const s of runSessions) {
        const structureKm = ((s as { run_structure?: RunWorkoutStructure | null }).run_structure?.total_distance_m ?? 0) / 1000;
        const distance_km = structureKm > 0 ? Math.round(structureKm * 10) / 10 : (distMap[s.id] ?? 0);
        const pace_target_secs = getSessionPaceTarget(goalPace.seconds_per_km, s.session_label, phaseForDate);
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

        const base_distance_km = loadScale < 1.0
          ? Math.round((distance_km / loadScale) * 10) / 10
          : null;

        const run_session_type  = mapLabelToSessionType(s.session_label);
        const run_base_target: SessionPaceTarget = {
          pace_seconds_per_km: pace_target_secs,
          intensity_label:     s.session_label,
        };
        const cycle_modulation = modulateForCycle(
          run_base_target,
          run_session_type,
          phaseForDate,
          cycle_profile,
          has_placebo_week,
        );

        const sRow = s as typeof s & {
          run_structure:      RunWorkoutStructure | null;
          strength_structure: AnyStrengthStructure | null;
        };
        const structure = (structureById[s.id]?.run_structure ?? sRow.run_structure) ?? null;
        const modulated_structure = structure
          ? modulateRunStructure(structure, phaseForDate, cycle_profile, has_placebo_week).adjusted
          : null;

        allSessions.push({
          kind:               'run',
          planned_session_id: s.id,
          session_label:      s.session_label,
          distance_km,
          base_distance_km,
          pace_target_secs,
          estimated_minutes,
          status:             s.status,
          actual_pace_secs,
          actual_distance_km,
          cycle_modulation,
          structure,
          modulated_structure,
        });
      }
    }

    for (const s of strengthSessions) {
      const estimated_minutes = SESSION_DURATION_MIN[s.session_label] ?? 40;
      const strength_session_type = mapLabelToSessionType(s.session_label);
      const strength_base_target: SessionPaceTarget = {
        duration_minutes: estimated_minutes,
        intensity_label:  s.session_label,
      };
      const cycle_modulation = modulateForCycle(
        strength_base_target,
        strength_session_type,
        phaseForDate,
        cycle_profile,
        has_placebo_week,
      );
      const sRow = s as typeof s & {
        run_structure:      RunWorkoutStructure | null;
        strength_structure: AnyStrengthStructure | null;
      };
      allSessions.push({
        kind:               'strength',
        planned_session_id: s.id,
        session_label:      s.session_label,
        estimated_minutes,
        status:             s.status,
        cycle_modulation,
        structure:          (structureById[s.id]?.strength_structure ?? sRow.strength_structure) ?? null,
      });
    }
  }

  return {
    date:                   dateISO,
    sessions:               allSessions,
    events:                 (events ?? []) as UserEvent[],
    phase:                  phaseForDate,
    phase_guidance,
    volume_plan:            volumePlan,
    volume_adjustment_note: buildVolumeAdjustmentNote(minRunLoadScale, phaseForDate),
  };
}
