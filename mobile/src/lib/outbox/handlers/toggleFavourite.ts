import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued favourite toggle. Mirrors `recipes.ts`'s own direct
 * `toggleFavourite` write against `recipe_favourites`: an upsert for "on"
 * (idempotent on the table's `(user_id, recipe_id)` primary key, already
 * spec'd that way for exactly this reason), a plain delete for "off". A
 * delete matching zero rows is success, not an error -- same reasoning as
 * `deleteFoodEntry.ts`'s header: neither this table nor any other delete
 * call in this codebase treats a zero-row match specially, and that is
 * exactly what replaying an "off" toggle looks like when a previous attempt
 * already landed, or when the row was never favourited to begin with.
 */
export async function handleToggleFavourite(payload: MutationPayloadMap['toggleFavourite']): Promise<void> {
  const { userId, recipeId, desiredState } = payload;

  const { error, status } = desiredState
    ? await supabase.from('recipe_favourites').upsert(
        { user_id: userId, recipe_id: recipeId },
        { onConflict: 'user_id,recipe_id' },
      )
    : await supabase.from('recipe_favourites')
        .delete()
        .eq('user_id', userId)
        .eq('recipe_id', recipeId);

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'toggleFavourite: recipe_favourites write failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('toggleFavourite', handleToggleFavourite);
