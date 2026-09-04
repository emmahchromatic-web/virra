import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Card 253. Finishing a workout with no signal.
 *
 * Both workout screens wrote straight to Supabase and gave up on failure, in
 * two different and equally bad ways:
 *
 *   run.tsx           showed "Save failed" and kept the run in component state
 *                     and nowhere else, so closing the app lost it entirely.
 *   workout-preview   kept its draft, so nothing was lost, but told the user to
 *                     "tap Finish again to retry" -- which cannot succeed until
 *                     signal returns. In a gym basement that is the whole
 *                     session, and it is what Emma hit.
 *
 * So the fix is not better error copy. A workout finished out of signal has to
 * be finishable, which means recording the intent locally and replaying it when
 * the network comes back.
 *
 * WHY THE WHOLE SEQUENCE IS REPLAYED RATHER THAN THE ROWS. Set logs and detail
 * rows carry `activity_id`, which does not exist until the activity insert
 * succeeds. Queuing the finished rows would mean queuing an id that was never
 * issued, so the queue holds the INTENT and the flush performs the same
 * ordered writes the online path does.
 *
 * IDEMPOTENCY. `activities` is unique on (user_id, started_at) -- the same
 * constraint the HealthKit import upserts against -- so a replay that partly
 * succeeded and is retried cannot create a duplicate workout.
 */

const KEY_PREFIX = 'virra:pending_completions:v1:';

export const pendingKeyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export interface QueuedRun {
  kind:       'run';
  queuedAt:   string;
  sessionId:  string | null;
  activity:   Record<string, unknown>;
  runDetails: Record<string, unknown>;
}

export interface QueuedStrength {
  kind:      'strength';
  queuedAt:  string;
  sessionId: string | null;
  activity:  Record<string, unknown>;
  setRows:   Record<string, unknown>[];
  details:   Record<string, unknown> | null;
}

export type PendingCompletion = QueuedRun | QueuedStrength;

export async function readQueue(userId: string): Promise<PendingCompletion[]> {
  try {
    const raw = await AsyncStorage.getItem(pendingKeyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt queue must never block someone finishing a workout.
    return [];
  }
}

async function writeQueue(userId: string, queue: PendingCompletion[]): Promise<void> {
  await AsyncStorage.setItem(pendingKeyFor(userId), JSON.stringify(queue));
}

/** Same started_at means the same workout, however many times it was queued. */
export function dedupe(queue: PendingCompletion[]): PendingCompletion[] {
  const seen = new Set<string>();
  const out: PendingCompletion[] = [];
  for (const item of queue) {
    const key = `${item.kind}:${String(item.activity.started_at)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function enqueueCompletion(userId: string, item: PendingCompletion): Promise<void> {
  const queue = await readQueue(userId);
  await writeQueue(userId, dedupe([...queue, item]));
}

export async function clearQueue(userId: string): Promise<void> {
  await AsyncStorage.removeItem(pendingKeyFor(userId));
}

/**
 * Replay one queued completion. Returns true when the activity landed, which
 * is the only part that decides whether the item can be dropped.
 *
 * Child writes are best-effort exactly as they are online: a failed set-log
 * insert already only logs there, and re-queuing the whole workout because a
 * sidecar row failed would risk looping forever on a row that will never
 * succeed.
 */
export async function replayCompletion(item: PendingCompletion): Promise<boolean> {
  const { data: act, error } = await supabase
    .from('activities')
    .upsert(item.activity, { onConflict: 'user_id,started_at' })
    .select('id')
    .single();

  if (error || !act?.id) return false;

  if (item.kind === 'run') {
    await supabase
      .from('run_details')
      .upsert({ ...item.runDetails, activity_id: act.id }, { onConflict: 'activity_id' });
  } else {
    if (item.setRows.length > 0) {
      await supabase
        .from('strength_set_logs')
        .insert(item.setRows.map((r) => ({ ...r, activity_id: act.id })));
    }
    if (item.details) {
      await supabase
        .from('strength_details')
        .upsert({ ...item.details, activity_id: act.id }, { onConflict: 'activity_id' });
    }
  }

  if (item.sessionId) {
    await supabase
      .from('planned_sessions')
      .update({ status: 'completed', activity_id: act.id })
      .eq('id', item.sessionId);
  }

  return true;
}

/**
 * Try everything queued. Anything that fails stays queued for the next attempt,
 * so this is safe to call on every foreground.
 */
export async function flushPendingCompletions(userId: string): Promise<{ sent: number; left: number }> {
  const queue = await readQueue(userId);
  if (queue.length === 0) return { sent: 0, left: 0 };

  const remaining: PendingCompletion[] = [];
  let sent = 0;
  for (const item of queue) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await replayCompletion(item).catch(() => false);
    if (ok) sent += 1;
    else remaining.push(item);
  }

  if (remaining.length === 0) await clearQueue(userId);
  else await writeQueue(userId, remaining);

  return { sent, left: remaining.length };
}
