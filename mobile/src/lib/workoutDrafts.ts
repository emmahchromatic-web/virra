import { supabase } from '@/lib/supabase';

// One in-progress workout per user (unique on user_id) — starting a new
// session replaces any stale draft left over from a prior interrupted one.
export interface WorkoutDraft {
  id:                 string;
  plannedSessionId:   string | null;
  modality:           string;
  startedAt:          string;   // ISO
  pausedSeconds:      number;
  draft:              Record<string, unknown>;
}

export async function saveWorkoutDraft(
  userId:            string,
  plannedSessionId:  string | null,
  modality:          string,
  startedAt:         string,
  pausedSeconds:      number,
  draft:              Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('workout_drafts').upsert({
    user_id:            userId,
    planned_session_id: plannedSessionId,
    modality,
    started_at:         startedAt,
    paused_seconds:      pausedSeconds,
    draft_json:          draft,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) console.error('[workoutDrafts] save failed', error);
}

export async function loadWorkoutDraft(userId: string): Promise<WorkoutDraft | null> {
  const { data, error } = await supabase
    .from('workout_drafts')
    .select('id, planned_session_id, modality, started_at, paused_seconds, draft_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[workoutDrafts] load failed', error);
    return null;
  }
  if (!data) return null;
  return {
    id:                data.id,
    plannedSessionId:  data.planned_session_id,
    modality:          data.modality,
    startedAt:         data.started_at,
    pausedSeconds:     data.paused_seconds,
    draft:             data.draft_json,
  };
}

export async function deleteWorkoutDraft(userId: string): Promise<void> {
  const { error } = await supabase.from('workout_drafts').delete().eq('user_id', userId);
  if (error) console.error('[workoutDrafts] delete failed', error);
}
