import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingCompletion } from '@/lib/pendingCompletions';

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

export interface Drain { sent: number; left: number; failed: number }

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
  const items = await readList(deadLetterKey(userId));
  await writeList(deadLetterKey(userId), items.filter((i) => i.id !== id));
}

export async function enqueue<K extends MutationKind>(
  userId: string, kind: K, payload: MutationPayloadMap[K],
): Promise<OutboxItem<K>> {
  const items = await readOutbox(userId);
  const item: OutboxItem<K> = { id: makeOutboxId(), kind, payload, createdAt: new Date().toISOString(), attempts: 0 };
  await writeList(outboxKey(userId), [...items, item] as OutboxItem[]);
  return item;
}

/** Network failures are retried; everything else is a permanent rejection. */
function isNetworkError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /network|fetch|timeout|abort/i.test(message);
}

const inFlight = new Map<string, Promise<Drain>>();

/** FIFO per user. Single-flight: a second call while one runs joins it. */
export async function drain(userId: string): Promise<Drain> {
  const running = inFlight.get(userId);
  if (running) return running;

  const promise = (async (): Promise<Drain> => {
    const items = await readOutbox(userId);
    const deadLetters = await readList(deadLetterKey(userId));
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const handler = handlers[item.kind];
      if (!handler) {
        // No handler registered yet (e.g. app cold-started mid-migration).
        // Halt here, same as a network error, so this item and everything
        // behind it stay queued in order for the next drain -- `continue`
        // would silently drop them once the loop clears the outbox below.
        const remaining = items.slice(i);
        await writeList(outboxKey(userId), remaining);
        await writeList(deadLetterKey(userId), deadLetters);
        return { sent, left: remaining.length, failed };
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await handler(item.payload as never);
        sent += 1;
      } catch (e) {
        if (isNetworkError(e)) {
          const bumped: OutboxItem = {
            ...item, attempts: item.attempts + 1, lastError: e instanceof Error ? e.message : String(e),
          };
          const remaining = [bumped, ...items.slice(i + 1)];
          await writeList(outboxKey(userId), remaining);
          await writeList(deadLetterKey(userId), deadLetters);
          return { sent, left: remaining.length, failed };
        }
        failed += 1;
        deadLetters.push({
          ...item, attempts: item.attempts + 1, lastError: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await writeList(outboxKey(userId), []);
    await writeList(deadLetterKey(userId), deadLetters);
    return { sent, left: 0, failed };
  })();

  inFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(userId);
  }
}
