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
    loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null, pendingOps: {},
  });
}

function emptySessionStore() {
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
    pendingOps: {},
  });
}

function seedFavourites(ids: string[]) {
  useRecipesStore.setState({ favouriteIds: ids });
}

function seedPendingDrop(id: string, scheduledDate: string) {
  useSessionStore.setState({
    byId: { [id]: {
      id, scheduled_date: scheduledDate, modality: 'run', session_label: null,
      status: 'dropped', block_id: null, activity_id: null, moved_to_id: null,
      week_number: 0, day_of_week: 0,
    } },
    idsByDate: { [scheduledDate]: [id] },
    loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
    pendingOps: { [id]: { op: 'drop' } },
  });
}

const MOVE_PAYLOAD = {
  sessionId: 's1', newSessionId: 'new-1', newDate: '2026-09-26', userId: 'u1',
  blockId: null, weekNumber: 0, dayOfWeek: 5, modality: 'run', sessionLabel: null,
  runStructure: null, strengthStructure: null,
} as const;

function seedPendingMove(id: string, scheduledDate: string, newDate: string) {
  const base = {
    modality: 'run' as const, session_label: null, block_id: null, activity_id: null,
    week_number: 0, day_of_week: 0,
  };
  useSessionStore.setState({
    byId: {
      [id]:  { ...base, id, scheduled_date: scheduledDate, status: 'moved', moved_to_id: 'new-1' },
      'new-1': { ...base, id: 'new-1', scheduled_date: newDate, status: 'planned', moved_to_id: null },
    },
    idsByDate: { [scheduledDate]: [id], [newDate]: ['new-1'] },
    loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null,
    pendingOps: { [id]: { op: 'move', newSessionId: 'new-1' } },
  });
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
  mockedOutbox.markDeadLettersReconciled.mockReset();
  mockedOutbox.markDeadLettersReconciled.mockResolvedValue(undefined);

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

  /**
   * The reason `reconciledAt` exists.
   *
   * `completeWorkout`'s revert is self-limiting -- it only touches a row still
   * carrying a one-way `local_` placeholder id, which disappears for good the
   * moment the server confirms. A favourite has no such marker: it is a plain
   * boolean that can legitimately come back round to the SAME value later. So
   * the "still matches desiredState" guard, on its own, cannot tell a stale
   * dead letter's leftover state apart from a fresh, genuinely-successful
   * re-toggle of the same recipe -- and the full-list sweep would keep undoing
   * the latter on every single launch until the user found Dismiss.
   */
  it('marks a reverted favourite dead letter reconciled, and never reverts it again once state legitimately returns', async () => {
    seedFavourites(['r1']);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    const deadLetter = { id: 'a', kind: 'toggleFavourite' as const, payload, createdAt: '', attempts: 1, lastError: 'x' };
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([deadLetter]);

    // Launch 1: the stale dead letter is reverted, exactly as before.
    await syncPending('u1');
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
    expect(mockedOutbox.markDeadLettersReconciled).toHaveBeenCalledWith('u1', ['a']);

    // The user then genuinely re-favourites r1, and that write succeeds, so
    // `favouriteIds` matches the stale item's `desiredState` once more. The
    // dead letter is still on disk (only Dismiss removes it) -- but it now
    // carries the reconciled marker the sweep above wrote.
    seedFavourites(['r1']);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { ...deadLetter, reconciledAt: '2026-09-19T10:00:00.000Z' },
    ]);

    await syncPending('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });

  it('does not mark an item reconciled when the revert was a no-op, so a pre-hydration sweep still self-heals next launch', async () => {
    // `favouriteIds` does not (yet) reflect `desiredState` -- either the store
    // has not rehydrated, or a later toggle already moved it on. Either way
    // nothing was undone, so nothing may be marked done.
    seedFavourites([]);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.markDeadLettersReconciled).not.toHaveBeenCalled();
  });

  it('marks a reverted completion reconciled too, so a stale letter cannot undo a LATER offline completion of the same session', async () => {
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

    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(mockedOutbox.markDeadLettersReconciled).toHaveBeenCalledWith('u1', ['a']);
  });

  /**
   * `dropSession` dead-letter reconciliation -- the same shape as the
   * `completeWorkout`/`toggleFavourite` tests above, extended to a third
   * kind.
   */
  it('reverts the local optimistic drop for a session whose item just dead-lettered', async () => {
    seedPendingDrop('s1', '2026-09-19');
    const payload = { sessionId: 's1' };
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 1, lastError: 'x' }]);
    mockedOutbox.drain.mockResolvedValue({
      sent: 0, left: 0, failed: 1,
      deadLettered: [{ id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 1, lastError: 'x' }],
    });

    await syncPending('u1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(useSessionStore.getState().pendingOps['s1']).toBeUndefined();
  });

  it('reverts a phantom local drop from a dead letter already on disk, with no drain this call', async () => {
    seedPendingDrop('s1', '2026-09-19');
    const payload = { sessionId: 's1' };
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });

  it('leaves a since-confirmed drop alone when replaying an old dead letter', async () => {
    // Same session id, but the server has since confirmed the drop and
    // `refresh()` already cleared its `pendingOps` marker (see
    // sessionStore.refresh's preserve-rule test). Re-running reconciliation
    // over the whole dead-letter list on every launch must never undo this.
    useSessionStore.setState({
      byId: { s1: {
        id: 's1', scheduled_date: '2026-09-19', modality: 'run', session_label: null,
        status: 'dropped', block_id: null, activity_id: null, moved_to_id: null,
        week_number: 0, day_of_week: 0,
      } },
      idsByDate: { '2026-09-19': ['s1'] },
      loadedRanges: [], fetching: new Set(), hasHydrated: true, lastError: null, pendingOps: {},
    });
    const payload = { sessionId: 's1' };
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
  });

  it('marks a reverted drop dead letter reconciled, and never reverts it again once a later drop legitimately lands', async () => {
    seedPendingDrop('s1', '2026-09-19');
    const payload = { sessionId: 's1' };
    const deadLetter = { id: 'a', kind: 'dropSession' as const, payload, createdAt: '', attempts: 1, lastError: 'x' };
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([deadLetter]);

    // Launch 1: the stale dead letter is reverted, exactly as before.
    await syncPending('u1');
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(mockedOutbox.markDeadLettersReconciled).toHaveBeenCalledWith('u1', ['a']);

    // A later, genuinely successful re-drop of s1 lands, so pendingOps/status
    // match the stale item's shape once more. The dead letter is still on
    // disk (only Dismiss removes it) -- but it now carries the reconciled
    // marker the sweep above wrote.
    seedPendingDrop('s1', '2026-09-19');
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { ...deadLetter, reconciledAt: '2026-09-19T10:00:00.000Z' },
    ]);

    await syncPending('u1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
    expect(useSessionStore.getState().pendingOps['s1']).toEqual({ op: 'drop' });
  });

  it('does not mark a dropSession dead letter reconciled when the revert was a no-op', async () => {
    // No pending drop for s1 -- either the store has not rehydrated, or a
    // later mutation already moved it on. Either way nothing was undone, so
    // nothing may be marked done.
    emptySessionStore();
    const payload = { sessionId: 's1' };
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'dropSession', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.markDeadLettersReconciled).not.toHaveBeenCalled();
  });

  /**
   * `moveSession` dead-letter reconciliation -- the fourth kind, and the only
   * one whose revert touches TWO rows.
   */
  it('reverts both halves of the local optimistic move for an item that just dead-lettered', async () => {
    seedPendingMove('s1', '2026-09-19', '2026-09-26');
    const deadLetter = { id: 'a', kind: 'moveSession' as const, payload: MOVE_PAYLOAD, createdAt: '', attempts: 1, lastError: 'x' };
    mockedOutbox.readOutbox.mockResolvedValue([{ id: 'a', kind: 'moveSession', payload: MOVE_PAYLOAD, createdAt: '', attempts: 0 }]);
    mockedOutbox.readDeadLetters
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([deadLetter]);
    mockedOutbox.drain.mockResolvedValue({ sent: 0, left: 0, failed: 1, deadLettered: [deadLetter] });

    await syncPending('u1');

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['s1'].moved_to_id).toBeNull();
    expect(s.byId['new-1']).toBeUndefined();
    expect(s.idsByDate['2026-09-26']).toBeUndefined();
    expect(s.pendingOps['s1']).toBeUndefined();
  });

  it('reverts a phantom local move from a dead letter already on disk, with no drain this call', async () => {
    seedPendingMove('s1', '2026-09-19', '2026-09-26');
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'moveSession', payload: MOVE_PAYLOAD, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.drain).not.toHaveBeenCalled();
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(mockedOutbox.markDeadLettersReconciled).toHaveBeenCalledWith('u1', ['a']);
  });

  it('leaves a since-confirmed move alone when replaying an old dead letter', async () => {
    // The server confirmed the move and `refresh()` cleared the marker.
    // Re-running reconciliation over the whole list every launch must never
    // undo that.
    seedPendingMove('s1', '2026-09-19', '2026-09-26');
    useSessionStore.setState({ pendingOps: {} });
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'moveSession', payload: MOVE_PAYLOAD, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('moved');
    expect(useSessionStore.getState().byId['new-1']).toBeDefined();
  });

  it('does not mark a moveSession dead letter reconciled when the revert was a no-op', async () => {
    emptySessionStore();
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'moveSession', payload: MOVE_PAYLOAD, createdAt: '', attempts: 1, lastError: 'x' },
    ]);

    await syncPending('u1');

    expect(mockedOutbox.markDeadLettersReconciled).not.toHaveBeenCalled();
  });

  it('a persistence failure while marking reconciled never breaks the sync', async () => {
    seedFavourites(['r1']);
    const payload = { userId: 'u1', recipeId: 'r1', desiredState: true } as const;
    mockedOutbox.readOutbox.mockResolvedValue([]);
    mockedOutbox.readDeadLetters.mockResolvedValue([
      { id: 'a', kind: 'toggleFavourite', payload, createdAt: '', attempts: 1, lastError: 'x' },
    ]);
    mockedOutbox.markDeadLettersReconciled.mockRejectedValue(new Error('disk full'));

    await expect(syncPending('u1')).resolves.toBeUndefined();
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });
});
