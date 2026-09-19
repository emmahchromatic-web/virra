import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useSessionStore } from '@/store/sessionStore';
import { drain, readOutbox, readDeadLetters, type OutboxItem } from '@/lib/outbox';

function isCompleteWorkout(item: OutboxItem): item is OutboxItem<'completeWorkout'> {
  return item.kind === 'completeWorkout';
}

/**
 * Card 253 -> the J1 outbox. Safe to call every time: a network error halts
 * the drain and leaves the queue exactly where it was; a permanent one
 * dead-letters just that item and the rest still go through.
 *
 * Extracted out of `app/(app)/_layout.tsx` (which has no test harness in this
 * repo) so its ordering and edge cases are directly testable.
 */
export async function syncPending(userId: string): Promise<void> {
  try {
    // Dead letters first, and unconditionally: they outlive the outbox they
    // came from. If everything queued on the last run ended up dead-lettered,
    // the outbox is empty at this launch, and reading them only after a
    // "nothing to send" return meant the Unsaved pill could never appear for
    // the one case it exists to cover.
    const pendingBefore = await readOutbox(userId);
    const deadBefore    = await readDeadLetters(userId);
    useOutboxStatus.getState().setCounts(pendingBefore.length, deadBefore.length);

    if (!useNetworkStore.getState().isOnline) return;
    if (pendingBefore.length === 0) return;

    // The count is set BEFORE the drain starts, not after: the pill's
    // pending-work signal has to hold for the whole drain, not just the
    // instant it succeeds.
    useOutboxStatus.getState().setSyncing(true);
    const result = await drain(userId).catch(() => ({
      sent: 0, left: pendingBefore.length, failed: 0, deadLettered: [] as OutboxItem[],
    }));
    const deadLetters = await readDeadLetters(userId);
    useOutboxStatus.getState().setCounts(result.left, deadLetters.length);
    useOutboxStatus.getState().setSyncing(false);
    if (result.left === 0 && result.sent > 0) useOutboxStatus.getState().setJustSynced(true);

    // Revert the optimistic local completion for anything that just proved it
    // can never succeed. The pre-hardening behaviour (a plain refresh) used to
    // self-correct this the next time the screen focused; a dead-lettered
    // item's server row never reports `completed`, so nothing else clears it.
    // See sessionStore.revertLocalCompletion.
    for (const item of result.deadLettered) {
      if (!isCompleteWorkout(item)) continue;
      const sessionId = item.payload.sessionId;
      if (sessionId) useSessionStore.getState().revertLocalCompletion(sessionId);
    }

    // The server now owns these sessions. Pull the real row in now rather than
    // leaving the `local_` placeholder sitting there until the next screen
    // focus happens to go stale. Keyed by the CACHED SESSION's scheduled_date,
    // not the workout's started_at -- those differ for a catch-up completion
    // or a workout that crosses midnight, and sessionStore is keyed by the
    // former.
    if (result.sent > 0) {
      const dates = new Set<string>();
      for (const item of pendingBefore) {
        if (!isCompleteWorkout(item)) continue;
        const sessionId = item.payload.sessionId;
        if (!sessionId) continue;
        const cached = useSessionStore.getState().byId[sessionId];
        if (cached) dates.add(cached.scheduled_date);
      }
      for (const date of dates) {
        useSessionStore.getState().refresh(date, date).catch(() => { /* next focus retries */ });
      }
    }
  } catch {
    // Try again next foreground/reconnect; don't leave the pill stuck mid-sync.
    useOutboxStatus.getState().setSyncing(false);
  }
}
