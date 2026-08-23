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

/** The per-exercise properties the logger resolves live, keyed by exercise name. */
export interface ExerciseSettings {
  loadType: LoadType;
  /**
   * Tempo when every prescription of this exercise agrees on one, which is 58
   * of the 62 that carry a tempo. Null for the handful whose tempo genuinely
   * varies by block, and the logger then falls back to the tempo authored on
   * the session itself.
   */
  defaultTempo: string | null;
}

function isLoadType(v: unknown): v is LoadType {
  return v === 'weighted' || v === 'optional' || v === 'none';
}

/**
 * Live per-exercise metadata, keyed by name. Unknown names are simply absent;
 * callers fall back to DEFAULT_LOAD_TYPE and to the tempo authored on the
 * session, which together are the pre-existing behaviour.
 *
 * Best-effort: returns {} on any error, so a dropped connection costs a stray
 * kg field rather than a broken workout.
 */
export async function getExerciseSettings(exerciseNames: string[]): Promise<Record<string, ExerciseSettings>> {
  if (exerciseNames.length === 0) return {};

  const { data, error } = await supabase
    .from('exercises')
    .select('name, load_type, default_tempo')
    .in('name', exerciseNames);

  if (error || !data) return {};

  const out: Record<string, ExerciseSettings> = {};
  for (const row of data as { name: string; load_type: unknown; default_tempo: unknown }[]) {
    out[row.name] = {
      loadType:     isLoadType(row.load_type) ? row.load_type : DEFAULT_LOAD_TYPE,
      defaultTempo: typeof row.default_tempo === 'string' && row.default_tempo ? row.default_tempo : null,
    };
  }
  return out;
}
