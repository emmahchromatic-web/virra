import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued daily check-in. The upsert is already naturally idempotent
 * on `(user_id, recorded_on)` -- the same conflict key `checkin.tsx` uses for
 * its direct write -- so a replay after a partial success just overwrites with
 * the same (or a newer, corrected) payload. Nothing else to reconcile: unlike
 * `completeWorkout`, there is no child-row fan-out here.
 */
export async function handleCheckIn(payload: MutationPayloadMap['checkIn']): Promise<void> {
  const { error, status } = await supabase
    .from('symptom_logs')
    .upsert(payload, { onConflict: 'user_id,recorded_on' });

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'checkIn: symptom_logs upsert failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('checkIn', handleCheckIn);
