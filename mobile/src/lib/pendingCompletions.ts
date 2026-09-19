/**
 * Card 253. Finishing a workout with no signal.
 *
 * This module used to be a single-purpose offline queue: it recorded the
 * intent to finish a workout locally and replayed it when the network came
 * back. That queue has been superseded by the generalised outbox
 * (`@/lib/outbox`, migrated in the offline-first design, card 284), which
 * migrates any on-disk queue written by this module's old shape into itself
 * on first run.
 *
 * What remains here are the type definitions and helpers that describe that
 * on-disk shape, kept because `outbox.ts` still imports `PendingCompletion`
 * for its migration path, and `dedupe`/`pendingKeyFor` are exercised by this
 * file's own tests documenting that shape.
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
