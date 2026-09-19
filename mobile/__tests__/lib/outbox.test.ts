import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue, drain, readOutbox, readDeadLetters, dismissDeadLetter, registerHandler,
  type MutationPayloadMap,
} from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

// Every payload enqueued in this file is `completeWorkout`; narrow the
// `MutationPayloadMap[MutationKind]` union `.payload` comes back as (now that
// `checkIn` is a second member) back down to the shape these assertions need.
const asCompleteWorkout = (p: unknown) => p as MutationPayloadMap['completeWorkout'];

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
    expect(result).toEqual({ sent: 2, left: 0, failed: 0, deadLettered: [] });
    expect(okHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ activity: expect.objectContaining({ started_at: '2026-09-19T08:00:00Z' }) }));
    expect(okHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ activity: expect.objectContaining({ started_at: '2026-09-19T18:00:00Z' }) }));
    expect(await readOutbox('u1')).toHaveLength(0);
  });

  it('a network error halts the drain and keeps the item at the head', async () => {
    registerHandler('completeWorkout', networkErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));

    const result = await drain('u1');
    expect(result).toEqual({ sent: 0, left: 2, failed: 0, deadLettered: [] });
    expect(networkErrorHandler).toHaveBeenCalledTimes(1);
    const remaining = await readOutbox('u1');
    expect(remaining[0].attempts).toBe(1);
  });

  it('a permanent error dead-letters the item and the drain continues', async () => {
    registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));

    const result = await drain('u1');
    expect(result.sent).toBe(0);
    expect(result.left).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.deadLettered).toHaveLength(2);
    expect(await readOutbox('u1')).toHaveLength(0);
    const deadLetters = await readDeadLetters('u1');
    expect(deadLetters).toHaveLength(2);
    expect(deadLetters[0].lastError).toMatch(/row-level security/);
  });

  it('reports which items it dead-lettered in this call, not the whole dead-letter list', async () => {
    registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    const result = await drain('u1');
    expect(result.deadLettered).toHaveLength(1);
    expect(asCompleteWorkout(result.deadLettered[0].payload).activity.started_at).toBe('2026-09-19T08:00:00Z');
  });

  it('dismissing a dead letter removes only that item', async () => {
    registerHandler('completeWorkout', permanentErrorHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await drain('u1');
    const [item] = await readDeadLetters('u1');
    await dismissDeadLetter('u1', item.id);
    expect(await readDeadLetters('u1')).toHaveLength(0);
  });

  /**
   * An hour's workout is never discarded by a guess. Anything we cannot
   * confidently call non-retryable stays queued, so the safe answer is the
   * default rather than the exception.
   */
  describe('error classification defaults to retry', () => {
    async function drainRejectingWith(e: unknown) {
      const handler = jest.fn().mockRejectedValue(e);
      registerHandler('completeWorkout', handler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
      await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
      return drain('u1');
    }

    it('retries a 5xx from PostgREST instead of dead-lettering it', async () => {
      const result = await drainRejectingWith(
        Object.assign(new Error('Internal Server Error'), { status: 500, code: '57P01' }),
      );
      expect(result).toEqual({ sent: 0, left: 1, failed: 0, deadLettered: [] });
      expect(await readDeadLetters('u1')).toHaveLength(0);
      expect((await readOutbox('u1'))[0].attempts).toBe(1);
    });

    it('retries an expired refresh token instead of dead-lettering it', async () => {
      const result = await drainRejectingWith(new Error('Invalid Refresh Token: Refresh Token Not Found'));
      expect(result).toEqual({ sent: 0, left: 1, failed: 0, deadLettered: [] });
      expect(await readDeadLetters('u1')).toHaveLength(0);
    });

    it('retries an unrecognised error instead of dead-lettering it', async () => {
      const result = await drainRejectingWith(new Error('something nobody has seen before'));
      expect(result).toEqual({ sent: 0, left: 1, failed: 0, deadLettered: [] });
      expect(await readDeadLetters('u1')).toHaveLength(0);
    });

    it('still dead-letters what it can positively identify as permanent', async () => {
      const result = await drainRejectingWith(
        Object.assign(new Error('permission denied for table activities'), { status: 403, code: '42501' }),
      );
      expect(result.sent).toBe(0);
      expect(result.left).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.deadLettered).toHaveLength(1);
      expect(await readDeadLetters('u1')).toHaveLength(1);
    });
  });

  /**
   * `isPermanentError` treats 401/408/425/429 as retryable despite being in
   * the 4xx range (expired token / rate limit, both of which clear on their
   * own) and everything else 4xx as permanent. That boundary had zero direct
   * coverage before this — the tests above exercise message/code-based
   * classification but never a bare status code.
   */
  describe('retryable vs permanent status boundary', () => {
    async function drainRejectingWithStatus(status: number) {
      const handler = jest.fn().mockRejectedValue(new SupabaseWriteError('x', { status }));
      registerHandler('completeWorkout', handler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);
      await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
      return drain('u1');
    }

    it.each([401, 408, 425, 429])('treats a %i as retryable, not permanent', async (status) => {
      const result = await drainRejectingWithStatus(status);
      expect(result.deadLettered).toHaveLength(0);
      expect(result.left).toBe(1);
      expect(await readDeadLetters('u1')).toHaveLength(0);
    });

    it.each([400, 403, 404, 422])('treats a %i as permanent', async (status) => {
      const result = await drainRejectingWithStatus(status);
      expect(result.left).toBe(0);
      expect(result.deadLettered).toHaveLength(1);
      expect(await readDeadLetters('u1')).toHaveLength(1);
    });
  });

  it('does not lose an item enqueued while a drain is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowHandler = jest.fn().mockImplementation(() => gate);
    registerHandler('completeWorkout', slowHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);

    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    const draining = drain('u1');
    // The handler having been entered is the proof the drain has taken its
    // snapshot, so the enqueue below is unambiguously mid-flight.
    while (slowHandler.mock.calls.length === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // The user finishes a second workout mid-drain. `enqueue` appends it to
    // disk; the drain must not write its pre-drain snapshot over the top.
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));

    release();
    const result = await draining;

    expect(result.sent).toBe(1);
    const remaining = await readOutbox('u1');
    expect(remaining).toHaveLength(1);
    expect(asCompleteWorkout(remaining[0].payload).activity.started_at).toBe('2026-09-19T18:00:00Z');
    expect(result.left).toBe(1);
  });

  it('serialises enqueue against a concurrent drain so neither can lose a write', async () => {
    const releases: Array<() => void> = [];
    registerHandler('completeWorkout', (() => new Promise<void>((resolve) => releases.push(resolve))) as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);

    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    const drainPromise = drain('u1');

    // Fire several concurrent enqueues while the drain's handler is still pending.
    await Promise.all([
      enqueue('u1', 'completeWorkout', payload('2026-09-19T09:00:00Z')),
      enqueue('u1', 'completeWorkout', payload('2026-09-19T10:00:00Z')),
      enqueue('u1', 'completeWorkout', payload('2026-09-19T11:00:00Z')),
    ]);

    // The three enqueues above need more AsyncStorage round-trips than the
    // drain needs to reach its first handler, so the handler is pending by
    // now. Assert that rather than assume it: if the timing ever shifts,
    // `releases` is empty, the drain never unblocks, and this would otherwise
    // hang until Jest's 30s timeout instead of failing with a clear message.
    expect(releases).toHaveLength(1);

    releases.forEach((r) => r());
    await drainPromise;

    const remaining = await readOutbox('u1');
    const startedAts = remaining.map((i) => asCompleteWorkout(i.payload).activity.started_at).sort();
    expect(startedAts).toEqual(['2026-09-19T09:00:00Z', '2026-09-19T10:00:00Z', '2026-09-19T11:00:00Z']);
  });

  it('is isolated per user', async () => {
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    expect(await readOutbox('u2')).toHaveLength(0);
  });

  it('dedupes a double-tapped Finish: the same workout enqueued twice is one item', async () => {
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));

    const items = await readOutbox('u1');
    expect(items).toHaveLength(1);
    expect(asCompleteWorkout(items[0].payload).activity.started_at).toBe('2026-09-19T08:00:00Z');

    // A genuinely different workout still queues.
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T18:00:00Z'));
    expect(await readOutbox('u1')).toHaveLength(2);
  });

  it('keeps a re-tapped Finish queued even when the drain that sent it is still in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowHandler = jest.fn().mockImplementation(() => gate);
    registerHandler('completeWorkout', slowHandler as unknown as (p: MutationPayloadMap['completeWorkout']) => Promise<void>);

    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    const draining = drain('u1');
    while (slowHandler.mock.calls.length === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // Same workout, re-submitted mid-drain. It must not create a second item,
    // and it must not be swept away by the drain removing the id it replaced.
    await enqueue('u1', 'completeWorkout', payload('2026-09-19T08:00:00Z'));
    release();
    await draining;

    const remaining = await readOutbox('u1');
    expect(remaining).toHaveLength(1);
    expect(asCompleteWorkout(remaining[0].payload).activity.started_at).toBe('2026-09-19T08:00:00Z');
  });

  it('keeps an item whose kind has no registered handler, rather than dropping it', async () => {
    await AsyncStorage.setItem('virra:outbox:v1:u1', JSON.stringify([
      { id: 'ob_unknown', kind: 'notAKindYet', payload: {}, createdAt: '2026-09-19T09:00:00Z', attempts: 0 },
    ]));

    const result = await drain('u1');
    expect(result).toEqual({ sent: 0, left: 1, failed: 0, deadLettered: [] });
    const remaining = await readOutbox('u1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('ob_unknown');
    expect(await readDeadLetters('u1')).toHaveLength(0);
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
