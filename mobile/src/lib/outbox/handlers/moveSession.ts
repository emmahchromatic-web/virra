import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/**
 * Replays a queued session move: write the replacement row on the new date,
 * then mark the original `moved` and point it at the replacement.
 *
 * IDEMPOTENT ON REPLAY, which the pre-outbox version of this write was not.
 * The old `scheduleGenerator.moveSession` did a SELECT, a plain INSERT, and
 * an UPDATE; replaying it after a partial success (the insert landed, the
 * response never came back) put a SECOND copy of the session on the target
 * date. Two things fix that here:
 *
 * 1. `newSessionId` is generated client-side by `sessionStore.moveSession`
 *    before anything is written, so this step is an `upsert` on a known id.
 *    A replay lands on the same row instead of creating another one.
 * 2. Step 2 is naturally idempotent -- setting `status:'moved'` and the same
 *    `moved_to_id` again is a no-op, and an UPDATE matching zero rows
 *    resolves `{error:null}` (same PostgREST behaviour `dropSession.ts` and
 *    `deleteFoodEntry.ts` rely on).
 *
 * There is deliberately NO SELECT here. Every field the replacement row needs
 * travelled in the payload, captured from the store's cache at the moment the
 * user made the move -- a re-read at replay time would be both a wasted round
 * trip and a correctness hazard (this can run hours later).
 *
 * ORDER MATTERS: the replacement row is written FIRST. If the process dies
 * between the two steps, the worst case is an orphan planned row on the new
 * date with the original still `planned` -- visible, and fixed by the retry.
 * The other order would leave the original `moved` pointing at a row that
 * does not exist, i.e. a session that has silently vanished.
 */
export async function handleMoveSession(payload: MutationPayloadMap['moveSession']): Promise<void> {
  const { error: upsertErr, status: upsertStatus } = await supabase
    .from('planned_sessions')
    .upsert({
      id:                 payload.newSessionId,
      user_id:            payload.userId,
      block_id:           payload.blockId,
      scheduled_date:     payload.newDate,
      week_number:        payload.weekNumber,
      day_of_week:        payload.dayOfWeek,
      modality:           payload.modality,
      session_label:      payload.sessionLabel,
      status:             'planned',
      run_structure:      payload.runStructure,
      strength_structure: payload.strengthStructure,
    }, { onConflict: 'id' });

  if (upsertErr) {
    // `code` has to survive: 23505 (a clash on
    // `planned_sessions_no_clash_idx`) is what tells `isPermanentError` this
    // can never succeed on a retry, so the item dead-letters instead of
    // spinning forever.
    throw new SupabaseWriteError(upsertErr.message ?? 'moveSession: planned_sessions upsert failed', {
      status: upsertStatus, code: upsertErr.code, details: upsertErr.details,
    });
  }

  const { error: updateErr, status: updateStatus } = await supabase
    .from('planned_sessions')
    .update({ status: 'moved', moved_to_id: payload.newSessionId })
    .eq('id', payload.sessionId);

  if (updateErr) {
    throw new SupabaseWriteError(updateErr.message ?? 'moveSession: planned_sessions update failed', {
      status: updateStatus, code: updateErr.code, details: updateErr.details,
    });
  }
}

registerHandler('moveSession', handleMoveSession);
