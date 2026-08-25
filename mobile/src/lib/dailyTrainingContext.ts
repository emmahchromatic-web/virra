import { supabase } from './supabase';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from './nutritionTargets';
import { getActiveBlocks, computeBlockLoad } from './trainingBlocks';

export interface PlannedSessionSummary {
  id:            string;
  session_label: string;
  modality:      string;
  status:        string;
}

export interface DailyTrainingContext {
  inferred_load:    TrainingLoad;
  planned_sessions: PlannedSessionSummary[];
  phase:            CyclePhase | null;
  phase_guidance:   string;
  source_label:     string | null;
  /** True when more than one effort contributed, so the load was stepped up. */
  stacked:          boolean;
}

const LOAD_RANK: Record<TrainingLoad, number> = {
  rest: 0, easy: 1, moderate: 2, hard: 3,
};

const LOAD_BY_RANK: TrainingLoad[] = ['rest', 'easy', 'moderate', 'hard'];

/** One tier harder, capped at 'hard'. */
function stepUp(load: TrainingLoad): TrainingLoad {
  return LOAD_BY_RANK[Math.min(LOAD_RANK[load] + 1, 3)];
}

// Unplanned work (a hike, an extra gym trip, anything imported from HealthKit
// that isn't a planned session) still has to be fuelled. Duration is the only
// signal every activity type shares, so the tiers are drawn on time. Anything
// under the floor is noise, not training, and must not move a rest day.
const UNPLANNED_FLOOR_MIN    = 20;
const UNPLANNED_MODERATE_MIN = 45;
const UNPLANNED_HARD_MIN     = 90;

export function inferLoadFromActivity(durationSeconds: number): TrainingLoad | null {
  const minutes = durationSeconds / 60;
  if (minutes < UNPLANNED_FLOOR_MIN)    return null;
  if (minutes < UNPLANNED_MODERATE_MIN) return 'easy';
  if (minutes < UNPLANNED_HARD_MIN)     return 'moderate';
  return 'hard';
}

const LABEL_TO_LOAD: Record<string, TrainingLoad> = {
  long:        'hard',
  race:        'hard',
  interval:    'hard',
  tempo:       'hard',
  threshold:   'hard',
  moderate:    'moderate',
  progression: 'moderate',
  easy:        'easy',
  recovery:    'easy',
  base:        'easy',
};

const STRENGTH_LABEL_TO_LOAD: Record<string, TrainingLoad> = {
  lower:   'moderate',
  upper:   'moderate',
  general: 'easy',
};

export function inferLoadFromLabel(label: string, modality: string): TrainingLoad {
  const key = label.toLowerCase().trim();
  if (modality === 'strength') return STRENGTH_LABEL_TO_LOAD[key] ?? 'easy';
  return LABEL_TO_LOAD[key] ?? 'easy';
}

// Shared gym phase algorithm; used by plan detail UI and nutrition context
export function gymWeekPhase(weekIndex: number, totalWeeks: number): string {
  const w = weekIndex + 1; // 1-indexed
  if (totalWeeks >= 20) {
    const deloadAStart = Math.round(totalWeeks * 0.33);
    const deloadBStart = Math.round(totalWeeks * 0.67);
    if (w <= Math.round(totalWeeks * 0.15)) return 'Foundation';
    if (w < deloadAStart)       return 'Build';
    if (w <= deloadAStart + 1)  return 'Deload';
    if (w < deloadBStart)       return 'Strength';
    if (w <= deloadBStart + 1)  return 'Deload';
    return 'Peak';
  } else {
    const deloadStart = Math.round(totalWeeks * 0.55);
    if (w <= Math.round(totalWeeks * 0.2)) return 'Foundation';
    if (w < deloadStart)        return 'Build';
    if (w <= deloadStart + 1)   return 'Deload';
    if (w <= Math.round(totalWeeks * 0.85)) return 'Strength';
    return 'Peak';
  }
}

const PHASE_GUIDANCE: Record<CyclePhase, string> = {
  menstrual:  'Keep effort light. Rest is training too.',
  follicular: 'Ramp up. Your body adapts faster now.',
  ovulatory:  'Hardest sessions belong here.',
  luteal:     'Hold the work, honour fatigue.',
};

export async function getDailyTrainingContext(
  userId:  string,
  dateISO: string,
  phase:   CyclePhase | null,
): Promise<DailyTrainingContext> {
  const { data } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status, activity_id')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .in('status', ['planned', 'completed']);

  const sessions = (data ?? []) as PlannedSessionSummary[];

  // Unplanned work counts too. An activity already matched to one of today's
  // planned sessions is that session, so counting both would double up.
  const linkedIds = new Set(
    sessions.map((s) => (s as { activity_id?: string | null }).activity_id).filter(Boolean) as string[],
  );
  const unplanned: { label: string; load: TrainingLoad }[] = [];
  try {
    const { data: acts } = await supabase
      .from('activities')
      .select('id, activity_type, duration_seconds, started_at, planned_session_id')
      .eq('user_id', userId)
      // A day either side, then filtered on the local date below: started_at is
      // a timestamptz, so slicing it in UTC would drop early and late sessions.
      .gte('started_at', `${dateISO}T00:00:00`)
      .lt('started_at', `${nextDayISO(dateISO)}T23:59:59`);

    for (const a of acts ?? []) {
      if (a.planned_session_id || linkedIds.has(a.id)) continue;
      if (localDateOf(a.started_at) !== dateISO) continue;
      const load = inferLoadFromActivity(a.duration_seconds ?? 0);
      if (load) unplanned.push({ label: `${a.activity_type} (unplanned)`, load });
    }
  } catch (e) {
    console.error('[dailyTrainingContext] activities fetch:', e);
  }

  const contributors: { label: string; load: TrainingLoad }[] = [
    ...sessions.map((s) => ({
      label: `${s.session_label} ${s.modality}`,
      load:  inferLoadFromLabel(s.session_label, s.modality),
    })),
    ...unplanned,
  ];

  if (contributors.length === 0) {
    return {
      inferred_load:    'rest',
      planned_sessions: [],
      phase,
      phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
      source_label:     null,
      stacked:          false,
    };
  }

  let topLoad: TrainingLoad = contributors[0].load;
  let topSource = contributors[0].label;
  for (const c of contributors) {
    if (LOAD_RANK[c.load] > LOAD_RANK[topLoad]) {
      topLoad   = c.load;
      topSource = c.label;
    }
  }

  // Two efforts in a day cost more than the harder one alone, so stacking
  // steps the tier up rather than taking a plain max. `hardestSingle` is kept
  // as a floor below: the suppression rules may cancel the step-up, but a
  // double day must never end up fuelled lighter than one of its own sessions.
  const hardestSingle = topLoad;
  const stacked       = contributors.length > 1;
  if (stacked) {
    topLoad = stepUp(topLoad);
    topSource = `${contributors.length} sessions`;
  }

  try {
    const allBlocks = await getActiveBlocks(userId);
    const computed  = computeBlockLoad(allBlocks, phase ?? 'follicular');

    // Run stacking: scale load down when gym volume is suppressing run capacity
    const runIdx = allBlocks.findIndex((b) => b.modality === 'run');
    if (runIdx >= 0 && computed[runIdx]) {
      const loadScale = Math.min(
        1.0,
        computed[runIdx].effective_load / (computed[runIdx].load_modifier || 1),
      );
      if (loadScale < 0.75) {
        if (topLoad === 'hard' || topLoad === 'moderate') topLoad = 'easy';
      } else if (loadScale < 0.85) {
        if (topLoad === 'hard') topLoad = 'moderate';
      }
    }

    // Gym Cut phase: step load down by one tier to reduce calorie targets
    const today = new Date(`${dateISO}T00:00:00`);
    const inCutWeek = allBlocks
      .filter((b) => b.modality === 'strength')
      .some((b) => {
        const start     = new Date(`${b.starts_on}T00:00:00`);
        const totalWeeks = b.ends_on
          ? Math.ceil((new Date(`${b.ends_on}T00:00:00`).getTime() - start.getTime()) / (7 * 86400000))
          : 12;
        const weekIdx = Math.floor((today.getTime() - start.getTime()) / (7 * 86400000));
        return weekIdx >= 0 && weekIdx < totalWeeks && gymWeekPhase(weekIdx, totalWeeks) === 'Deload';
      });
    if (inCutWeek) {
      if (topLoad === 'hard')     topLoad = 'moderate';
      else if (topLoad !== 'rest') topLoad = 'easy';
    }
  } catch (e) {
    console.error('[dailyTrainingContext] stacking fetch:', e);
  }

  // Never let the suppression rules push a day below its own hardest session.
  if (LOAD_RANK[topLoad] < LOAD_RANK[hardestSingle]) topLoad = hardestSingle;

  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
    stacked,
  };
}

/** The day after an ISO date, as an ISO date. */
function nextDayISO(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

/** Local (not UTC) calendar date of a timestamptz, as 'YYYY-MM-DD'. */
function localDateOf(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA');
}
