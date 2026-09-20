import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useSessionStore } from '@/store/sessionStore';
import { useRecipesStore } from '@/store/recipes';
import {
  drain, readOutbox, readDeadLetters, markDeadLettersReconciled, type OutboxItem,
} from '@/lib/outbox';

function isCompleteWorkout(item: OutboxItem): item is OutboxItem<'completeWorkout'> {
  return item.kind === 'completeWorkout';
}

function isToggleFavourite(item: OutboxItem): item is OutboxItem<'toggleFavourite'> {
  return item.kind === 'toggleFavourite';
}

/**
 * Reverts the optimistic local state behind every dead-lettered item in
 * `items`, for every kind this module knows how to undo:
 *
 * - `completeWorkout`: a dead-lettered item's server row will never report
 *   `completed`, so `refresh()`'s "preserve a locally-completed row" rule
 *   would otherwise hold the phantom forever. See
 *   sessionStore.revertLocalCompletion.
 * - `toggleFavourite`: a dead-lettered item's server row will never reflect
 *   `desiredState`, so the optimistic heart would otherwise stay flipped
 *   forever with nothing to correct it. See recipes.revertLocalToggle.
 *
 * SAFE TO RE-RUN OVER THE WHOLE ON-DISK LIST ON EVERY LAUNCH, for two
 * different reasons:
 *
 * - `completeWorkout`, structurally: `revertLocalCompletion` only touches rows
 *   whose `activity_id` is still a one-way `local_` placeholder, which
 *   disappears for good the moment the server confirms. A server-confirmed
 *   completion is therefore untouchable by definition.
 * - `toggleFavourite`, by bookkeeping: its "still matches `desiredState`" guard
 *   is NOT enough on its own, because a favourite is a plain boolean that can
 *   legitimately come back round to the same value later. A stale dead letter
 *   (say "favourite r1") whose guard matched again after the user genuinely
 *   re-favourited r1 would un-favourite it once more, on every launch, until
 *   the dead-letter sheet's Dismiss was found. So an item is stamped
 *   `reconciledAt` once its revert has actually fired, and skipped from then on.
 *
 * Only items whose revert genuinely DID something are stamped. A revert that
 * no-ops because the store has not rehydrated yet must stay unmarked, so the
 * next launch still gets its chance -- which is the whole point of the sweep.
 */
async function revertDeadLetteredItems(userId: string, items: OutboxItem[]): Promise<void> {
  const reverted: string[] = [];
  for (const item of items) {
    if (item.reconciledAt) continue;
    if (isCompleteWorkout(item)) {
      const sessionId = item.payload.sessionId;
      if (sessionId && useSessionStore.getState().revertLocalCompletion(sessionId)) reverted.push(item.id);
    } else if (isToggleFavourite(item)) {
      const { recipeId, desiredState } = item.payload;
      if (recipeId && useRecipesStore.getState().revertLocalToggle(recipeId, desiredState)) reverted.push(item.id);
    }
  }
  if (reverted.length === 0) return;
  // Best-effort: the revert itself has already happened in memory, and failing
  // to persist the marker only costs one more (harmless, guarded) attempt on a
  // later launch. It must never abort the sync that is mid-flight around it.
  await markDeadLettersReconciled(userId, reverted).catch(() => { /* retried next launch */ });
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

    // Reconcile the FULL on-disk dead-letter list, on every single invocation —
    // including the ones that return early below (offline, or nothing queued).
    //
    // WHY NOT JUST `result.deadLettered`. `drain()` persists a dead letter
    // inside its locked tail write and only THEN returns it. If the process
    // dies in that window (an iOS background kill, an OOM, a crash in the
    // intervening await), the dead letter is on disk, the local `local_`-
    // prefixed session row is persisted too, and nothing on any later launch
    // would ever put the two together again -- the phantom "completed" session
    // this module exists to clear, reached by a second route. This loop is the
    // actual guarantee; the `result.deadLettered` loop further down is now a
    // promptness optimisation (react on the same call that dead-letters).
    await revertDeadLetteredItems(userId, deadBefore);

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
    // can never succeed, without waiting for the next launch's `deadBefore`
    // sweep above to notice. Promptness, not correctness: the sweep is what
    // guarantees this eventually happens even if this process never gets here.
    await revertDeadLetteredItems(userId, result.deadLettered);

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
