import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued session drop. An UPDATE matching zero rows resolves
 * `{ error: null }` -- standard PostgREST behaviour, same reasoning as
 * `deleteFoodEntry.ts`'s header -- so there is nothing to special-case beyond
 * "throw on a genuine error, resolve otherwise." That is exactly what
 * replaying this item looks like when the direct write in `sessionStore.ts`
 * already dropped the session before the network dropped the response, or
 * when this same item replays twice.
 */
export async function handleDropSession(payload: MutationPayloadMap['dropSession']): Promise<void> {
  const { error, status } = await supabase
    .from('planned_sessions')
    .update({ status: 'dropped' })
    .eq('id', payload.sessionId);

  if (error) {
    throw new SupabaseWriteError(error.message ?? 'dropSession: planned_sessions update failed', {
      status, code: error.code, details: error.details,
    });
  }
}

registerHandler('dropSession', handleDropSession);
