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
