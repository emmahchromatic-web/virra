import { syncPending } from '@/lib/syncPending';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useSessionStore } from '@/store/sessionStore';
import { useRecipesStore } from '@/store/recipes';
import * as outbox from '@/lib/outbox';

jest.mock('@/lib/outbox');
// `store/recipes.ts` pulls in `@/lib/recipes`'s real network calls; nothing
// here exercises them (only `setState`/`getState().revertLocalToggle` are
// used), but mocking keeps this file from ever making a real Supabase call.
jest.mock('@/lib/recipes', () => ({
  fetchRecipes:      jest.fn(),
  fetchRecipeDetail: jest.fn(),
  fetchFavouriteIds: jest.fn(),
}));

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

function emptySessionStore() {
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
  });
}

function seedFavourites(ids: string[]) {
  useRecipesStore.setState({ favouriteIds: ids });
}

beforeEach(() => {
  jest.clearAllMocks();
  // `clearAllMocks` clears call history but NOT installed implementations, and
  // several tests below install `mockResolvedValue` (not `...Once`). Reset the
  // three outbox mocks to an explicit, known-empty default so no test's
  // behaviour depends on which test ran before it.
  mockedOutbox.readOutbox.mockReset();
  mockedOutbox.readOutbox.mockResolvedValue([]);
  mockedOutbox.readDeadLetters.mockReset();
  mockedOutbox.readDeadLetters.mockResolvedValue([]);
  mockedOutbox.drain.mockReset();
  mockedOutbox.drain.mockResolvedValue({ sent: 0, left: 0, failed: 0, deadLettered: [] });

  emptySessionStore();
  seedFavourites([]);
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
    // This patches the LIVE store object. `jest.clearAllMocks()` in beforeEach
    // clears call history but leaves the patch installed, and there is no
    // `restoreMocks: true` in jest.config.js -- so without this restore the
    // spy would silently stub `refresh` for every later test in the file.
    const refreshSpy = jest.spyOn(useSessionStore.getState(), 'refresh').mockResolvedValue(undefined);
    try {
      await syncPending('u1');
      expect(refreshSpy).toHaveBeenCalledWith('2026-09-01', '2026-09-01');
      expect(refreshSpy).not.toHaveBeenCalledWith('2026-09-19', '2026-09-19');
    } finally {
      refreshSpy.mockRestore();
    }
  });

  /**
   * The self-healing half of dead-letter reconciliation.
   *
   * `drain()` writes a dead letter to disk inside its locked tail and only
   * then returns it, so a process death in that window leaves the dead letter
   * persisted, the `local_`-prefixed session row persisted, and -- before this
   * -- nothing that would ever reconcile them, because the only revert loop
   * read `result.deadLettered` from a drain that had already happened. This
   * test never calls `drain()` at all: the dead letter is pre-seeded as if a
   * PRIOR process had written it, and the outbox is empty so `syncPending`
   * takes its early return.
   */
  it('reverts a phantom local completion from a dead letter already on disk, with no drain this call', async () => {
    seedSession('s1', '2026-09-19');
    const payload = {
      kind: 'strength', queuedAt: '', sessionId: 's1',
      activity: { started_at: '2026-09-19T08:00:00Z' }, setRows: [], details: null,
    } as never;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(useSessionStore.getState().byId['s1'].activity_id).toBeNull();
  });

  it('reconciles on-disk dead letters even while offline, when no drain is possible at all', async () => {
    seedSession('s1', '2026-09-19');
    useNetworkStore.setState({ isOnline: false });
    const payload = {
      kind: 'strength', queuedAt: '', sessionId: 's1',
      activity: { started_at: '2026-09-19T08:00:00Z' }, setRows: [], details: null,
    } as never;
    mockedOutbox.readOutbox.mockResolvedValue([
      { id: 'b', kind: 'completeWorkout', payload, createdAt: '', attempts: 0 },
    ]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });

  it('leaves a server-confirmed completion alone when replaying an old dead letter', async () => {
    // Same session id, but the server has since confirmed it: `activity_id` is
    // a real id, not a `local_` placeholder. Re-running reconciliation over
    // the whole dead-letter list on every launch must never undo this.
    useSessionStore.setState({
      byId: { s1: {
        id: 's1', scheduled_date: '2026-09-19', modality: 'run', session_label: null,
        status: 'completed', block_id: null, activity_id: 'real-server-id', moved_to_id: null,
        week_number: 0, day_of_week: 0,
      } },
      idsByDate: { '2026-09-19': ['s1'] },
      loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
    });
    const payload = {
      kind: 'strength', queuedAt: '', sessionId: 's1',
      activity: { started_at: '2026-09-19T08:00:00Z' }, setRows: [], details: null,
    } as never;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'completeWorkout', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('completed');
    expect(useSessionStore.getState().byId['s1'].activity_id).toBe('real-server-id');
  });

  it('never throws, even if readOutbox itself rejects', async () => {
    mockedOutbox.readOutbox.mockRejectedValue(new Error('boom'));
    await expect(syncPending('u1')).resolves.toBeUndefined();
    expect(useOutboxStatus.getState().syncing).toBe(false);
  });

  /**
   * `toggleFavourite` dead-letter reconciliation -- the exact same shape as
   * the `completeWorkout` tests above, extended to a second kind for the
   * first time.
   */
  it('reverts the local optimistic favourite for a recipe whose item just dead-lettered', async () => {
    seedFavourites(['r1']);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' }]);
    mockedOutbox.drain.mockResolvedValue({
      sent: 0, left: 0, failed: 1,
      deadLettered: [{ id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' }],
    });

    await syncPending('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });

  it('reverts a phantom local favourite from a dead letter already on disk, with no drain this call', async () => {
    seedFavourites(['r1']);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });

  it('leaves a since-changed favourite state alone when replaying an old dead letter', async () => {
    // Same recipe id, but a later successful toggle already moved it back to
    // unfavourited by the time this stale dead letter (desiredState: true) is
    // replayed. Re-running reconciliation over the whole dead-letter list on
    // every launch must never undo that newer, correct state.
    seedFavourites([]);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });

  it('reverts an "off" toggle dead letter back to favourited', async () => {
    seedFavourites([]);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: false } as const;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });
});
