import { supabase } from '@/lib/supabase';

/**
 * Most recent logged weight (kg) per exercise for a user, so the guided runner
 * can pre-fill last session's load. Returns a name → kg map; exercises with no
 * logged history are simply absent. Best-effort: returns {} on any error.
 */
export async function getLastLoggedWeights(
  userId: string,
  exerciseNames: string[],
): Promise<Record<string, number>> {
  if (exerciseNames.length === 0) return {};

  const { data, error } = await supabase
    .from('strength_set_logs')
    .select('exercise_name, weight_kg, completed_at')
    .eq('user_id', userId)
    .in('exercise_name', exerciseNames)
    .not('weight_kg', 'is', null)
    .order('completed_at', { ascending: false });

  if (error || !data) return {};

  // Rows are newest-first, so the first weight seen per exercise is the most
  // recent set logged for it (i.e. last set of the last session).
  const out: Record<string, number> = {};
  for (const row of data as { exercise_name: string; weight_kg: number | null }[]) {
    if (row.weight_kg == null) continue;
    if (!(row.exercise_name in out)) out[row.exercise_name] = row.weight_kg;
  }
  return out;
}

/**
 * Best hold from the last session that logged one, per exercise, in seconds.
 *
 * A hold progresses by time, so "how long did I hold it last time" is the
 * number to beat. Without it someone planks for whatever feels like enough and
 * never knows whether it beat last week.
 *
 * The BEST set of that session rather than the last one: the last of three is
 * usually the shortest, and measuring against a fatigued set makes every week
 * look like a regression. Best-effort: {} on any error.
 */
export async function getLastLoggedHolds(
  userId: string,
  exerciseNames: string[],
): Promise<Record<string, number>> {
  if (exerciseNames.length === 0) return {};

  const { data, error } = await supabase
    .from('strength_set_logs')
    .select('exercise_name, actual_reps, completed_at')
    .eq('user_id', userId)
    .eq('unit', 'seconds')
    .in('exercise_name', exerciseNames)
    .not('actual_reps', 'is', null)
    .order('completed_at', { ascending: false });

  if (error || !data) return {};

  type Row = { exercise_name: string; actual_reps: number | null; completed_at: string | null };
  // Newest-first, so the first date seen for an exercise is its last session.
  // Keep only sets from that day, and take the longest of them.
  const lastDay: Record<string, string> = {};
  const out: Record<string, number> = {};
  for (const row of data as Row[]) {
    if (row.actual_reps == null) continue;
    const day = (row.completed_at ?? '').slice(0, 10);
    if (!(row.exercise_name in lastDay)) lastDay[row.exercise_name] = day;
    if (lastDay[row.exercise_name] !== day) continue;
    if (row.actual_reps > (out[row.exercise_name] ?? 0)) out[row.exercise_name] = row.actual_reps;
  }
  return out;
}
