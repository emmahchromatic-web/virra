import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued food-entry delete. A delete that matches zero rows is
 * success, not an error -- Postgres/PostgREST does not error a DELETE that
 * affects no rows, and neither `food_entries` nor any other delete call in
 * this codebase (`trainingBlocks.ts`, `workoutDrafts.ts`, `describe-meal.tsx`,
 * `completeWorkout.ts`'s `strength_set_logs` clear) chains `.select()` after
 * `.delete()` to change that. That is exactly what replaying this item looks
 * like when the direct call in `nutrition.tsx` already removed the row before
 * the network dropped the response, or when this same item replays twice --
 * so there is nothing to special-case beyond "throw on a genuine error,
 * resolve otherwise."
 */
export async function handleDeleteFoodEntry(payload: MutationPayloadMap['deleteFoodEntry']): Promise<void> {
  const { error, status } = await supabase
    .from('food_entries')
    .delete()
    .eq('id', payload.entryId);

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'deleteFoodEntry: food_entries delete failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('deleteFoodEntry', handleDeleteFoodEntry);
