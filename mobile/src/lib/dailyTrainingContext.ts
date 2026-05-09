import { supabase } from './supabase';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from './nutritionTargets';

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

const PHASE_GUIDANCE: Record<CyclePhase, string> = {
  menstrual:  'Keep effort light — rest is training too.',
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

  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
  };
}
