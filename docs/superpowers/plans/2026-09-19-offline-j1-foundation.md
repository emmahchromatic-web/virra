# Offline J1 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the outbox (generalised offline write queue), the network store, and the sync pill described as "J1 Foundation" in the offline-first spec — and close two verified gaps found while reviewing the programme: workout completion doesn't update the local session state, so the dashboard/training tab lag until the queue drains (Trello: dashboard-laggy card, Done, but the underlying cause is still open); and the in-progress workout draft (card 228) writes straight to Supabase with no local fallback, so the crash-resume safety net silently does nothing with no signal.

**Architecture:** Generalise the existing card-253 `pendingCompletions.ts` queue into a typed, multi-kind outbox (`src/lib/outbox.ts` + one handler file per mutation kind) that drains FIFO, stops on network errors, dead-letters permanent ones, and is idempotent by construction. Pair it with a `network` store backed by NetInfo and a `SyncPill` that surfaces state. Workout completion applies its result to `sessionStore` immediately and locally, before the network round-trip, so the UI is never waiting on sync to reflect what the user just did.

**Tech Stack:** Expo SDK 54, React Native 0.81, Zustand 5 (`persist` middleware, existing `asyncStorageAdapter`), `@react-native-async-storage/async-storage`, `@react-native-community/netinfo` (new dependency), Jest + `@testing-library/react-native`, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-09-14-offline-first-design.md` (card 284; sections 4.2–4.5 and the "J1 Foundation" delivery item this plan implements). Related Trello cards: 284 (programme), 253 (finish workout offline — this plan replaces `pendingCompletions.ts`), 258 (start workout offline, unaffected), 283 (app opens offline, unaffected), the "Active workout session lost mid-recording" card (Done — Task 8 below hardens it), and the "Dashboard update is laggy after end of workout" card (Done — Task 4 below closes the offline case that fix didn't cover).

## Global Constraints

- NetInfo is a native module. A local build must run `npx expo prebuild --clean` (or a fresh EAS build) before it will work — a build cut without this crashes on import. Note this in `docs/cutting-a-build.md` as part of Task 1.
- Every AsyncStorage key holding per-user data must be namespaced `...:<userId>` and added to `USER_CACHE_PREFIXES` in `mobile/src/lib/localCaches.ts`, or it leaks into the next account that signs in on the same device (card 225's bug class).
- Icons are SF Symbols via `expo-symbols`'s `SymbolView`, never emoji or unicode glyphs.
- Every queued write must be idempotent: either a client UUID that becomes the row id, or an upsert against an existing unique constraint. No exceptions.
- A network error during drain must stop the drain and leave the item at the head. A permanent error (anything else) dead-letters the item and the drain continues. Never conflate the two.
- Money/entitlement state (RevenueCat) is out of scope for this plan and must not be touched.
- Colours, fonts and spacing come from `mobile/src/constants/theme.ts` (`colors`, `fonts`, `spacing`, `radius`) — no ad hoc values.

---

## Before you start

Local `main` in this repo is 19 commits behind `origin/main` (last local commit `0d681c7`; `origin/main` is at `0952424` as of 2026-09-19, which includes the merged offline-first spec at `5ebd006` and the card-295 Training-tab fix at `f71873e`). None of the files this plan touches exist at their current shape until you're on `origin/main`.

- [ ] **Step 1: Sync local main**

```bash
git fetch origin
git checkout main
git merge --ff-only origin/main
```

- [ ] **Step 2: Confirm the baseline is green**

Run: `cd mobile && npm test`
Expected: all suites pass (160 suites / 1730 tests as of the last recorded run on `origin/main`; exact count may have moved).

---

### Task 1: Network store

**Files:**
- Create: `mobile/src/store/network.ts`
- Test: `mobile/__tests__/store/network.test.ts`
- Modify: `mobile/package.json` (new dependency)
- Modify: `docs/cutting-a-build.md` (one line, native module note)

**Interfaces:**
- Produces: `useNetworkStore` (Zustand hook) with `{ isOnline: boolean; lastOnlineAt: number | null; setOnline: (online: boolean) => void }`; `startNetworkListener(): () => void`.

- [ ] **Step 1: Install NetInfo**

```bash
cd mobile && npx expo install @react-native-community/netinfo
```

- [ ] **Step 2: Write the failing test**

```ts
// mobile/__tests__/store/network.test.ts
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

import { useNetworkStore } from '@/store/network';

describe('network store', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isOnline: true, lastOnlineAt: null });
  });

  it('starts online with no lastOnlineAt recorded yet', () => {
    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(useNetworkStore.getState().lastOnlineAt).toBeNull();
  });

  it('going offline keeps the last known online time', () => {
    useNetworkStore.getState().setOnline(true);
    const stamped = useNetworkStore.getState().lastOnlineAt;
    useNetworkStore.getState().setOnline(false);
    expect(useNetworkStore.getState().isOnline).toBe(false);
    expect(useNetworkStore.getState().lastOnlineAt).toBe(stamped);
  });

  it('coming back online stamps a new lastOnlineAt', () => {
    useNetworkStore.getState().setOnline(false);
    useNetworkStore.getState().setOnline(true);
    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(useNetworkStore.getState().lastOnlineAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/store/network.test.ts`
Expected: FAIL — `Cannot find module '@/store/network'`

- [ ] **Step 3: Write the implementation**

```ts
// mobile/src/store/network.ts
import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isOnline:     boolean;
  lastOnlineAt: number | null;
  setOnline:    (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline:     true,
  lastOnlineAt: null,
  setOnline: (online) =>
    set((s) => ({ isOnline: online, lastOnlineAt: online ? Date.now() : s.lastOnlineAt })),
}));

/**
 * Starts the single app-wide NetInfo listener. Call once from the
 * authenticated layout; returns the unsubscribe function for its cleanup.
 */
export function startNetworkListener(): () => void {
  return NetInfo.addEventListener((state) => {
    const online = state.isInternetReachable ?? state.isConnected ?? true;
    useNetworkStore.getState().setOnline(online);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/store/network.test.ts`
Expected: PASS, 3/3

- [ ] **Step 5: Note the native module requirement**

Add one line to `docs/cutting-a-build.md`'s prebuild section: "Adding `@react-native-community/netinfo` (offline J1) means a build cut without a clean prebuild will crash on import — always `expo prebuild --clean` after this change lands."

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/network.ts mobile/__tests__/store/network.test.ts mobile/package.json mobile/package-lock.json docs/cutting-a-build.md
git commit -m "feat(offline): add network connectivity store"
```

---

### Task 2: Outbox core engine

**Files:**
- Create: `mobile/src/lib/outbox.ts`
- Test: `mobile/__tests__/lib/outbox.test.ts`
- Modify: `mobile/src/lib/localCaches.ts`

**Interfaces:**
- Consumes: `PendingCompletion` type from `@/lib/pendingCompletions` (unchanged, read-only, for the one-time migration).
- Produces: `MutationKind`, `MutationPayloadMap`, `OutboxItem<K>`, `Drain`, `registerHandler<K>(kind, handler)`, `enqueue<K>(userId, kind, payload)`, `drain(userId)`, `readOutbox(userId)`, `readDeadLetters(userId)`, `dismissDeadLetter(userId, id)`.

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/__tests__/lib/outbox.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue, drain, readOutbox, readDeadLetters, dismissDeadLetter, registerHandler,
  type MutationPayloadMap,
} from '@/lib/outbox';

const okHandler = jest.fn().mockResolvedValue(undefined);
const networkErrorHandler = jest.fn().mockRejectedValue(new Error('Network request failed'));
const permanentErrorHandler = jest.fn().mockRejectedValue(new Error('row-level security violation'));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  registerHandler('completeWorkout', okHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
});

const payload = (startedAt: string): MutationPayloadMap['completeWorkout'] => ({
  kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
  activity: { user_id: 'u1', started_at: startedAt }, runDetails: {},
});

describe('outbox — enqueue and drain', () => {
  it('persists before returning, and drains in FIFO order', async () => {
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));
    expect(await readOutbox('u1')).toHaveLength(2);

    const result = await drain('u1');
    expect(result).toEqual({ sent: 2, left: 0, failed: 0 });
    expect(okHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ activity: expect.objectContaining({ started_at: '2026-09-19T08:00:00Z' }) }));
    expect(okHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ activity: expect.objectContaining({ started_at: '2026-09-19T18:00:00Z' }) }));
    expect(await readOutbox('u1')).toHaveLength(0);
  });

  it('a network error halts the drain and keeps the item at the head', async () => {
    registerHandler('completeWorkout', networkErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));

    const result = await drain('u1');
    expect(result).toEqual({ sent: 0, left: 2, failed: 0 });
    expect(networkErrorHandler).toHaveBeenCalledTimes(1);
    const remaining = await readOutbox('u1');
    expect(remaining[0].attempts).toBe(1);
  });

  it('a permanent error dead-letters the item and the drain continues', async () => {
    registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));

    const result = await drain('u1');
    expect(result).toEqual({ sent: 0, left: 0, failed: 2 });
    expect(await readOutbox('u1')).toHaveLength(0);
    const deadLetters = await readDeadLetters('u1');
    expect(deadLetters).toHaveLength(2);
    expect(deadLetters[0].lastError).toMatch(/row-level security/);
  });

  it('dismissing a dead letter removes only that item', async () => {
    registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await drain('u1');
    const [item] = await readDeadLetters('u1');
    await dismissDeadLetter('u1', item.id);
    expect(await readDeadLetters('u1')).toHaveLength(0);
  });

  it('is isolated per user', async () => {
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    expect(await readOutbox('u2')).toHaveLength(0);
  });

  it('migrates the legacy card-253 queue on first read, then deletes it', async () => {
    await AsyncStorage.setItem('virra:pending_completions:v1:u1', JSON.stringify([
      { kind: 'run', queuedAt: '2026-09-01T00:00:00Z', sessionId: null, activity: { user_id: 'u1', started_at: '2026-09-01T08:00:00Z' }, runDetails: {} },
    ]));
    const migrated = await readOutbox('u1');
    expect(migrated).toHaveLength(1);
    expect(migrated[0].kind).toBe('completeWorkout');
    expect(await AsyncStorage.getItem('virra:pending_completions:v1:u1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest __tests__/lib/outbox.test.ts`
Expected: FAIL — `Cannot find module '@/lib/outbox'`

- [ ] **Step 3: Write the implementation**

```ts
// mobile/src/lib/outbox.ts
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
  handlers[kind] = handler;
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
      if (!handler) continue; // no handler registered yet (e.g. app cold-started mid-migration); leave for the next drain

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest __tests__/lib/outbox.test.ts`
Expected: PASS, 6/6

- [ ] **Step 5: Add the new keys to the sign-out sweep**

In `mobile/src/lib/localCaches.ts`, add to the prefix list and its comment block:

```ts
// virra:outbox:v1:<userId> / virra:outbox_failed:v1:<userId> supersede
// virra:pending_completions:v1:<userId> (card 253) as of the J1 outbox.
// Same rule: per-user, must never survive to the next account.
export const USER_CACHE_PREFIXES = ['readiness_', 'hk_', 'notif_', 'virra:pending_completions:', 'virra:outbox:', 'virra:outbox_failed:'];
```

- [ ] **Step 6: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/outbox.ts mobile/__tests__/lib/outbox.test.ts mobile/src/lib/localCaches.ts
git commit -m "feat(offline): add the generalised outbox engine, migrating card 253's queue"
```

---

### Task 3: completeWorkout handler, and migrate both workout screens onto it

**Files:**
- Create: `mobile/src/lib/outbox/handlers/completeWorkout.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts`
- Modify: `mobile/app/(app)/workout-preview.tsx` (offline branch, ~line 1012–1040)
- Modify: `mobile/app/(app)/run.tsx` (offline branch, ~line 198–228)

**Interfaces:**
- Consumes: `registerHandler`, `MutationPayloadMap` from `@/lib/outbox` (Task 2); `enqueue` from `@/lib/outbox`.
- Produces: side-effect registration of the `completeWorkout` handler (importing this file runs `registerHandler(...)`).

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts
const mockSingle       = jest.fn();
const mockSelect       = jest.fn(() => ({ single: mockSingle }));
const mockUpsertAct    = jest.fn(() => ({ select: mockSelect }));
const mockUpsertOther  = jest.fn().mockResolvedValue({ error: null });
const mockInsert       = jest.fn().mockResolvedValue({ error: null });
const mockEqUpdate     = jest.fn().mockResolvedValue({ error: null });
const mockUpdate       = jest.fn(() => ({ eq: mockEqUpdate }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'activities') return { upsert: mockUpsertAct };
  if (table === 'planned_sessions') return { update: mockUpdate };
  return { upsert: mockUpsertOther, insert: mockInsert };
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleCompleteWorkout } from '@/lib/outbox/handlers/completeWorkout';
import type { PendingCompletion } from '@/lib/pendingCompletions';

beforeEach(() => jest.clearAllMocks());

describe('handleCompleteWorkout', () => {
  it('replays a queued strength completion, stamping activity_id on every child row', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-1' }, error: null });
    const item: PendingCompletion = {
      kind: 'strength', queuedAt: '2026-09-19T09:00:00Z', sessionId: 'sess-1',
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      setRows: [{ exercise: 'squat', reps: 8 }],
      details: { session_type: 'lower' },
    };
    await handleCompleteWorkout(item);

    expect(mockUpsertAct).toHaveBeenCalledWith(item.activity, { onConflict: 'user_id,started_at' });
    expect(mockInsert).toHaveBeenCalledWith([{ exercise: 'squat', reps: 8, activity_id: 'act-1' }]);
    expect(mockUpsertOther).toHaveBeenCalledWith({ session_type: 'lower', activity_id: 'act-1' }, { onConflict: 'activity_id' });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'completed', activity_id: 'act-1' });
    expect(mockEqUpdate).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('throws when the activity upsert errors, so the outbox treats it as a failed drain step', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' }, runDetails: {},
    };
    await expect(handleCompleteWorkout(item)).rejects.toThrow();
  });

  it('does not touch planned_sessions when the completion was not linked to one', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-2' }, error: null });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      runDetails: { avg_pace_seconds_per_km: 300 },
    };
    await handleCompleteWorkout(item);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/completeWorkout.test.ts`
Expected: FAIL — `Cannot find module '@/lib/outbox/handlers/completeWorkout'`

- [ ] **Step 3: Write the implementation**

```ts
// mobile/src/lib/outbox/handlers/completeWorkout.ts
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

  if (error) throw error;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/completeWorkout.test.ts`
Expected: PASS, 3/3

- [ ] **Step 5: Import the handler once for its registration side effect**

In `mobile/app/(app)/_layout.tsx`, add near the top alongside the other side-effect-only imports:

```ts
// Registers the completeWorkout outbox handler — must run before any drain().
import '@/lib/outbox/handlers/completeWorkout';
```

- [ ] **Step 6: Switch `workout-preview.tsx`'s offline branch to the outbox**

Replace the `import { enqueueCompletion } from '@/lib/pendingCompletions';` line with:

```ts
import { enqueue } from '@/lib/outbox';
```

Replace this block (around line 1012):

```ts
      await enqueueCompletion(session.user.id, {
        kind:      'strength',
        queuedAt:  new Date().toISOString(),
        sessionId: sessionId ?? null,
        activity:  activityRow,
        setRows,
        details:   detailsRow,
      });
      deleteWorkoutDraft(session.user.id).catch(() => {});
```

with:

```ts
      await enqueue(session.user.id, 'completeWorkout', {
        kind:      'strength',
        queuedAt:  new Date().toISOString(),
        sessionId: sessionId ?? null,
        activity:  activityRow,
        setRows,
        details:   detailsRow,
      });
      deleteWorkoutDraft(session.user.id).catch(() => {});
```

(Task 4 adds the local session-status update right after this line — leaving it out here so the two tasks stay independently reviewable.)

- [ ] **Step 7: Switch `run.tsx`'s offline branch to the outbox**

Same substitution in `mobile/app/(app)/run.tsx`: replace `import { enqueueCompletion } from '@/lib/pendingCompletions';` with `import { enqueue } from '@/lib/outbox';`, and replace the `await enqueueCompletion(session.user.id, { kind: 'run', ... })` call (around line 205) with `await enqueue(session.user.id, 'completeWorkout', { kind: 'run', ... })` — same payload shape, no other change.

- [ ] **Step 8: Update the existing screen tests' import mocks**

Find every test that mocks `@/lib/pendingCompletions`'s `enqueueCompletion` for these two screens (`grep -rl "enqueueCompletion" mobile/__tests__`) and change the mock target to `@/lib/outbox`'s `enqueue`, matching the new call shape (`enqueue(userId, 'completeWorkout', payload)` instead of `enqueueCompletion(userId, payload)`).

- [ ] **Step 9: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS, no regressions. `tsc --noEmit` clean.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/lib/outbox/handlers/completeWorkout.ts mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts mobile/app/\(app\)/_layout.tsx "mobile/app/(app)/workout-preview.tsx" "mobile/app/(app)/run.tsx" mobile/__tests__
git commit -m "feat(offline): move workout completion onto the outbox"
```

---

### Task 4: Local-first completion status — the dashboard-lag fix

This is the piece the review found missing. Today, queuing a completion offline never updates `sessionStore`, so the dashboard and Training tab still show the session as "planned" until the outbox drains **and** something re-fetches that date range. That is the exact shape of the "Dashboard update is laggy after end of workout" card (Done for the online case in `c9de730`; never covered for the offline/queued case).

**Files:**
- Modify: `mobile/src/store/sessionStore.types.ts`
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts`
- Modify: `mobile/app/(app)/workout-preview.tsx` (offline branch, right after Task 3's `enqueue` call)
- Modify: `mobile/app/(app)/run.tsx` (offline branch, right after Task 3's `enqueue` call)

**Interfaces:**
- Produces: `SessionStoreActions.applyLocalCompletion(sessionId: SessionId, activityId: string): void` — synchronous, no network call, no rollback (there is nothing to roll back to; the next `refresh()` of that date range replaces it with the server row, same as any other cached data).

- [ ] **Step 1: Write the failing test**

Add to `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
describe('sessionStore.applyLocalCompletion', () => {
  it('flips status to completed locally with no remote call', () => {
    useSessionStore.getState().applyLocalCompletion('s1', 'local-act-1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('local-act-1');
    expect(mockCommitLink).not.toHaveBeenCalled();
  });

  it('is a no-op for a session not in the cache', () => {
    useSessionStore.getState().applyLocalCompletion('does-not-exist', 'x');
    expect(useSessionStore.getState().byId['does-not-exist']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/store/sessionStore.mutations.test.ts`
Expected: FAIL — `applyLocalCompletion is not a function`

- [ ] **Step 3: Add the action to the type**

In `mobile/src/store/sessionStore.types.ts`, add to `SessionStoreActions`:

```ts
  /**
   * Marks a session completed in the local cache only, with no remote write.
   * Used when a completion has been queued to the outbox rather than
   * confirmed by the server — the activity id is a local placeholder, and
   * the next `refresh()` of this date range replaces the row with server
   * truth (real id included).
   */
  applyLocalCompletion(sessionId: SessionId, activityId: string): void;
```

- [ ] **Step 4: Implement it in the store**

In `mobile/src/store/sessionStore.ts`, add alongside `markComplete`:

```ts
      applyLocalCompletion: (sessionId, activityId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } },
        });
      },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/store/sessionStore.mutations.test.ts`
Expected: PASS

- [ ] **Step 6: Wire it into `workout-preview.tsx`'s offline branch**

Immediately after the `enqueue(session.user.id, 'completeWorkout', {...})` call added in Task 3, before `deleteWorkoutDraft(...)`:

```ts
      if (sessionId) {
        useSessionStore.getState().applyLocalCompletion(
          sessionId,
          `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        );
      }
```

Add `import { useSessionStore } from '@/store/sessionStore';` to the file's imports if not already present (check first — the Training tab and other screens already import it elsewhere in the app, but this specific file may not).

- [ ] **Step 7: Wire it into `run.tsx`'s offline branch**

Same addition, immediately after `run.tsx`'s `enqueue(...)` call from Task 3.

- [ ] **Step 8: Extend the screen tests**

For each of `workout-preview.tsx` and `run.tsx`'s existing "queues on save failure" test, add an assertion that the mocked `sessionStore.applyLocalCompletion` (or, if the test renders through the real store, that `useSessionStore.getState().byId[sessionId].status`) becomes `'completed'` immediately, without waiting for any drain.

- [ ] **Step 9: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/store/sessionStore.types.ts mobile/src/store/sessionStore.ts mobile/__tests__/store/sessionStore.mutations.test.ts "mobile/app/(app)/workout-preview.tsx" "mobile/app/(app)/run.tsx" mobile/__tests__
git commit -m "fix(offline): mark a queued workout completed locally, so the dashboard and training tab stop lagging behind the outbox"
```

---

### Task 5: Outbox status store + SyncPill

**Files:**
- Create: `mobile/src/store/outboxStatus.ts`
- Create: `mobile/src/components/SyncPill.tsx`
- Test: `mobile/__tests__/components/SyncPill.test.tsx`

**Interfaces:**
- Consumes: `useNetworkStore` (Task 1).
- Produces: `useOutboxStatus` Zustand hook `{ syncing, pendingCount, deadLetterCount, justSynced, setSyncing, setCounts, setJustSynced }`; `<SyncPill />` component with no props, reading both stores.

- [ ] **Step 1: Write the status store (no test needed — plain Zustand state, exercised via the component test)**

```ts
// mobile/src/store/outboxStatus.ts
import { create } from 'zustand';

interface OutboxStatusState {
  syncing:         boolean;
  pendingCount:    number;
  deadLetterCount: number;
  justSynced:      boolean;
  setSyncing:      (syncing: boolean) => void;
  setCounts:       (pendingCount: number, deadLetterCount: number) => void;
  setJustSynced:   (justSynced: boolean) => void;
}

export const useOutboxStatus = create<OutboxStatusState>((set) => ({
  syncing:         false,
  pendingCount:    0,
  deadLetterCount: 0,
  justSynced:      false,
  setSyncing:      (syncing) => set({ syncing }),
  setCounts:       (pendingCount, deadLetterCount) => set({ pendingCount, deadLetterCount }),
  setJustSynced:   (justSynced) => set({ justSynced }),
}));
```

- [ ] **Step 2: Write the failing component test**

```tsx
// mobile/__tests__/components/SyncPill.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { SyncPill } from '@/components/SyncPill';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';

function reset() {
  useNetworkStore.setState({ isOnline: true, lastOnlineAt: Date.now() });
  useOutboxStatus.setState({ syncing: false, pendingCount: 0, deadLetterCount: 0, justSynced: false });
}

describe('SyncPill', () => {
  beforeEach(reset);

  it('renders nothing when online, idle, and nothing failed', () => {
    const { queryByText } = render(<SyncPill />);
    expect(queryByText('Offline')).toBeNull();
    expect(queryByText('Syncing')).toBeNull();
  });

  it('shows Offline when the network store says offline', () => {
    useNetworkStore.setState({ isOnline: false });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Offline')).toBeTruthy();
  });

  it('shows Syncing while a drain is running with items left', () => {
    useOutboxStatus.setState({ syncing: true, pendingCount: 2 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Syncing')).toBeTruthy();
  });

  it('shows Unsaved when the dead-letter list is non-empty, even if online and idle', () => {
    useOutboxStatus.setState({ deadLetterCount: 1 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Unsaved')).toBeTruthy();
  });

  it('prioritises Unsaved over Offline', () => {
    useNetworkStore.setState({ isOnline: false });
    useOutboxStatus.setState({ deadLetterCount: 1 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Unsaved')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/components/SyncPill.test.tsx`
Expected: FAIL — `Cannot find module '@/components/SyncPill'`

- [ ] **Step 4: Write the implementation**

```tsx
// mobile/src/components/SyncPill.tsx
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { VirraText } from '@/components/ui/VirraText';
import { colors, spacing, radius } from '@/constants/theme';

type PillState = 'offline' | 'syncing' | 'synced' | 'failed' | null;

function deriveState(
  isOnline: boolean, syncing: boolean, pendingCount: number, deadLetterCount: number, justSynced: boolean,
): PillState {
  if (deadLetterCount > 0) return 'failed';
  if (!isOnline) return 'offline';
  if (syncing && pendingCount > 0) return 'syncing';
  if (justSynced) return 'synced';
  return null;
}

const CONFIG: Record<Exclude<PillState, null>, { icon: string; label: string }> = {
  offline: { icon: 'wifi.slash', label: 'Offline' },
  syncing: { icon: 'arrow.triangle.2.circlepath', label: 'Syncing' },
  synced:  { icon: 'checkmark', label: 'Synced' },
  failed:  { icon: 'exclamationmark.triangle', label: 'Unsaved' },
};

export function SyncPill() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const syncing = useOutboxStatus((s) => s.syncing);
  const pendingCount = useOutboxStatus((s) => s.pendingCount);
  const deadLetterCount = useOutboxStatus((s) => s.deadLetterCount);
  const justSynced = useOutboxStatus((s) => s.justSynced);
  const state = deriveState(isOnline, syncing, pendingCount, deadLetterCount, justSynced);

  const opacity = useSharedValue(state ? 1 : 0);
  useEffect(() => { opacity.value = withTiming(state ? 1 : 0, { duration: 200 }); }, [state, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (state !== 'synced') return;
    const t = setTimeout(() => useOutboxStatus.getState().setJustSynced(false), 1500);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;
  const { icon, label } = CONFIG[state];

  return (
    <Animated.View style={[styles.pill, animatedStyle]} pointerEvents="none">
      <SymbolView name={icon as never} size={12} tintColor={colors.breath} />
      <VirraText variant="mono" size={11} color={colors.breath}>{label}</VirraText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position:        'absolute',
    top:              8,
    alignSelf:        'center',
    flexDirection:    'row',
    alignItems:       'center',
    gap:              spacing.xs,
    backgroundColor:  colors.mist,
    paddingHorizontal: spacing.sm,
    paddingVertical:  4,
    borderRadius:     radius.full,
    zIndex:           50,
  },
});
```

Check whether `react-native-reanimated` is already a dependency (`grep reanimated mobile/package.json`) before using it. If it is not installed, use `Animated` from `react-native` core instead (`useRef(new Animated.Value(...))` + `Animated.timing`) rather than adding a new native dependency for one fade — that is the lower-risk choice this close to submission, per the spec's own risk framing.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/components/SyncPill.test.tsx`
Expected: PASS, 5/5

- [ ] **Step 6: Mount it once**

In `mobile/app/(app)/_layout.tsx`, import `{ SyncPill }` from `@/components/SyncPill` and render `<SyncPill />` once, as a sibling above the `<Stack>` (matching how `<VirraAlertHost />` is mounted once in the root layout) — not inside any individual screen.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/store/outboxStatus.ts mobile/src/components/SyncPill.tsx mobile/__tests__/components/SyncPill.test.tsx "mobile/app/(app)/_layout.tsx"
git commit -m "feat(offline): add the sync pill"
```

---

### Task 6: Wire the triggers — auto-refresh, reconnect-then-drain, foreground

**Files:**
- Modify: `mobile/app/_layout.tsx` (root layout — auth auto-refresh)
- Modify: `mobile/app/(app)/_layout.tsx` (network listener, reconnect-then-drain, replace `flushPendingCompletions`)
- Test: `mobile/__tests__/app/rootLayoutOffline.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: `startNetworkListener`, `useNetworkStore` (Task 1); `drain`, `readOutbox`, `readDeadLetters` (Task 2); `useOutboxStatus` (Task 5).

- [ ] **Step 1: Extend the root-layout test**

Add to `mobile/__tests__/app/rootLayoutOffline.test.tsx`:

```ts
it('starts auto-refresh when the app foregrounds and stops it when it backgrounds', () => {
  // Follow the existing file's convention for driving AppState.addEventListener's
  // captured callback and asserting against the mocked supabase.auth calls;
  // assert startAutoRefresh is called on 'active' and stopAutoRefresh on
  // 'background'/'inactive'.
});
```

(Write this against the existing file's actual mocking style — read `mobile/__tests__/app/rootLayoutOffline.test.tsx` first, since it already mocks `AppState` and `supabase.auth` for the card-283 tests, and this only adds two more assertions to that same harness rather than a new one.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/app/rootLayoutOffline.test.tsx`
Expected: FAIL — `startAutoRefresh`/`stopAutoRefresh` never called.

- [ ] **Step 3: Wire auto-refresh in the root layout**

In `mobile/app/_layout.tsx`, add an effect alongside the existing session-loading one:

```ts
  // supabase-js's auto-refresh timer does not run while backgrounded, so a
  // user who returns after hours with an expired token hits a failed request
  // before any refresh happens. Foreground/background it explicitly.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
```

Add `import { AppState } from 'react-native';` to the existing `react-native` import in that file (it currently only imports `View`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/app/rootLayoutOffline.test.tsx`
Expected: PASS

- [ ] **Step 5: Replace `flushPendingCompletions` with the reconnect-then-drain sequence**

In `mobile/app/(app)/_layout.tsx`:

1. Remove `import { flushPendingCompletions } from '@/lib/pendingCompletions';`.
2. Add:

```ts
import { startNetworkListener, useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { drain, readOutbox, readDeadLetters } from '@/lib/outbox';
```

3. Replace the `syncPending` function body:

```ts
    // Card 253 → the J1 outbox. Safe to call every time: a network error
    // halts the drain and leaves the queue exactly where it was; a permanent
    // one dead-letters just that item and the rest still go through.
    const syncPending = async () => {
      if (!useNetworkStore.getState().isOnline) return;
      const before = await readOutbox(session.user.id);
      if (before.length === 0) return;
      useOutboxStatus.getState().setSyncing(true);
      const result = await drain(session.user.id).catch(() => ({ sent: 0, left: before.length, failed: 0 }));
      const deadLetters = await readDeadLetters(session.user.id);
      useOutboxStatus.getState().setCounts(result.left, deadLetters.length);
      useOutboxStatus.getState().setSyncing(false);
      if (result.left === 0 && result.sent > 0) useOutboxStatus.getState().setJustSynced(true);
    };
```

4. Add the network listener start/stop next to the existing `AppState` subscription in the same effect:

```ts
    const stopNetworkListener = startNetworkListener();
    const unsubscribeNet = useNetworkStore.subscribe((s, prev) => {
      if (s.isOnline && !prev.isOnline) syncPending();
    });
```

and return both from the effect's cleanup alongside the existing subscription removals:

```ts
    return () => {
      sub.remove();
      receiveSub.remove();
      stopNetworkListener();
      unsubscribeNet();
    };
```

(Match this against the effect's actual existing `return` statement — the file already returns a cleanup that removes `sub` and `receiveSub`; add the two new lines to it rather than replacing it.)

- [ ] **Step 6: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS, no regressions. `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/_layout.tsx" "mobile/app/(app)/_layout.tsx" mobile/__tests__/app/rootLayoutOffline.test.tsx
git commit -m "feat(offline): drain the outbox on reconnect and foreground; wire auth auto-refresh to app state"
```

---

### Task 7: Sign-out guard

**Files:**
- Modify: `mobile/app/(app)/(tabs)/profile.tsx` (`handleSignOut`)
- Test: add to `mobile/__tests__/app/profile.test.tsx` (or the existing profile screen test file — check its actual name with `find mobile/__tests__ -iname "*profile*"` first)

**Interfaces:**
- Consumes: `readOutbox`, `drain` (Task 2); `useNetworkStore` (Task 1); `appAlert` (existing).

- [ ] **Step 1: Write the failing test**

```tsx
it('warns before signing out with unsynced changes, and cancelling keeps them', async () => {
  // Seed the outbox for the signed-in test user with one item, mock
  // useNetworkStore to report offline (so drain is skipped), render the
  // profile screen, press Sign Out, and assert:
  //   - appAlert was called with a message mentioning "1" and "haven't synced"
  //   - pressing the alert's "Cancel" button does NOT call the mocked signOut
  //   - pressing "Sign Out Anyway" DOES call the mocked signOut
  // Follow this file's existing pattern for mocking `useAuthStore` and
  // `appAlert` — it already has both for the avatar-upload and
  // delete-account tests above.
});

it('signs out immediately with no alert when the outbox is empty', async () => {
  // Same setup with an empty outbox: pressing Sign Out calls signOut()
  // straight away, no appAlert call.
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest <the profile test file path>`
Expected: FAIL (current `handleSignOut` has no outbox check).

- [ ] **Step 3: Implement the guard**

In `mobile/app/(app)/(tabs)/profile.tsx`, add imports:

```ts
import { readOutbox, drain } from '@/lib/outbox';
import { useNetworkStore } from '@/store/network';
```

Replace `handleSignOut`:

```ts
  async function handleSignOut() {
    const userId = session?.user.id;
    if (userId) {
      if (useNetworkStore.getState().isOnline) {
        await drain(userId).catch(() => {});
      }
      const pending = await readOutbox(userId);
      if (pending.length > 0) {
        appAlert(
          'Changes have not synced yet',
          `${pending.length} change${pending.length === 1 ? '' : 's'} haven't synced yet. Signing out will discard ${pending.length === 1 ? 'it' : 'them'}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign Out Anyway',
              style: 'destructive',
              onPress: async () => { await signOut(); router.replace('/(auth)'); },
            },
          ],
        );
        return;
      }
    }
    await signOut();
    router.replace('/(auth)');
  }
```

This deliberately does not touch `handleDeleteAccount` — deleting the account already discards everything server-side, so warning about unsynced local changes first would be noise, not protection.

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest <the profile test file path>`
Expected: PASS

- [ ] **Step 5: Run the full mobile suite**

Run: `cd mobile && npm test`

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/(tabs)/profile.tsx" mobile/__tests__
git commit -m "feat(offline): warn before sign-out discards unsynced changes"
```

---

### Task 8: Harden in-progress workout drafts (card 228) for no signal

Found during this review: `saveWorkoutDraft` (card 228, the crash-resume safety net) writes only to Supabase and swallows failures with `console.error`. In the exact scenario this whole programme is about — a gym with no signal — every set logged during the session silently fails to persist, and the resume mechanism has nothing to resume from if the app is then killed. Card 228 passed UAT, but Emma's test was force-quit-with-signal; the no-signal path was never exercised.

**Files:**
- Modify: `mobile/src/lib/workoutDrafts.ts`
- Modify: `mobile/__tests__/lib/workoutDrafts.test.ts` (existing file — add `beforeEach` AsyncStorage clearing, since drafts now leave local state behind)
- Modify: `mobile/src/lib/localCaches.ts`

- [ ] **Step 1: Write the failing tests**

Add to `mobile/__tests__/lib/workoutDrafts.test.ts`, and add `await AsyncStorage.clear();` to the top of every existing `beforeEach` in the file (local storage now persists between calls, so tests must not leak into each other):

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// ... inside describe('saveWorkoutDraft')
it('writes to local storage even when the Supabase upsert fails, so the draft survives with no signal', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUpsert.mockResolvedValue({ error: { message: 'Network request failed' } });
  await saveWorkoutDraft('user-1', 'sess-1', 'strength', '2026-08-25T10:00:00.000Z', 30, { logged: { a: [1] } });

  const raw = await AsyncStorage.getItem('virra:workout_draft:v1:user-1');
  expect(raw).not.toBeNull();
  expect(JSON.parse(raw!).draft).toEqual({ logged: { a: [1] } });
  spy.mockRestore();
});

// ... inside describe('loadWorkoutDraft')
it('reads the local draft without calling Supabase, when one exists', async () => {
  await saveWorkoutDraft('user-1', 'sess-1', 'run', '2026-08-25T10:00:00.000Z', 0, { splits: [1, 2] });
  mockMaybeSingle.mockClear();

  const draft = await loadWorkoutDraft('user-1');
  expect(draft?.draft).toEqual({ splits: [1, 2] });
  expect(mockMaybeSingle).not.toHaveBeenCalled();
});

// ... inside describe('deleteWorkoutDraft')
it('removes the local draft as well as the remote row', async () => {
  await saveWorkoutDraft('user-1', 'sess-1', 'run', '2026-08-25T10:00:00.000Z', 0, {});
  mockEqDelete.mockResolvedValue({ error: null });
  await deleteWorkoutDraft('user-1');
  expect(await AsyncStorage.getItem('virra:workout_draft:v1:user-1')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest __tests__/lib/workoutDrafts.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement the local-first fallback**

```ts
// mobile/src/lib/workoutDrafts.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const LOCAL_KEY_PREFIX = 'virra:workout_draft:v1:';
const localKeyFor = (userId: string) => `${LOCAL_KEY_PREFIX}${userId}`;

// One in-progress workout per user (unique on user_id) — starting a new
// session replaces any stale draft left over from a prior interrupted one.
export interface WorkoutDraft {
  id:                string;
  plannedSessionId:  string | null;
  modality:          string;
  startedAt:         string;   // ISO
  pausedSeconds:     number;
  draft:             Record<string, unknown>;
}

export async function saveWorkoutDraft(
  userId:            string,
  plannedSessionId:  string | null,
  modality:          string,
  startedAt:         string,
  pausedSeconds:     number,
  draft:             Record<string, unknown>,
): Promise<void> {
  // Local write first: this is what actually survives a gym with no signal.
  // The Supabase mirror below is best-effort, same as it always was.
  try {
    const record: WorkoutDraft = { id: userId, plannedSessionId, modality, startedAt, pausedSeconds, draft };
    await AsyncStorage.setItem(localKeyFor(userId), JSON.stringify(record));
  } catch (e) {
    console.error('[workoutDrafts] local save failed', e);
  }

  const { error } = await supabase.from('workout_drafts').upsert({
    user_id:            userId,
    planned_session_id: plannedSessionId,
    modality,
    started_at:         startedAt,
    paused_seconds:      pausedSeconds,
    draft_json:          draft,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) console.error('[workoutDrafts] remote save failed', error);
}

export async function loadWorkoutDraft(userId: string): Promise<WorkoutDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(localKeyFor(userId));
    if (raw) return JSON.parse(raw) as WorkoutDraft;
  } catch (e) {
    console.error('[workoutDrafts] local load failed', e);
  }

  // No local draft — a fresh install, or a crash before the first local
  // write. Fall back to whatever Supabase last received.
  const { data, error } = await supabase
    .from('workout_drafts')
    .select('id, planned_session_id, modality, started_at, paused_seconds, draft_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[workoutDrafts] remote load failed', error);
    return null;
  }
  if (!data) return null;
  return {
    id:                data.id,
    plannedSessionId:  data.planned_session_id,
    modality:          data.modality,
    startedAt:         data.started_at,
    pausedSeconds:     data.paused_seconds,
    draft:             data.draft_json,
  };
}

export async function deleteWorkoutDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(localKeyFor(userId));
  } catch (e) {
    console.error('[workoutDrafts] local delete failed', e);
  }
  const { error } = await supabase.from('workout_drafts').delete().eq('user_id', userId);
  if (error) console.error('[workoutDrafts] remote delete failed', error);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest __tests__/lib/workoutDrafts.test.ts`
Expected: PASS, all tests including the 3 new ones and the 10 pre-existing ones.

- [ ] **Step 5: Add the new key to the sign-out sweep**

In `mobile/src/lib/localCaches.ts`, add `'virra:workout_draft:v1:'` to `USER_CACHE_PREFIXES`, with a one-line comment noting it mirrors `workout_drafts` and must not survive to the next account on the device.

- [ ] **Step 6: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/workoutDrafts.ts mobile/__tests__/lib/workoutDrafts.test.ts mobile/src/lib/localCaches.ts
git commit -m "fix(offline): persist the in-progress workout draft locally first, so resume survives no signal"
```

---

### Task 9: Remove the superseded queue, update docs

**Files:**
- Modify: `mobile/src/lib/pendingCompletions.ts` (remove `flushPendingCompletions`, `enqueueCompletion` — no longer called from anywhere)
- Modify: `mobile/__tests__/lib/pendingCompletions.test.ts` (keep only the `dedupe`/`pendingKeyFor` tests — those helpers are still imported by `outbox.ts`'s migration path; or better, check whether `outbox.ts` needs `dedupe` at all — it does not, since the legacy migration just maps 1:1 — so this whole file becomes migration-input-shape-only)
- Modify: `CLAUDE.md` (Phase J section)
- Modify: `docs/superpowers/plans/2026-05-27-shared-session-state.md` — no change needed, referenced for context only

- [ ] **Step 1: Check nothing still calls the two removed functions**

Run: `cd mobile && grep -rn "flushPendingCompletions\|enqueueCompletion" app src __tests__`
Expected: no matches outside `pendingCompletions.ts` itself and its own test file.

- [ ] **Step 2: Trim `pendingCompletions.ts` to just the types the migration needs**

Remove `enqueueCompletion`, `clearQueue`, `replayCompletion`, `flushPendingCompletions`, and the `writeQueue` helper they used. Keep `PendingCompletion`, `QueuedRun`, `QueuedStrength`, `readQueue`, `pendingKeyFor`, and `dedupe` (the outbox's migration reads via `AsyncStorage` directly rather than `readQueue`, so `readQueue` can also go — check whether anything besides the file's own tests still imports it before deleting; if the tests are the only caller, delete `readQueue` and the two `dedupe`/`pendingKeyFor` tests are all that remain worth keeping).

- [ ] **Step 3: Trim the test file to match**

Keep only `dedupe`, `pendingKeyFor` tests from `mobile/__tests__/lib/pendingCompletions.test.ts`; remove any that exercised the deleted functions.

- [ ] **Step 4: Run the full mobile suite**

Run: `cd mobile && npm test`
Expected: PASS. `tsc --noEmit` clean.

- [ ] **Step 5: Update CLAUDE.md's Phase J section**

Replace the "Phase J — Local Cache + Offline Resilience" section's store table and delivery description with a short pointer: "Superseded by the offline-first design (card 284): `docs/superpowers/specs/2026-09-14-offline-first-design.md`. J1 Foundation (this plan) shipped the outbox, network store and sync pill. J2 (cache-first reads: dashboard, training, nutrition, recipes) and J3 (remaining write handlers: nutrition, check-in, calendar, favourites) follow as separate plans." Leave the rest of the file's Phase ordering and numbering alone — this is a content edit, not a renumbering.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/pendingCompletions.ts mobile/__tests__/lib/pendingCompletions.test.ts CLAUDE.md
git commit -m "chore(offline): retire the card-253 queue now the outbox has migrated it"
```

---

## Self-Review

**Spec coverage against `docs/superpowers/specs/2026-09-14-offline-first-design.md` §8 "J1 Foundation":**
- ✅ NetInfo + network store — Task 1
- ✅ Outbox core with `completeWorkout` migrated from `pendingCompletions` — Tasks 2–3
- ✅ SyncPill — Task 5
- ✅ Auto-refresh wiring — Task 6
- ✅ Reconnect-then-drain — Task 6
- ✅ Sign-out guard — Task 7
- ✅ Investigation of the card-253 build-14 failure — covered by this review (see status summary in chat); the fix that shipped for build 15 (`1a9b979`) is preserved as-is inside the migrated `handleCompleteWorkout`, no behaviour change beyond throwing instead of returning `false`.
- ➕ Local-first completion status (Task 4) and workout-draft local fallback (Task 8) are additions beyond the written spec, found while verifying "what already works" against the current code. Both are small, scoped, and directly serve the gym-no-signal case the whole programme exists for.

**Out of scope for this plan, staying in J2/J3 per the spec's own sequencing rule** ("nothing in J2 or J3 starts until J1 has passed on a phone"): `nutritionDay`/`recipes`/`recentFoods` stores, dashboard/training/nutrition cache-first reads, `NeedsSignal` sweep on remaining screens, and the write handlers for food logging, check-in, drop/move session, and favourites. Card 295 (Training tab `NeedsSignal`) already shipped ahead of this ordering — that's a fait accompli, not a reason to skip J1 device verification before starting the rest of J2/J3.

**Device verification gap, not closed by this plan:** cards 253 and 258 are still sitting in Trello's UAT list with no recorded pass/fail since build 15 (2026-09-15) — only card 283 was confirmed. This plan's Task 3 replaces the code those cards test, so re-running their device QA steps against the build that includes this plan is the verification, not a separate step. Worth a direct check with Emma before or alongside implementation, since the record is genuinely ambiguous, not just stale.
