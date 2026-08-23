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
}

const LOAD_RANK: Record<TrainingLoad, number> = {
  rest: 0, easy: 1, moderate: 2, hard: 3,
};

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
    .select('id, session_label, modality, status')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .in('status', ['planned', 'completed']);

  const sessions = (data ?? []) as PlannedSessionSummary[];

  if (sessions.length === 0) {
    return {
      inferred_load:    'rest',
      planned_sessions: [],
      phase,
      phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
      source_label:     null,
    };
  }

  let topLoad: TrainingLoad = 'easy';
  let topSource = `${sessions[0].session_label} ${sessions[0].modality}`;

  for (const s of sessions) {
    const load = inferLoadFromLabel(s.session_label, s.modality);
    if (LOAD_RANK[load] > LOAD_RANK[topLoad]) {
      topLoad   = load;
      topSource = `${s.session_label} ${s.modality}`;
    }
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

  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
  };
}
