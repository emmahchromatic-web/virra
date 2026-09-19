import { supabase } from '@/lib/supabase';
import { registerHandler, type MutationPayloadMap } from '@/lib/outbox';

/**
 * Replays a queued workout completion. Throws on any failure that should
 * count against the drain (network error → retried; anything else →
 * dead-lettered); this is the one difference from card 253's
 * `replayCompletion`, which returned a boolean instead.
 */
export async function handleCompleteWorkout(item: MutationPayloadMap['completeWorkout']): Promise<void> {
  const { data: act, error } = await supabase
    .from('activities')
    .upsert(item.activity, { onConflict: 'user_id,started_at' })
    .select('id')
    .single();

  // Supabase errors are plain objects, not `Error` instances -- wrap so a
  // failed drain step is always a real throw the outbox (and its tests) can
  // catch with `instanceof Error` / `.toThrow()` semantics.
  if (error) throw new Error(error.message ?? 'completeWorkout: activity upsert failed');
  if (!act?.id) throw new Error('completeWorkout: activity upsert returned no id');

  if (item.kind === 'run') {
    const { error: rErr } = await supabase
      .from('run_details')
      .upsert({ ...item.runDetails, activity_id: act.id }, { onConflict: 'activity_id' });
    if (rErr) console.error('[outbox] run_details upsert failed', rErr);
  } else {
    if (item.setRows.length > 0) {
      const { error: sErr } = await supabase
        .from('strength_set_logs')
        .insert(item.setRows.map((r) => ({ ...r, activity_id: act.id })));
      if (sErr) console.error('[outbox] strength_set_logs insert failed', sErr);
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
