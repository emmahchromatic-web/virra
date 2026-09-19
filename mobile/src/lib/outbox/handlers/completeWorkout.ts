import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

/** Supabase errors are plain objects, not `Error` instances. Wrap them so a
 *  failed drain step is a real throw, and so the outbox's classifier still has
 *  the `status`/`code` it needs to tell "retry this" from "this can never
 *  work" -- `new Error(error.message)` threw both away. */
function wrap(prefix: string, error: { message?: string; code?: string; details?: string } | null, status?: number) {
  return new SupabaseWriteError(error?.message ?? prefix, {
    status, code: error?.code, details: error?.details,
  });
}

/**
 * Replays a queued workout completion. Throws on any failure that should
 * count against the drain (retryable → the drain halts and tries again;
 * permanent → dead-lettered); this is the one difference from card 253's
 * `replayCompletion`, which returned a boolean instead.
 *
 * Every write here is idempotent, because a replay is the normal case: the app
 * can be killed, or the network can die, after any one of them.
 */
export async function handleCompleteWorkout(item: MutationPayloadMap['completeWorkout']): Promise<void> {
  const { data: act, error, status } = await supabase
    .from('activities')
    .upsert(item.activity, { onConflict: 'user_id,started_at' })
    .select('id')
    .single();

  if (error) throw wrap('completeWorkout: activity upsert failed', error, status);
  if (!act?.id) throw new SupabaseWriteError('completeWorkout: activity upsert returned no id');

  if (item.kind === 'run') {
    const { error: rErr } = await supabase
      .from('run_details')
      .upsert({ ...item.runDetails, activity_id: act.id }, { onConflict: 'activity_id' });
    if (rErr) console.error('[outbox] run_details upsert failed', rErr);
  } else {
    // `strength_set_logs` has no unique key to upsert against (server-generated
    // pk only), so a plain insert double-logs every set on the second attempt
    // -- and a second attempt is routine: the activity upsert above can succeed
    // and the process die before the item leaves the queue. Clearing this
    // activity's rows first makes the pair converge on exactly the payload's
    // sets however many times it replays.
    //
    // Both halves throw rather than log: having deleted the old rows, silently
    // swallowing a failed insert would leave the workout with NO sets at all
    // and still count the item as sent.
    const { error: delErr, status: delStatus } = await supabase
      .from('strength_set_logs')
      .delete()
      .eq('activity_id', act.id);
    if (delErr) throw wrap('completeWorkout: strength_set_logs delete failed', delErr, delStatus);

    if (item.setRows.length > 0) {
      const { error: sErr, status: sStatus } = await supabase
        .from('strength_set_logs')
        .insert(item.setRows.map((r) => ({ ...r, activity_id: act.id })));
      if (sErr) throw wrap('completeWorkout: strength_set_logs insert failed', sErr, sStatus);
    }
    if (item.details) {
      const { error: dErr } = await supabase
        .from('strength_details')
        .upsert({ ...item.details, activity_id: act.id }, { onConflict: 'activity_id' });
      if (dErr) console.error('[outbox] strength_details upsert failed', dErr);
    }
  }

  if (item.sessionId) {
    const { error: pErr } = await supabase
      .from('planned_sessions')
      .update({ status: 'completed', activity_id: act.id })
      .eq('id', item.sessionId);
    if (pErr) console.error('[outbox] planned_sessions update failed', pErr);
  }
}

registerHandler('completeWorkout', handleCompleteWorkout);
