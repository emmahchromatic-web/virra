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
 *
 * `replaceCriteria` (describe-meal.tsx's re-estimate path only) is replayed
 * first, exactly matching the direct (online) write's order: delete the
 * prior haiku rows for this `(log_id, haiku_input)` pair, then upsert the new
 * ones. The delete is deliberately non-fatal -- a pre-existing product
 * decision, not new here -- so a failure there only warns and never blocks
 * the upsert. Deleting an already-deleted set of rows is a no-op, so
 * replaying this delete on a later drain attempt is safe.
 */
export async function handler({ rows, replaceCriteria }: MutationPayloadMap['logFoodEntries']): Promise<void> {
  if (replaceCriteria) {
    const { error: delErr } = await supabase
      .from('food_entries')
      .delete()
      .eq('log_id', replaceCriteria.logId)
      .eq('haiku_input', replaceCriteria.haikuInput);
    if (delErr) console.warn('[logFoodEntries] failed to remove prior haiku rows:', delErr.message);
  }

  const { error, status } = await supabase
    .from('food_entries')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'logFoodEntries: food_entries upsert failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('logFoodEntries', handler);
