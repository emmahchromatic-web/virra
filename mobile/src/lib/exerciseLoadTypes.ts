import { supabase } from '@/lib/supabase';

/**
 * Whether an exercise takes a weight.
 *
 *   weighted  loaded movement; the kg field is shown (the default)
 *   optional  bodyweight by default, but people progress it by adding load
 *             (a vest, a held dumbbell); the field sits behind an "add weight" tap
 *   none      never loaded, so no kg field at all
 *
 * Read live from the exercises table rather than baked into the session at
 * enrol time, so correcting one is a single cell in the dashboard and takes
 * effect on the next session, with no release and no reschedule.
 */
export type LoadType = 'weighted' | 'optional' | 'none';

export const DEFAULT_LOAD_TYPE: LoadType = 'weighted';

function isLoadType(v: unknown): v is LoadType {
  return v === 'weighted' || v === 'optional' || v === 'none';
}

/**
 * Load type per exercise name. Unknown names are simply absent; callers should
 * fall back to DEFAULT_LOAD_TYPE, which preserves the old always-show-kg
 * behaviour. Best-effort: returns {} on any error, so a dropped connection
 * costs the user a stray kg field rather than a broken workout.
 */
export async function getLoadTypes(exerciseNames: string[]): Promise<Record<string, LoadType>> {
  if (exerciseNames.length === 0) return {};

  const { data, error } = await supabase
    .from('exercises')
    .select('name, load_type')
    .in('name', exerciseNames);

  if (error || !data) return {};

  const out: Record<string, LoadType> = {};
  for (const row of data as { name: string; load_type: unknown }[]) {
    if (isLoadType(row.load_type)) out[row.name] = row.load_type;
  }
  return out;
}
