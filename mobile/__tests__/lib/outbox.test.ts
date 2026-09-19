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
