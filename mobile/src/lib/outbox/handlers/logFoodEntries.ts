import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued batch of food-entry inserts. Every call site's `id`(s) are
 * generated client-side before the direct write (`food_entries.id` is `uuid
 * default gen_random_uuid() primary key`, and the default only fires when the
 * column is left unset), so upserting on `id` -- rather than a plain insert --
 * is what makes the replay idempotent: a naive insert would duplicate the
 * row(s) if the direct call actually landed before the network dropped the
 * response. Same pattern as `saveMealCombo.ts`.
 */
export async function handler(payload: MutationPayloadMap['logFoodEntries']): Promise<void> {
  const { error, status } = await supabase
    .from('food_entries')
    .upsert(payload.rows, { onConflict: 'id' });

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'logFoodEntries: food_entries upsert failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('logFoodEntries', handler);
