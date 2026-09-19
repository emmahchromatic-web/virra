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
    const payload = {
      kind: 'strength', queuedAt: '', sessionId: 's1',
      activity: { started_at: '2026-09-19T08:00:00Z' }, setRows: [], details: null,
    } as never;
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' }]);
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
    const payload = {
      kind: 'run', queuedAt: '', sessionId: 's1',
      activity: { started_at: '2026-09-19T08:00:00Z' }, runDetails: {},
    } as never;
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
