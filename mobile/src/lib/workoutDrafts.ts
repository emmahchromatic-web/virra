import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const LOCAL_KEY_PREFIX = 'virra:workout_draft:v1:';
const localKeyFor = (userId: string) => `${LOCAL_KEY_PREFIX}${userId}`;

// One in-progress workout per user (unique on user_id) — starting a new
// session replaces any stale draft left over from a prior interrupted one.
export interface WorkoutDraft {
  id:                string;
  plannedSessionId:  string | null;
  modality:          string;
  startedAt:         string;   // ISO
  pausedSeconds:     number;
  draft:             Record<string, unknown>;
}

export async function saveWorkoutDraft(
  userId:            string,
  plannedSessionId:  string | null,
  modality:          string,
  startedAt:         string,
  pausedSeconds:     number,
  draft:             Record<string, unknown>,
): Promise<void> {
  // Local write first: this is what actually survives a gym with no signal.
  // The Supabase mirror below is best-effort, same as it always was.
  try {
    const record: WorkoutDraft = { id: userId, plannedSessionId, modality, startedAt, pausedSeconds, draft };
    await AsyncStorage.setItem(localKeyFor(userId), JSON.stringify(record));
  } catch (e) {
    console.error('[workoutDrafts] local save failed', e);
  }

  const { error } = await supabase.from('workout_drafts').upsert({
    user_id:            userId,
    planned_session_id: plannedSessionId,
    modality,
    started_at:         startedAt,
    paused_seconds:      pausedSeconds,
    draft_json:          draft,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) console.error('[workoutDrafts] remote save failed', error);
}

export async function loadWorkoutDraft(userId: string): Promise<WorkoutDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(localKeyFor(userId));
    if (raw) return JSON.parse(raw) as WorkoutDraft;
  } catch (e) {
    console.error('[workoutDrafts] local load failed', e);
  }

  // No local draft — a fresh install, or a crash before the first local
  // write. Fall back to whatever Supabase last received.
  const { data, error } = await supabase
    .from('workout_drafts')
    .select('id, planned_session_id, modality, started_at, paused_seconds, draft_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[workoutDrafts] remote load failed', error);
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
  try {
    await AsyncStorage.removeItem(localKeyFor(userId));
  } catch (e) {
    console.error('[workoutDrafts] local delete failed', e);
  }
  const { error } = await supabase.from('workout_drafts').delete().eq('user_id', userId);
  if (error) console.error('[workoutDrafts] remote delete failed', error);
}
