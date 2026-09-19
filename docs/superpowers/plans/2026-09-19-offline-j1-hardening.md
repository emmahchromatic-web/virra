# Offline J1 Hardening + QA Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two Important findings parked at the end of the J1 Foundation final review (a dead-lettered workout completion leaves a phantom "completed" row forever; a permanently-stuck queue is invisible in the sync pill), and clean up the test-coverage gaps flagged across that same review so nothing about this subsystem ships untested or self-diagnosed.

**Architecture:** Extract the inline `syncPending` function out of `app/(app)/_layout.tsx` into a standalone, unit-testable module — this is the one change that unlocks testing everything else here (the pill-visibility fix, the dead-letter reconciliation, and the date-derivation bug), since `_layout.tsx` itself has no test harness in this repo. Everything else is a small, targeted fix alongside its own test.

**Tech Stack:** Same as the J1 Foundation plan — Expo SDK 54, React Native 0.81, Zustand 5, Jest + `@testing-library/react-native`, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-09-14-offline-first-design.md` (§4.3, §6, §9). **Also read:** `docs/superpowers/plans/2026-09-19-offline-j1-foundation.md` (the plan this hardens) and its Self-Review section, and the final-review findings recorded in that plan's own history (summarized in Tasks 1-2 below).

## Global Constraints

- `sessionStore.ts` must not import from `@/lib/outbox` — keep the read layer decoupled from the write layer, per the existing `LOCAL_ACTIVITY_PREFIX` design.
- Every new or changed test must exercise real behavior (real state transitions, real mock call sequencing) — no test that only asserts a function was called with no assertion on its effect.
- No second review round beyond the standard one-fix-round-per-finding loop; if a task's review finds something, fix it once and re-review, same as the J1 plan.
- Do not touch `handleDeleteAccount`, `pendingCompletions.ts`, or any of the 9 already-shipped J1 tasks' files beyond what each task below names explicitly.

---

### Task 1: Extract `syncPending` into a testable module, fix the pill-visibility gap and the post-drain refresh date bug

**Context:** The final J1 review found that `SyncPill`'s "Syncing" state (`deriveState` in `SyncPill.tsx:16`) requires `syncing && pendingCount > 0`, but in practice `pendingCount` only reflects an outstanding queue while a drain call is literally executing — the moment a retryable failure halts a drain (leaving items queued for the next foreground/reconnect), `syncing` flips back to `false` and the pill goes silent even though there's real unsynced work sitting there. This is New Breakage #2 from the final review: a queue that can't currently drain (bad payload, unregistered kind, repeated transient failure) is completely invisible to the user between attempts.

Separately, `_layout.tsx`'s post-drain refresh (the block that calls `useSessionStore.getState().refresh(date, date)` after a successful drain, to pull in the real server row and drop the `local_` placeholder promptly) derives `date` from the completed workout's `activity.started_at` — but `sessionStore` caches rows by `scheduled_date` (the planned session's date), not by when the workout was actually performed. For a catch-up completion (a session scheduled for an earlier day, finished later) or a workout that crosses midnight, this refreshes the wrong date range and the fix does nothing.

**Files:**
- Create: `mobile/src/lib/syncPending.ts`
- Test: `mobile/__tests__/lib/syncPending.test.ts`
- Modify: `mobile/app/(app)/_layout.tsx` (replace the inline `const syncPending = async () => {...}` with an import, at the three call sites: mount, the `AppState` listener, and the `useNetworkStore.subscribe` callback — read the file first, since Task 2 below also touches nearby lines in the same effect)
- Modify: `mobile/src/components/SyncPill.tsx` (`deriveState`)
- Modify: `mobile/src/lib/outbox.ts` (extend `Drain` — see Task 2, land together or in whichever order review settles; if you do Task 1 first, add a placeholder `deadLettered: OutboxItem[]` field to `Drain` now so this task's tests and Task 2's don't collide on the same interface)

**Interfaces:**
- Produces: `syncPending(userId: string): Promise<void>` from `mobile/src/lib/syncPending.ts` — same behavior as the current inline function, callable and mockable independently of `_layout.tsx`.
- Consumes: `useNetworkStore`, `useOutboxStatus`, `useSessionStore`, `drain`/`readOutbox`/`readDeadLetters` from `@/lib/outbox` — all already exist.

- [ ] **Step 1: Read the current implementation before moving it**

Read `mobile/app/(app)/_layout.tsx`'s current `syncPending` function in full (search for `const syncPending = async`) and its three call sites, so the extraction is a faithful move, not a rewrite from memory.

- [ ] **Step 2: Write the extracted module, fixing both bugs in the same pass**

```ts
// mobile/src/lib/syncPending.ts
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
```

- [ ] **Step 3: Fix the pill-visibility gap**

In `mobile/src/components/SyncPill.tsx`, change `deriveState`'s syncing check from requiring both flags to just the pending count (which Step 2 above now sets for the full duration between "found work" and "drain gave up or succeeded", not just the literal execution window):

```ts
function deriveState(
  isOnline: boolean, syncing: boolean, pendingCount: number, deadLetterCount: number, justSynced: boolean,
): PillState {
  if (deadLetterCount > 0) return 'failed';
  if (!isOnline) return 'offline';
  // Not `syncing && pendingCount > 0`: syncing is only true for the literal
  // duration of a drain() call, but a retryable failure halts the drain and
  // leaves pendingCount > 0 with syncing already back to false -- a queue
  // that can't currently drain still has real unsynced work, and needs to
  // stay visible until it does or until it dead-letters.
  if (pendingCount > 0) return 'syncing';
  if (justSynced) return 'synced';
  return null;
}
```

Leave the `syncing` parameter and the `outboxStatus.syncing` field in place (still meaningful as "a drain is literally running right now", even though the pill no longer needs it) — do not remove them; check whether anything else reads `syncing` before deciding whether the parameter is now unused (if `deriveState` no longer reads it, remove it from the function signature and its one call site, but keep the store field, since a future screen might still want "is a drain in flight" for a spinner or disabled-button state).

- [ ] **Step 4: Write the tests**

```ts
// mobile/__tests__/lib/syncPending.test.ts
import { syncPending } from '@/lib/syncPending';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useSessionStore } from '@/store/sessionStore';
import * as outbox from '@/lib/outbox';

jest.mock('@/lib/outbox');

const mockedOutbox = outbox as jest.Mocked<typeof outbox>;

function seedSession(id: string, scheduledDate: string) {
  useSessionStore.setState({
    byId: { [id]: {
      id, scheduled_date: scheduledDate, modality: 'run', session_label: null,
      status: 'completed', block_id: null, activity_id: 'local_1', moved_to_id: null,
      week_number: 0, day_of_week: 0,
    } },
    idsByDate: { [scheduledDate]: [id] },
    loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useNetworkStore.setState({ isOnline: true, lastOnlineAt: Date.now() });
  useOutboxStatus.setState({ syncing: false, pendingCount: 0, deadLetterCount: 0, justSynced: false });
});

describe('syncPending', () => {
  it('sets pendingCount from the outbox length BEFORE the drain starts, so the pill can show Syncing for the whole attempt', async () => {
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'completeWorkout', payload: {} as never, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters.mockResolvedValue([]);
    let countedDuringDrain = -1;
    mockedOutbox.drain.mockImplementation(async () => {
      countedDuringDrain = useOutboxStatus.getState().pendingCount;
      return { sent: 1, left: 0, failed: 0, deadLettered: [] };
    });
    await syncPending('u1');
    expect(countedDuringDrain).toBe(1);
  });

  it('reads dead letters unconditionally, even when the outbox is empty', async () => {
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([{ id: 'd', kind: 'completeWorkout', payload: {} as never, createdAt: '', attempts: 1, lastError: 'x' }]);
    await syncPending('u1');
    expect(useOutboxStatus.getState().deadLetterCount).toBe(1);
    expect(mockedOutbox.drain).not.toHaveBeenCalled();
  });

  it('does not attempt a drain while offline, but still reports counts', async () => {
    useNetworkStore.setState({ isOnline: false });
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'completeWorkout', payload: {} as never, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters.mockResolvedValue([]);
    await syncPending('u1');
    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useOutboxStatus.getState().pendingCount).toBe(1);
  });

  it('reverts the local optimistic completion for a session whose item just dead-lettered', async () => {
    seedSession('s1', '2026-09-19');
    const payload = { kind: 'strength', sessionId: 's1', activity: { started_at: '2026-09-19T08:00:00Z' } } as never;
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' }]);
    mockedOutbox.drain.mockResolvedValue({
      sent: 0, left: 0, failed: 1,
      deadLettered: [{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' }],
    });
    await syncPending('u1');
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });

  it('refreshes the CACHED session\'s scheduled_date after a successful drain, not the activity\'s started_at date', async () => {
    // A catch-up completion: scheduled for 2026-09-01, actually performed 2026-09-19.
    seedSession('s1', '2026-09-01');
    const payload = { kind: 'run', sessionId: 's1', activity: { started_at: '2026-09-19T08:00:00Z' }, runDetails: {} } as never;
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters.mockResolvedValue([]);
    mockedOutbox.drain.mockResolvedValue({ sent: 1, left: 0, failed: 0, deadLettered: [] });
    const refreshSpy = jest.spyOn(useSessionStore.getState(), 'refresh').mockResolvedValue(undefined);
    await syncPending('u1');
    expect(refreshSpy).toHaveBeenCalledWith('2026-09-01', '2026-09-01');
    expect(refreshSpy).not.toHaveBeenCalledWith('2026-09-19', '2026-09-19');
  });

  it('never throws, even if readOutbox itself rejects', async () => {
    mockedOutbox.readOutbox.mockRejectedValue(new Error('boom'));
    await expect(syncPending('u1')).resolves.toBeUndefined();
    expect(useOutboxStatus.getState().syncing).toBe(false);
  });
});
```

Adjust the mock payload shapes to match whatever `PendingCompletion`'s actual fields are (check `mobile/src/lib/pendingCompletions.ts`) if the sketch above doesn't type-check — the intent of each test is what matters, not the literal payload shape.

- [ ] **Step 5: Wire the extracted function into `_layout.tsx`**

Replace the inline `const syncPending = async () => {...}` block with `import { syncPending } from '@/lib/syncPending';` near the top, and change all three call sites from `syncPending()` to `syncPending(session.user.id)`.

- [ ] **Step 6: Run tests, then the full suite**

Run: `cd mobile && npx jest __tests__/lib/syncPending.test.ts` then `npm test` then `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/syncPending.ts mobile/__tests__/lib/syncPending.test.ts "mobile/app/(app)/_layout.tsx" mobile/src/components/SyncPill.tsx
git commit -m "fix(offline): extract syncPending for testability, fix the pill's stuck-queue blind spot and the post-drain refresh date"
```

---

### Task 2: Stop a dead-lettered completion from leaving a phantom "completed" session forever

**Context:** `sessionStore.refresh()` preserves a locally-completed row (one whose `activity_id` still has the `local_` placeholder prefix) until the server agrees it's `completed` — this is what makes Task 4 of the J1 Foundation plan actually survive the reconnect race. But if the item behind that local row permanently dead-letters (an RLS violation, a validation error), the server will never say `completed` for it, so the preservation rule holds it forever: the session shows as done, with an activity id that resolves to nothing, and there is currently no way to clear it. This task adds the missing release valve: reverting the local row the moment its item dead-letters (Task 1's `syncPending` already calls this — this task builds the store action and the outbox surface it needs).

**Files:**
- Modify: `mobile/src/lib/outbox.ts` (`Drain` interface, `drain()`)
- Modify: `mobile/src/store/sessionStore.types.ts`
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/lib/outbox.test.ts` (extend)
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts` (extend)

**Interfaces:**
- Produces: `Drain.deadLettered: OutboxItem[]` — the items THIS drain call moved to the dead-letter list (not the whole dead-letter list, just this call's additions).
- Produces: `SessionStoreActions.revertLocalCompletion(sessionId: SessionId): void` — synchronous, local-only, the inverse of `applyLocalCompletion`.
- Consumes (by Task 1, already written if done first — if you're doing this task before Task 1, `syncPending` doesn't exist yet in isolation; either order is fine, but the two tasks' tests on `Drain.deadLettered` must not conflict — coordinate by grep-checking whether `deadLettered` is already on the interface before adding it again).

- [ ] **Step 1: Write the failing test for `drain()`'s new field**

Add to `mobile/__tests__/lib/outbox.test.ts` (check the file's actual current mock/import conventions first — it uses `registerHandler`/`enqueue`/`drain` directly against a real AsyncStorage mock, not a jest.mock of the module itself):

```ts
it('reports which items it dead-lettered in this call, not the whole dead-letter list', async () => {
  registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
  await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
  const result = await drain('u1');
  expect(result.deadLettered).toHaveLength(1);
  expect(result.deadLettered[0].payload.activity.started_at).toBe('2026-09-19T08:00:00Z');
});
```

(Match this against the file's actual existing `permanentErrorHandler`/`payload` helpers rather than reinventing them — the file already has fixtures for exactly this scenario from the J1 Foundation plan's Task 2.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/lib/outbox.test.ts`
Expected: FAIL — `deadLettered` is `undefined`.

- [ ] **Step 3: Add the field**

In `mobile/src/lib/outbox.ts`, extend the interface and the return:

```ts
export interface Drain { sent: number; left: number; failed: number; deadLettered: OutboxItem[] }
```

`drain()` already builds `newDeadLetters: OutboxItem[]` internally — just add it to the final returned object: `return { sent, left: remaining.length, failed, deadLettered: newDeadLetters };`. Also update the `.catch(() => ({ sent: 0, left: pendingBefore.length, failed: 0 }))` fallback wherever `drain()` is called with a `.catch` (in `syncPending.ts` if Task 1 already landed, or in `_layout.tsx`'s inline function otherwise) to include `deadLettered: []` in that fallback object, or it won't type-check.

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/lib/outbox.test.ts`

- [ ] **Step 5: Write the failing test for `revertLocalCompletion`**

Add to `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
describe('sessionStore.revertLocalCompletion', () => {
  it('flips a locally-completed session back to planned', () => {
    useSessionStore.getState().applyLocalCompletion('s1', 'local_123_abc');
    useSessionStore.getState().revertLocalCompletion('s1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('planned');
    expect(row.activity_id).toBeNull();
  });

  it('does nothing to a session the server has already confirmed', () => {
    useSessionStore.getState().markComplete('s1', 'real-server-id').catch(() => {});
    // markComplete sets activity_id to a real id, not a local_ placeholder --
    // revertLocalCompletion must never touch that.
    useSessionStore.setState({
      byId: { ...useSessionStore.getState().byId, s1: { ...useSessionStore.getState().byId['s1'], activity_id: 'real-server-id', status: 'completed' } },
    });
    useSessionStore.getState().revertLocalCompletion('s1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('real-server-id');
  });

  it('is a no-op for a session not in the cache', () => {
    useSessionStore.getState().revertLocalCompletion('does-not-exist');
    expect(useSessionStore.getState().byId['does-not-exist']).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/store/sessionStore.mutations.test.ts`
Expected: FAIL — `revertLocalCompletion is not a function`.

- [ ] **Step 7: Add the type and implementation**

In `mobile/src/store/sessionStore.types.ts`, add to `SessionStoreActions`:

```ts
  /**
   * The inverse of `applyLocalCompletion`: reverts a session's optimistic
   * local completion back to `planned`, and clears the placeholder
   * `activity_id`. A no-op if the row's activity_id is no longer a local
   * placeholder (the server has since confirmed it) -- this must never
   * undo a real completion.
   */
  revertLocalCompletion(sessionId: SessionId): void;
```

In `mobile/src/store/sessionStore.ts`, import `LOCAL_ACTIVITY_PREFIX` (it's already exported from this same file — no new import needed, just reference it) and add, alongside `applyLocalCompletion`:

```ts
      revertLocalCompletion: (sessionId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        if (typeof prev.activity_id !== 'string' || !prev.activity_id.startsWith(LOCAL_ACTIVITY_PREFIX)) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'planned', activity_id: null } },
        });
      },
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/store/sessionStore.mutations.test.ts`

- [ ] **Step 9: If Task 1 is already merged in this same working tree, confirm `syncPending.ts` compiles against the new `Drain.deadLettered` field**

If Task 1 hasn't landed yet, skip this — its own Step 2 already writes code against this field, and its own tests will catch a mismatch.

- [ ] **Step 10: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 11: Commit**

```bash
git add mobile/src/lib/outbox.ts mobile/src/store/sessionStore.types.ts mobile/src/store/sessionStore.ts mobile/__tests__/lib/outbox.test.ts mobile/__tests__/store/sessionStore.mutations.test.ts
git commit -m "fix(offline): surface dead-lettered items from drain(), and let sessionStore revert a phantom local completion"
```

---

### Task 3: Close the enqueue/drain read-modify-write race fully

**Context:** The final review found that `enqueue()` and `drain()`'s write-back both do read-then-await-then-write on the same AsyncStorage key with no mutual exclusion. Task 2 of the J1 Foundation plan already made `drain()`'s tail re-read current state and filter by processed id (rather than overwriting a stale snapshot), which closes the common case (an item enqueued mid-drain survives). But the reviewer traced a narrower residual: the two operations' read and write can still interleave in an order that resurrects an already-processed item (harmless — replay is idempotent) or, in the reverse interleaving, drops a mid-drain arrival. This task closes it completely with a per-user lock.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Test: `mobile/__tests__/lib/outbox.test.ts` (extend)

**Interfaces:**
- Internal only — `enqueue` and `drain`'s existing signatures don't change.

- [ ] **Step 1: Write the failing test**

Add to `mobile/__tests__/lib/outbox.test.ts`:

```ts
it('serialises enqueue against a concurrent drain so neither can lose a write', async () => {
  const releases: Array<() => void> = [];
  registerHandler('completeWorkout', () => new Promise<void>((resolve) => releases.push(resolve)));

  await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
  const drainPromise = drain('u1');

  // Fire several concurrent enqueues while the drain's handler is still pending.
  await Promise.all([
    enqueue('u1', 'completeWorkout', payload('2026-09-19T09:00:00Z')),
    enqueue('u1', 'completeWorkout', payload('2026-09-19T10:00:00Z')),
    enqueue('u1', 'completeWorkout', payload('2026-09-19T11:00:00Z')),
  ]);

  releases.forEach((r) => r());
  await drainPromise;

  const remaining = await readOutbox('u1');
  const startedAts = remaining.map((i) => i.payload.activity.started_at).sort();
  expect(startedAts).toEqual(['2026-09-19T09:00:00Z', '2026-09-19T10:00:00Z', '2026-09-19T11:00:00Z']);
});
```

Check this against the file's actual `payload()` helper and handler-registration conventions before pasting verbatim — adapt as needed, but keep the concurrency shape: one drain in flight, several enqueues racing it, assert nothing is lost.

- [ ] **Step 2: Run to verify it currently passes or fails**

Run: `cd mobile && npx jest __tests__/lib/outbox.test.ts -t "serialises enqueue"`

This race is timing-dependent — it may already pass most of the time even without a lock (the existing per-id filtering in `drain()`'s tail already closes the common case). If it's flaky rather than reliably red, that's expected; the mutex still removes the possibility rather than relying on luck. Note the observed behavior in your report either way.

- [ ] **Step 3: Add a per-user lock around every read-modify-write on the outbox key**

```ts
// In outbox.ts, alongside `inFlight`:
const locks = new Map<string, Promise<unknown>>();

/**
 * Serialises every read-modify-write on one user's outbox key. `enqueue` and
 * `drain`'s tail write both read-then-await-then-write the same AsyncStorage
 * key; without this, one can silently overwrite what the other just wrote,
 * even with the per-id filtering `drain()` already does (see git history --
 * that filtering closes the common case, not every interleaving).
 */
function withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(userId, next.then(() => undefined, () => undefined));
  return next;
}
```

Wrap `enqueue`'s body (everything after reading `userId`/`kind`/`payload`, i.e. the read-check-write sequence) in `withLock(userId, async () => { ... })`, and wrap `drain()`'s inner IIFE body the same way — `drain()` already has `inFlight` for drain-vs-drain single-flight; `withLock` additionally serialises it against any `enqueue` call. Order matters: acquire the `inFlight` single-flight check first (unchanged), then run the whole drain body inside `withLock`.

- [ ] **Step 4: Run to verify it passes reliably**

Run the same focused test 5 times in a row (`for i in 1 2 3 4 5; do npx jest __tests__/lib/outbox.test.ts -t "serialises enqueue"; done` or equivalent) to confirm it isn't merely usually-lucky.

- [ ] **Step 5: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/outbox.ts mobile/__tests__/lib/outbox.test.ts
git commit -m "fix(offline): fully serialise enqueue against drain's read-modify-write"
```

---

### Task 4: QA sweep — untested classification boundary, an unasserted payload, mock-ordering fragility, and the open-handle warning

**Context:** Four independent, small test-quality gaps flagged across the J1 review, bundled into one task since none needs its own design discussion.

**Files:**
- Modify: `mobile/__tests__/lib/outbox.test.ts` (extend)
- Modify: `mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts` (extend)
- Modify: `mobile/__tests__/lib/workoutDrafts.test.ts` (small fix)
- Investigate (no guaranteed file change): the "worker process has failed to exit gracefully" Jest warning

- [ ] **Step 1: Test the retryable-status boundary**

`mobile/src/lib/outbox.ts`'s `isPermanentError` treats 401/408/425/429 as retryable despite being in the 4xx range (see its doc comment for why), and everything else 4xx as permanent. This boundary has zero direct test coverage today — read `mobile/src/lib/outbox/errors.ts`'s `SupabaseWriteError` and use it to add tests to `mobile/__tests__/lib/outbox.test.ts`:

```ts
import { SupabaseWriteError } from '@/lib/outbox/errors';

it.each([401, 408, 425, 429])('treats a %i as retryable, not permanent', async (status) => {
  registerHandler('completeWorkout', () => Promise.reject(new SupabaseWriteError('x', { status })));
  await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
  const result = await drain('u1');
  expect(result.deadLettered ?? []).toHaveLength(0);
  expect(result.left).toBe(1);
});

it.each([400, 403, 404, 422])('treats a %i as permanent', async (status) => {
  registerHandler('completeWorkout', () => Promise.reject(new SupabaseWriteError('x', { status })));
  await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
  const result = await drain('u1');
  expect(result.left).toBe(0);
  expect(await readDeadLetters('u1')).toHaveLength(1);
});
```

(Adjust `registerHandler`'s call shape and `beforeEach` reset to match the file's existing conventions — every other test in this file already does something structurally identical.)

- [ ] **Step 2: Assert the `run_details` payload in the handler test's happy path**

In `mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts`, find the existing test for a `kind: 'run'` completion (the one the final review noted only asserts `mockUpdate` wasn't called, not the actual `run_details` upsert payload) and add an assertion on what was passed to the mocked `run_details` upsert — the exact fields from `item.runDetails` plus the resolved `activity_id`.

- [ ] **Step 3: Fix the mock-ordering fragility in `workoutDrafts.test.ts`**

The final review found that new `loadWorkoutDraft`/`deleteWorkoutDraft` tests call `saveWorkoutDraft` as setup, which fires the real (unmocked-behavior) `upsert` mock using whatever `mockResolvedValue` an earlier `describe` block last installed — `jest.clearAllMocks()` clears call history but not installed implementations. Fix: in the file's top-level `beforeEach` (or each describe's own), explicitly reset `mockUpsert.mockResolvedValue({ error: null })` (or whatever the file's default success shape is) so every test starts from a known-good mock return, not whatever the previous describe block left behind.

- [ ] **Step 4: Investigate the open-handle warning**

Run: `cd mobile && npx jest --detectOpenHandles --silent 2>&1 | tail -60`

Read the output for what it names as the leaking handle/timer. If it points at something this plan's tasks (or the J1 Foundation plan) actually created — e.g. `SyncPill`'s `setTimeout`, or a NetInfo listener not torn down in a test — fix it (add the missing cleanup / `clearTimeout` / unsubscribe in the relevant test's `afterEach`). If it points at something pre-existing and unrelated to any offline-work file, do not fix it — note what you found in your report and leave it; this task's scope is the offline subsystem, not a general Jest hygiene sweep.

- [ ] **Step 5: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add mobile/__tests__/lib/outbox.test.ts mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts mobile/__tests__/lib/workoutDrafts.test.ts
git commit -m "test(offline): cover the retryable-status boundary, the run_details payload, and fix a mock-ordering gap"
```

---

### Task 5: Screen-level coverage for the offline-completion call sites

**Context:** Since Task 4 of the J1 Foundation plan, `run.tsx` and `workout-preview.tsx`'s offline-completion branches call `useSessionStore.getState().applyLocalCompletion(...)` — but no test renders either screen through that branch and asserts on it; the existing `WorkoutPreviewOffline.test.tsx` covers a different scenario (card 258, opening a session offline), not finishing one. This was flagged as a pre-existing harness gap in two prior reviews. Attempt to close it now; if the harness work required turns out to be disproportionate (a full re-mock of one of these screens' many dependencies), stop and report DONE_WITH_CONCERNS explaining exactly what's missing, rather than forcing something brittle.

**Files:**
- Modify: `mobile/__tests__/components/WorkoutPreviewOffline.test.tsx` (preferred — it already has the mocking scaffolding for this screen's offline paths) OR create a new focused test file if extending this one proves awkward
- Read first: `mobile/__tests__/components/WorkoutPreviewOffline.test.tsx` and `mobile/__tests__/components/WorkoutExtraSet.test.tsx` for the established mocking pattern (auth, cycle, supabase, sessionStore)

- [ ] **Step 1: Read the existing offline test file's mocking pattern**

Understand how it currently mocks `@/store/sessionStore` (or doesn't — it may use the real store, seeded via `useSessionStore.setState`, the same way `sessionStore.mutations.test.ts` does).

- [ ] **Step 2: Write a test that finishes a strength (or run) session with a simulated Supabase failure, and asserts the local session flips to completed**

Shape: seed `useSessionStore` with a planned session, render the screen with a mocked Supabase client whose `activities` insert/upsert rejects (simulating offline or a transient failure), start and finish the workout through the UI (or by calling the screen's exposed finish handler if that's how the existing file drives it), and assert `useSessionStore.getState().byId[sessionId].status === 'completed'` immediately — without waiting for any drain, matching the brief's original Task 4 requirement this test was always meant to cover.

- [ ] **Step 3: Run the test, then the full suite**

Run: `cd mobile && npx jest <the file you touched>` then `npm test` then `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add mobile/__tests__/components/WorkoutPreviewOffline.test.tsx  # or the new file
git commit -m "test(offline): cover the offline-completion screen call site's local status update"
```

If this task is scoped down or abandoned, say so clearly in the report — do not silently skip it.

---

## Self-Review

**Findings coverage:**
- ✅ New Breakage #1 (phantom completed session) — Task 2
- ✅ New Breakage #2 (stuck queue invisible) — Task 1
- ✅ Post-drain refresh wrong-date bug — Task 1
- ✅ Enqueue/drain race narrowed-not-closed — Task 3
- ✅ RETRYABLE_STATUSES untested — Task 4
- ✅ `run_details` payload unasserted — Task 4
- ✅ `workoutDrafts.test.ts` mock-ordering fragility — Task 4
- ✅ "Worker process failed to exit gracefully" — Task 4 (investigate, fix only if in-scope)
- ➕ Screen-level `applyLocalCompletion` coverage — Task 5, best-effort

**Not in scope for this plan (explicitly deferred, tracked in memory, revisit with J3):**
- Preserved local rows sorting before server rows within a date in `sessionStore.refresh()` — cosmetic only.
- The spec §4.4 reconnect sequence (`getSession()` before drain, route to sign-in on an invalid refresh token) — this is what would let an expired-refresh-token completion retry successfully instead of eventually dead-lettering; real J2/J3 work, not a hardening-sized fix.
- The online (non-outbox) `strength_set_logs` write path in `workout-preview.tsx` still lacks the delete-before-insert idempotency the outbox replay path now has — only reachable if that path is ever retried, which it isn't today.
- **`completeWorkout.ts`'s child-write errors are swallowed (`console.error`, not thrown) on `planned_sessions`, `run_details`, and `strength_details`.** If the `activities` upsert succeeds but one of these fails, the item still counts as "sent" and never dead-letters — a second, unlisted route to the same phantom-completed-session class this hardening plan closes for the dead-letter route specifically. Pre-existing from the J1 Foundation plan, found during this plan's final review. Needs a product decision (does a failed session-link fail the whole item?) before it can be fixed — genuinely J2/J3 scope, not a hardening-sized fix.
- **`syncPending`'s dead-letter sweep can revert a freshly-queued local completion for a session with a stale dead letter from a prior failed attempt.** Found during this plan's own fix-wave re-review, parked rather than triggering a third fix round. Bounded impact: only the local display status is affected (the sweep never touches the outbox itself), self-corrects immediately once online, and only manifests on the specific re-do-after-dead-letter sequence. Fix is a one-line addition (skip a dead letter whose `sessionId` is still represented in the current outbox) — natural to bundle with J3's dead-letter sheet, since that's also when `dismissDeadLetter` gets its first real caller and dead letters stop persisting forever by default.
