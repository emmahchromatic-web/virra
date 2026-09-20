import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued food-entry macro edit. Unlike `deleteFoodEntry`, a zero-row
 * match here is a genuine failure, not a success-in-disguise: there is no
 * state left to converge on when the row is already gone (the direct call in
 * `FoodEntryEditModal` succeeded before the app went offline, or a duplicate
 * dead-lettered item is replaying), so retrying forever would just spin. No
 * other update call in this codebase (`trainingBlocks.ts`, `sessionStore`'s
 * `moveSession`, `completeWorkout.ts`) chains `.select()` after `.update()` to
 * detect this, so the check here is the simplest correct one: request the
 * updated row's id back and treat an empty result as not-found.
 *
 * The synthesized `status: 404` (PostgREST itself never 404s a zero-row
 * update) is what routes this into `isPermanentError`'s ordinary "4xx, not in
 * RETRYABLE_STATUSES" branch in outbox.ts, so it dead-letters on the first
 * attempt instead of being retried forever.
 */
export async function handleUpdateFoodEntry(payload: MutationPayloadMap['updateFoodEntry']): Promise<void> {
  const { data, error, status } = await supabase
    .from('food_entries')
    .update({
      quantity_g: payload.quantityG,
      calories:   payload.calories,
      carbs_g:    payload.carbsG,
      protein_g:  payload.proteinG,
      fat_g:      payload.fatG,
      fibre_g:    payload.fibreG,
    })
    .eq('id', payload.entryId)
    .select('id');

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'updateFoodEntry: food_entries update failed', {
      status, code: error.code, details: error.details,
    });
  }

  if (!data || data.length === 0) {
    throw new SupabaseWriteError('updateFoodEntry: no matching food_entries row (already deleted?)', {
      status: 404,
    });
  }
}

registerHandler('updateFoodEntry', handleUpdateFoodEntry);
