import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued "save as meal" combo. `nutrition.tsx`'s direct write
 * generates the combo's `id` client-side (a real uuid -- `meal_combos.id` is
 * `uuid primary key default gen_random_uuid()`, and the default only fires
 * when the column is left unset, so a client-supplied value is honoured) and
 * uses the same id whether the direct insert succeeds or this handler ends up
 * replaying it. Upserting on that id -- rather than a plain insert -- is what
 * makes the replay idempotent: a naive insert would create a duplicate combo
 * if the direct call actually landed before the network dropped the response.
 */
export async function handleSaveMealCombo(payload: MutationPayloadMap['saveMealCombo']): Promise<void> {
  const { error, status } = await supabase
    .from('meal_combos')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'saveMealCombo: meal_combos upsert failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('saveMealCombo', handleSaveMealCombo);
