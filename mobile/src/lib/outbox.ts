import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingCompletion } from '@/lib/pendingCompletions';
import { describeError } from '@/lib/outbox/errors';

/**
 * Generalises the card-253 `pendingCompletions` queue (one kind: finishing a
 * workout) into a typed, multi-kind outbox. J2/J3 add kinds by extending
 * `MutationPayloadMap` and registering a handler; nothing here changes.
 *
 * WHY A HANDLER REGISTRY. Screens enqueue by kind + payload; they never call
 * Supabase directly for an in-scope mutation. The handler is the only place
 * the actual writes live, so a screen and its offline path cannot drift.
 */

const OUTBOX_PREFIX        = 'virra:outbox:v1:';
const DEAD_LETTER_PREFIX   = 'virra:outbox_failed:v1:';
const LEGACY_QUEUE_PREFIX  = 'virra:pending_completions:v1:';

export type MutationKind = 'completeWorkout';

export interface MutationPayloadMap {
  completeWorkout: PendingCompletion;
}

export interface OutboxItem<K extends MutationKind = MutationKind> {
  id:         string;
  kind:       K;
  payload:    MutationPayloadMap[K];
  createdAt:  string;
  attempts:   number;
  lastError?: string;
}

export interface Drain { sent: number; left: number; failed: number; deadLettered: OutboxItem[] }

export type Handler<K extends MutationKind> = (payload: MutationPayloadMap[K]) => Promise<void>;

const handlers: Partial<{ [K in MutationKind]: Handler<K> }> = {};

export function registerHandler<K extends MutationKind>(kind: K, handler: Handler<K>): void {
  // TS cannot narrow a generic-keyed write into a mapped type (the call site
  // above is still fully type-checked); the assertion only relaxes the
  // assignment itself.
  (handlers as Record<MutationKind, Handler<MutationKind>>)[kind] = handler as Handler<MutationKind>;
}

const outboxKey     = (userId: string) => `${OUTBOX_PREFIX}${userId}`;
const deadLetterKey = (userId: string) => `${DEAD_LETTER_PREFIX}${userId}`;
const legacyKey     = (userId: string) => `${LEGACY_QUEUE_PREFIX}${userId}`;

async function readList(key: string): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt queue must never block someone finishing a workout.
    return [];
  }
}

async function writeList(key: string, items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

let counter = 0;
function makeOutboxId(): string {
  counter += 1;
  return `ob_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** One-time migration from the card-253 queue; the legacy key is then deleted. */
async function migrateLegacyQueue(userId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(legacyKey(userId));
  if (!raw) return;
  let legacy: PendingCompletion[] = [];
  try {
    const parsed = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? parsed : [];
  } catch {
    legacy = [];
  }
  if (legacy.length > 0) {
    const existing = await readList(outboxKey(userId));
    const migrated: OutboxItem<'completeWorkout'>[] = legacy.map((payload) => ({
      id: makeOutboxId(), kind: 'completeWorkout', payload, createdAt: payload.queuedAt, attempts: 0,
    }));
    await writeList(outboxKey(userId), [...existing, ...migrated]);
  }
  await AsyncStorage.removeItem(legacyKey(userId));
}

export async function readOutbox(userId: string): Promise<OutboxItem[]> {
  await migrateLegacyQueue(userId);
  return readList(outboxKey(userId));
}

export async function readDeadLetters(userId: string): Promise<OutboxItem[]> {
  return readList(deadLetterKey(userId));
}

export async function dismissDeadLetter(userId: string, id: string): Promise<void> {
  // Locked: this is a read-modify-write on the dead-letter key, which
  // `drain()`'s tail also writes from inside `withLock`. Unserialised, a
  // dismiss racing a drain that is appending a new dead letter can lose that
  // new letter or resurrect the dismissed one. Nothing calls this yet (the
  // dead-letter sheet is J3), but keeping "every RMW on these two keys goes
  // through withLock" true is what makes that invariant enforceable later.
  await withLock(userId, async () => {
    const items = await readList(deadLetterKey(userId));
    await writeList(deadLetterKey(userId), items.filter((i) => i.id !== id));
  });
}

/**
 * Per-kind identity: two payloads with the same key are the same logical
 * mutation, however many times a screen asked for it.
 *
 * WHY. The card-253 queue deduped finished workouts on `(kind, started_at)`
 * precisely because a double-tap on Finish — or a retry after what looked like
 * a hang — queued the same workout twice. Making one item's replay idempotent
 * (see the completeWorkout handler) does not help there: two *separate* items
 * each write their own set rows. The guard has to live here, on the one path
 * every caller goes through.
 *
 * A kind with no entry here simply never dedupes, which is the right default
 * for J2/J3 kinds where every call is a distinct intent.
 */
const dedupeKeys: { [K in MutationKind]?: (payload: MutationPayloadMap[K]) => string | null } = {
  completeWorkout: (p) => {
    const startedAt = p.activity?.started_at;
    return startedAt ? `${p.kind}:${String(startedAt)}` : null;
  },
};

function dedupeKeyFor(kind: MutationKind, payload: unknown): string | null {
  const fn = dedupeKeys[kind] as ((p: unknown) => string | null) | undefined;
  if (!fn) return null;
  try {
    return fn(payload);
  } catch {
    // A malformed payload must never stop someone finishing a workout; it just
    // does not dedupe.
    return null;
  }
}

export async function enqueue<K extends MutationKind>(
  userId: string, kind: K, payload: MutationPayloadMap[K],
): Promise<OutboxItem<K>> {
  return withLock(userId, async () => {
    const items = await readOutbox(userId);

    const key = dedupeKeyFor(kind, payload);
    if (key) {
      const existing = items.find((i) => i.kind === kind && dedupeKeyFor(i.kind, i.payload) === key);
      if (existing) {
        // Replace in place: same queue position, same attempt count, but the
        // newest payload wins (a second Finish tap can carry a corrected set).
        //
        // The id changes only when a drain is running, because that drain may
        // already have sent the item it is replacing and will remove that id when
        // it finishes -- taking this newer payload with it. A fresh id survives
        // that, and replaying it is free: every write in the handler is
        // idempotent on (user_id, started_at).
        const id = inFlight.has(userId) ? makeOutboxId() : existing.id;
        const replaced = { ...existing, id, payload } as OutboxItem<K>;
        await writeList(outboxKey(userId), items.map((i) => (i.id === existing.id ? replaced : i)) as OutboxItem[]);
        return replaced;
      }
    }

    const item: OutboxItem<K> = { id: makeOutboxId(), kind, payload, createdAt: new Date().toISOString(), attempts: 0 };
    await writeList(outboxKey(userId), [...items, item] as OutboxItem[]);
    return item;
  });
}

/**
 * Retryable unless we are *confident* the write can never succeed.
 *
 * WHY THE DEFAULT IS RETRY. This used to be the other way round: only
 * /network|fetch|timeout|abort/ was retried and everything else was
 * dead-lettered on the first attempt. That discarded a finished workout on an
 * ordinary Postgres 5xx, and on an expired refresh token ("Invalid Refresh
 * Token: Refresh Token Not Found"), both of which succeed on the next try. The
 * plan's global constraint is explicit: an hour's workout is never discarded by
 * a counter, and it should not be discarded by an unrecognised error message
 * either. Retrying forever is recoverable; dead-lettering silently is not.
 *
 * 401 and 429 are deliberately NOT permanent despite being 4xx: 401 is what an
 * expired access token looks like and the next drain runs after
 * `getSession()` has refreshed it, and 429 is a rate limit that clears itself.
 * The spec's "401 after a successful token refresh is permanent" needs the
 * re-auth flow that J1 does not have yet.
 */
const RETRYABLE_STATUSES = new Set([401, 408, 425, 429]);

/** SQLSTATE classes that can never succeed on replay: data exception (22),
 *  integrity constraint violation (23), syntax error / access rule violation
 *  (42, which includes 42501 insufficient_privilege). */
const PERMANENT_CODE = /^(22|23|42)/;

const PERMANENT_MESSAGE =
  /row-level security|permission denied|insufficient[_ ]privilege|violates (unique|foreign key|check|not-null|exclusion) constraint|duplicate key value/i;

function isPermanentError(e: unknown): boolean {
  const { message, status, code } = describeError(e);
  if (typeof status === 'number' && status >= 400 && status < 500 && !RETRYABLE_STATUSES.has(status)) return true;
  if (code && PERMANENT_CODE.test(code)) return true;
  if (PERMANENT_MESSAGE.test(message)) return true;
  return false;
}

const locks = new Map<string, Promise<unknown>>();

/**
 * Serialises every read-modify-write on one user's outbox key. `enqueue` and
 * `drain`'s tail write both read-then-await-then-write the same AsyncStorage
 * key; without this, one can silently overwrite what the other just wrote,
 * even with the per-id filtering `drain()` already does (see git history --
 * that filtering closes the common case, not every interleaving).
 *
 * Deliberately does NOT wrap `drain()`'s per-item handler loop -- only its
 * tail read-modify-write. Handler calls are the network round trip and can
 * run for seconds; holding this lock across them would make every `enqueue`
 * during a drain block until the whole drain finishes, which is both an
 * unnecessary UX stall (a screen enqueuing a completion would hang) and,
 * because `drain()`'s in-flight promise itself resolves only after its own
 * lock acquisition settles, self-deadlocking in the case where the caller is
 * waiting on that same enqueue to resolve before unblocking the handler (as
 * the concurrency test below does). Scoping the lock to the actual
 * read-modify-write sections -- all of `enqueue`, and just the tail of
 * `drain()` -- closes the race without serialising unrelated network I/O.
 *
 * NOT RE-ENTRANT. Never call `withLock` from inside a function that is itself
 * called from inside a locked section -- in particular, do not add locking to
 * `readOutbox` (or to `migrateLegacyQueue`/`readList` beneath it): `enqueue`
 * already calls `readOutbox` from inside its own critical section, and a
 * second acquisition there would wait on a lock its own caller holds and never
 * released, hanging every `enqueue` for that user forever, silently, with no
 * error -- i.e. "finishing a workout hangs", the exact failure this whole
 * subsystem exists to prevent. Lock at the CALL SITE instead (as `drain()`'s
 * head does for its unlocked `readOutbox`).
 */
function withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(userId, next.then(() => undefined, () => undefined));
  return next;
}

const inFlight = new Map<string, Promise<Drain>>();

/** FIFO per user. Single-flight: a second call while one runs joins it. */
export async function drain(userId: string): Promise<Drain> {
  const running = inFlight.get(userId);
  if (running) return running;

  const promise = (async (): Promise<Drain> => {
    // Locked at the CALL SITE, not inside `readOutbox`: `readOutbox` runs
    // `migrateLegacyQueue`, which WRITES the outbox key on a first launch
    // after upgrade, and that write has to be serialised against a concurrent
    // `enqueue`. It cannot be locked inside `readOutbox` itself -- `enqueue`
    // calls it from inside its own critical section, and `withLock` is not
    // re-entrant (see its doc comment). The lock is released before the
    // handler loop below, so a mid-drain `enqueue` never waits on the network.
    const items = await withLock(userId, () => readOutbox(userId));

    // Every exit path below re-reads the outbox before writing, and removes
    // only the items THIS call actually finished with.
    //
    // WHY. `items` is a snapshot taken before the first handler is awaited, and
    // a drain takes as long as the network does. If someone finishes a workout
    // mid-drain, `enqueue` appends it to disk correctly -- and the old code
    // then wrote back a slice of the stale snapshot over the top of it, losing
    // it silently. Ids, not slices.
    const processed = new Set<string>();       // sent or dead-lettered
    const newDeadLetters: OutboxItem[] = [];
    let   bumped: OutboxItem | null = null;    // the item a retryable error halted on
    let   sent = 0;
    let   failed = 0;

    for (const item of items) {
      const handler = handlers[item.kind];
      if (!handler) {
        // No handler registered yet (e.g. app cold-started mid-migration).
        // Halt here, same as a retryable error, so this item and everything
        // behind it stay queued in order for the next drain.
        break;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await handler(item.payload as never);
        sent += 1;
        processed.add(item.id);
      } catch (e) {
        const { message } = describeError(e);
        if (isPermanentError(e)) {
          failed += 1;
          processed.add(item.id);
          newDeadLetters.push({ ...item, attempts: item.attempts + 1, lastError: message });
          continue;
        }
        bumped = { ...item, attempts: item.attempts + 1, lastError: message };
        break;
      }
    }

    return withLock(userId, async () => {
      const current   = await readList(outboxKey(userId));
      const remaining = current
        .filter((i) => !processed.has(i.id))
        .map((i) => (bumped && i.id === bumped.id ? bumped : i));
      await writeList(outboxKey(userId), remaining);

      if (newDeadLetters.length > 0) {
        const currentDead = await readList(deadLetterKey(userId));
        await writeList(deadLetterKey(userId), [...currentDead, ...newDeadLetters]);
      }

      return { sent, left: remaining.length, failed, deadLettered: newDeadLetters };
    });
  })();

  inFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(userId);
  }
}
