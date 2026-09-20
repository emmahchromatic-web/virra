import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCommitLink = jest.fn().mockResolvedValue(undefined);
const mockLinkActivityToSession = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: (sid: string, aid: string) => mockCommitLink(sid, aid),
  linkActivityToSession: (aid: string, sid: string) => mockLinkActivityToSession(aid, sid),
}));

// `sessionStore.moveSession` generates the replacement row's id itself, up
// front, via `uuid.v4()`. The real `expo-modules-core` reads
// `globalThis.expo.uuidv4` at call time and THROWS when it is absent (which it
// is under jest), so it has to be mocked -- and a fixed return makes the "no
// temp id ever appears" assertions below checkable.
jest.mock('expo-modules-core', () => ({ uuid: { v4: jest.fn(() => 'new-session-id') } }));

// drop/moveSession now write directly against `planned_sessions` (no more
// scheduleGenerator indirection) and, on a transient failure, route through
// `enqueue`/`syncPending` -- mocked below, kept apart from the real
// `isPermanentError` classifier (pulled in via `requireActual`) so these
// tests exercise the real permanent-vs-transient decision, not a stub of it.
const mockPlannedUpdate = jest.fn();
const mockUpdateEq      = jest.fn();
const mockPlannedUpsert = jest.fn();

jest.mock('@/lib/supabase', () => {
  const empty: any = {
    select: () => empty, eq: () => empty, gte: () => empty, lte: () => empty,
    in: () => empty, is: () => empty, neq: () => empty,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    supabase: {
      from: (table: string) => ({
        ...empty,
        update: (patch: unknown) => {
          mockPlannedUpdate(table, patch);
          return { eq: (col: string, val: string) => mockUpdateEq(col, val) };
        },
        upsert: (row: unknown, opts: unknown) => mockPlannedUpsert(table, row, opts),
      }),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

const mockEnqueue     = jest.fn();
const mockSyncPending = jest.fn();

jest.mock('@/lib/outbox', () => ({
  ...jest.requireActual('@/lib/outbox'),
  enqueue: (...a: unknown[]) => mockEnqueue(...a),
}));
jest.mock('@/lib/syncPending', () => ({ syncPending: (...a: unknown[]) => mockSyncPending(...a) }));

import { useSessionStore } from '@/store/sessionStore';

function seed() {
  useSessionStore.setState({
    byId: {
      s1: { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy',
            status: 'planned', block_id: 'b1', activity_id: null, moved_to_id: null,
            week_number: 3, day_of_week: 0,
            run_structure: { version: 1, workout_type: 'easy', steps: [] }, strength_structure: null },
    },
    idsByDate: { '2026-05-25': ['s1'] },
    loadedRanges: [{ from: '2026-05-25', to: '2026-05-25', fetchedAt: Date.now() }],
    fetching: new Set(),
    hasHydrated: true,
    lastError: null,
    pendingOps: {},
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCommitLink.mockClear().mockResolvedValue(undefined);
  mockLinkActivityToSession.mockClear().mockResolvedValue(undefined);
  mockPlannedUpdate.mockClear();
  mockUpdateEq.mockClear().mockResolvedValue({ error: null, status: 200 });
  mockPlannedUpsert.mockClear().mockResolvedValue({ error: null, status: 201 });
  mockEnqueue.mockClear().mockResolvedValue({ id: 'ob_1', kind: 'dropSession', payload: {}, createdAt: '', attempts: 0 });
  mockSyncPending.mockClear();
  seed();
});

describe('sessionStore.markComplete', () => {
  it('flips status to completed and sets activity_id optimistically', async () => {
    await useSessionStore.getState().markComplete('s1', 'a1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('a1');
    expect(mockCommitLink).toHaveBeenCalledWith('s1', 'a1');
  });

  it('reverts on DB failure and sets lastError', async () => {
    mockCommitLink.mockRejectedValueOnce(new Error('network'));
    await expect(useSessionStore.getState().markComplete('s1', 'a1')).rejects.toThrow('network');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('planned');
    expect(row.activity_id).toBeNull();
    expect(useSessionStore.getState().lastError?.op).toBe('markComplete');
  });

  it('is a no-op if the session is not in the cache', async () => {
    await useSessionStore.getState().markComplete('absent', 'a1');
    expect(mockCommitLink).not.toHaveBeenCalled();
  });
});

describe('sessionStore.dropSession', () => {
  it('flips status to dropped optimistically and clears pendingOps on a successful direct write', async () => {
    await useSessionStore.getState().dropSession('u1', 's1');

    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
    expect(useSessionStore.getState().pendingOps['s1']).toBeUndefined();
    expect(mockPlannedUpdate).toHaveBeenCalledWith('planned_sessions', { status: 'dropped' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('throws without touching state or attempting a write when userId is missing', async () => {
    await expect(useSessionStore.getState().dropSession('', 's1')).rejects.toThrow('dropSession: no user id');

    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(mockPlannedUpdate).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('is a no-op if the session is not in the cache', async () => {
    await useSessionStore.getState().dropSession('u1', 'absent');
    expect(mockPlannedUpdate).not.toHaveBeenCalled();
  });

  /**
   * The J3a Task 5 fix shape, applied to drop: a merely transient failure
   * (offline, a server blip) keeps the optimistic UI and queues the write --
   * it must never revert or throw, unlike the pre-fix behaviour this test
   * replaces.
   */
  it('keeps the optimistic drop and records a pending op on a transient failure, without throwing', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: { message: 'server blip' }, status: 500 });

    await expect(useSessionStore.getState().dropSession('u1', 's1')).resolves.toBeUndefined();

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('dropped');
    expect(s.pendingOps['s1']).toEqual({ op: 'drop' });
    expect(mockEnqueue).toHaveBeenCalledWith('u1', 'dropSession', { sessionId: 's1' });
    expect(mockSyncPending).toHaveBeenCalledWith('u1');
  });

  /**
   * The one exception this plan carves out of "never revert on a mere
   * enqueue": a DETERMINISTIC failure (RLS violation, etc.) can never
   * succeed on replay, so it reverts immediately and surfaces the existing
   * friendly error instead of queueing something doomed to dead-letter
   * later. No realistic user path hits this for a drop today, but every
   * write in this plan classifies before enqueueing, for consistency.
   */
  it('reverts immediately and throws the friendly error on a permanent failure, without enqueueing', async () => {
    mockUpdateEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table planned_sessions', code: '42501' }, status: 403,
    });

    await expect(useSessionStore.getState().dropSession('u1', 's1'))
      .rejects.toThrow('permission denied for table planned_sessions');

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.pendingOps['s1']).toBeUndefined();
    expect(s.lastError?.op).toBe('dropSession');
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockSyncPending).not.toHaveBeenCalled();
  });
});

describe('sessionStore.revertLocalDrop', () => {
  function seedPendingDrop() {
    useSessionStore.setState({
      byId: { ...useSessionStore.getState().byId, s1: { ...useSessionStore.getState().byId['s1'], status: 'dropped' } },
      pendingOps: { s1: { op: 'drop' } },
    });
  }

  it('reverts a pending drop back to planned and clears the pendingOps marker', () => {
    seedPendingDrop();

    const reverted = useSessionStore.getState().revertLocalDrop('s1');

    expect(reverted).toBe(true);
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(useSessionStore.getState().pendingOps['s1']).toBeUndefined();
  });

  it('returns false and does nothing when there is no pending drop for that session', () => {
    const reverted = useSessionStore.getState().revertLocalDrop('s1');

    expect(reverted).toBe(false);
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });

  it('returns false for a pendingOps entry that is a move, not a drop', () => {
    useSessionStore.setState({
      byId: { ...useSessionStore.getState().byId, s1: { ...useSessionStore.getState().byId['s1'], status: 'moved' } },
      pendingOps: { s1: { op: 'move', newSessionId: 's1_new' } },
    });

    const reverted = useSessionStore.getState().revertLocalDrop('s1');

    expect(reverted).toBe(false);
    expect(useSessionStore.getState().byId['s1'].status).toBe('moved');
  });

  it('is a no-op for a session not in the cache', () => {
    expect(useSessionStore.getState().revertLocalDrop('does-not-exist')).toBe(false);
  });

  it('is idempotent -- calling it twice for the same dead letter does nothing the second time', () => {
    seedPendingDrop();

    expect(useSessionStore.getState().revertLocalDrop('s1')).toBe(true);
    expect(useSessionStore.getState().revertLocalDrop('s1')).toBe(false);
  });
});

describe('sessionStore.moveSession', () => {
  /**
   * The replacement row's id is client-generated and FINAL from the moment
   * the move is made. The pre-outbox version inserted a `temp_…` row and
   * swapped it for the server's id afterwards -- which cannot work when the
   * write only reaches the outbox, and is exactly the behaviour change this
   * asserts is gone.
   */
  it('creates the replacement row directly with its final id -- no temp id at any point', async () => {
    const newId = await useSessionStore.getState().moveSession('u1', 's1', '2026-05-26');

    const s = useSessionStore.getState();
    expect(newId).toBe('new-session-id');
    expect(s.byId['s1'].status).toBe('moved');
    expect(s.byId['s1'].moved_to_id).toBe('new-session-id');
    expect(s.byId['new-session-id']).toMatchObject({
      id: 'new-session-id', scheduled_date: '2026-05-26', modality: 'run',
      status: 'planned', activity_id: null, moved_to_id: null,
      day_of_week: 1,   // 2026-05-26 is a Tuesday
    });
    expect(s.idsByDate['2026-05-26']).toEqual(['new-session-id']);
    expect(Object.keys(s.byId).some((id) => id.startsWith('temp_'))).toBe(false);
    expect(Object.values(s.idsByDate).flat().some((id) => id.startsWith('temp_'))).toBe(false);
  });

  it('upserts the replacement row from the cache (no SELECT), then marks the original moved, and clears pendingOps', async () => {
    await useSessionStore.getState().moveSession('u1', 's1', '2026-05-26');

    expect(mockPlannedUpsert).toHaveBeenCalledWith('planned_sessions', {
      id:                 'new-session-id',
      user_id:            'u1',
      block_id:           'b1',
      scheduled_date:     '2026-05-26',
      week_number:        3,
      day_of_week:        1,
      modality:           'run',
      session_label:      'Easy',
      status:             'planned',
      run_structure:      { version: 1, workout_type: 'easy', steps: [] },
      strength_structure: null,
    }, { onConflict: 'id' });
    expect(mockPlannedUpdate).toHaveBeenCalledWith('planned_sessions', { status: 'moved', moved_to_id: 'new-session-id' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1');
    expect(useSessionStore.getState().pendingOps['s1']).toBeUndefined();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('throws without touching state or attempting a write when userId is missing', async () => {
    await expect(useSessionStore.getState().moveSession('', 's1', '2026-05-26'))
      .rejects.toThrow('moveSession: no user id');

    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(mockPlannedUpsert).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('throws for a session not in the cache', async () => {
    await expect(useSessionStore.getState().moveSession('u1', 'absent', '2026-05-26'))
      .rejects.toThrow('moveSession: session absent not in cache');
    expect(mockPlannedUpsert).not.toHaveBeenCalled();
  });

  it('keeps the optimistic move and records a pending op on a transient upsert failure, without throwing', async () => {
    mockPlannedUpsert.mockResolvedValueOnce({ error: { message: 'server blip' }, status: 500 });

    const newId = await useSessionStore.getState().moveSession('u1', 's1', '2026-05-26');

    const s = useSessionStore.getState();
    expect(newId).toBe('new-session-id');
    expect(s.byId['s1'].status).toBe('moved');
    expect(s.byId['s1'].moved_to_id).toBe('new-session-id');
    expect(s.byId['new-session-id']).toBeDefined();
    expect(s.idsByDate['2026-05-26']).toEqual(['new-session-id']);
    expect(s.pendingOps['s1']).toEqual({ op: 'move', newSessionId: 'new-session-id' });
    expect(mockEnqueue).toHaveBeenCalledWith('u1', 'moveSession', {
      sessionId: 's1', newSessionId: 'new-session-id', newDate: '2026-05-26', userId: 'u1',
      blockId: 'b1', weekNumber: 3, dayOfWeek: 1, modality: 'run', sessionLabel: 'Easy',
      runStructure: { version: 1, workout_type: 'easy', steps: [] }, strengthStructure: null,
    });
    expect(mockSyncPending).toHaveBeenCalledWith('u1');
  });

  it('queues the whole move when only the second (mark-moved) step fails transiently', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: { message: 'server blip' }, status: 500 });

    await expect(useSessionStore.getState().moveSession('u1', 's1', '2026-05-26'))
      .resolves.toBe('new-session-id');

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('moved');
    expect(s.pendingOps['s1']).toEqual({ op: 'move', newSessionId: 'new-session-id' });
    // The replay re-upserts the (already-written) replacement row -- harmless,
    // because it is an upsert on the same id -- and retries the update.
    expect(mockEnqueue).toHaveBeenCalledWith('u1', 'moveSession', expect.objectContaining({
      sessionId: 's1', newSessionId: 'new-session-id',
    }));
  });

  /**
   * The case that makes classify-before-enqueue load-bearing for MOVE (unlike
   * drop, where no realistic path hits it): two identical sessions cannot
   * share a day, `planned_sessions_no_clash_idx` says so with a 23505, and
   * that is deterministic -- queueing it would show the move as done and then
   * snap it back minutes later behind a generic dead-letter message.
   */
  it('reverts immediately and re-throws the clash message on a 23505, without enqueueing', async () => {
    mockPlannedUpsert.mockResolvedValueOnce({
      error: { message: 'duplicate key value violates unique constraint "planned_sessions_no_clash_idx"', code: '23505' },
      status: 409,
    });

    await expect(useSessionStore.getState().moveSession('u1', 's1', '2026-05-26'))
      .rejects.toThrow("That day already has a run session (Easy). Two identical sessions can't share a day. Move the existing one first.");

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['s1'].moved_to_id).toBeNull();
    expect(s.byId['new-session-id']).toBeUndefined();
    expect(s.idsByDate['2026-05-26']).toBeUndefined();
    expect(s.pendingOps['s1']).toBeUndefined();
    expect(s.lastError?.op).toBe('moveSession');
    expect(mockPlannedUpdate).not.toHaveBeenCalled();   // no half-applied move
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockSyncPending).not.toHaveBeenCalled();
  });

  it('reverts and throws the raw message on a non-clash permanent upsert failure', async () => {
    mockPlannedUpsert.mockResolvedValueOnce({
      error: { message: 'permission denied for table planned_sessions', code: '42501' }, status: 403,
    });

    await expect(useSessionStore.getState().moveSession('u1', 's1', '2026-05-26'))
      .rejects.toThrow('permission denied for table planned_sessions');

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['new-session-id']).toBeUndefined();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('reverts and throws when the second (mark-moved) step fails permanently', async () => {
    mockUpdateEq.mockResolvedValueOnce({
      error: { message: 'permission denied for table planned_sessions', code: '42501' }, status: 403,
    });

    await expect(useSessionStore.getState().moveSession('u1', 's1', '2026-05-26'))
      .rejects.toThrow('permission denied for table planned_sessions');

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['new-session-id']).toBeUndefined();
    expect(s.pendingOps['s1']).toBeUndefined();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('sessionStore.revertLocalMove', () => {
  async function seedPendingMove() {
    mockPlannedUpsert.mockResolvedValueOnce({ error: { message: 'offline' }, status: 500 });
    await useSessionStore.getState().moveSession('u1', 's1', '2026-05-26');
  }

  it('undoes both halves: removes the replacement row and restores the original', async () => {
    await seedPendingMove();

    expect(useSessionStore.getState().revertLocalMove('s1')).toBe(true);

    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['s1'].moved_to_id).toBeNull();
    expect(s.byId['new-session-id']).toBeUndefined();
    expect(s.idsByDate['2026-05-26']).toBeUndefined();
    expect(s.idsByDate['2026-05-25']).toEqual(['s1']);
    expect(s.pendingOps['s1']).toBeUndefined();
  });

  it('leaves other sessions already sitting on the target date alone', async () => {
    useSessionStore.setState({
      byId: {
        ...useSessionStore.getState().byId,
        s2: { id: 's2', scheduled_date: '2026-05-26', modality: 'strength', session_label: 'Lower',
              status: 'planned', block_id: 'b1', activity_id: null, moved_to_id: null,
              week_number: 3, day_of_week: 1 },
      },
      idsByDate: { ...useSessionStore.getState().idsByDate, '2026-05-26': ['s2'] },
    });
    await seedPendingMove();

    useSessionStore.getState().revertLocalMove('s1');

    expect(useSessionStore.getState().idsByDate['2026-05-26']).toEqual(['s2']);
  });

  /**
   * The leak this guards: a drop queued against the not-yet-confirmed
   * replacement row keys `pendingOps` by an id that is about to stop
   * existing. Left behind, nothing would ever clear it and `refresh()` would
   * keep preserving a ghost.
   */
  it('also clears a pendingOps entry keyed by the replacement row', async () => {
    await seedPendingMove();
    useSessionStore.setState({
      pendingOps: { ...useSessionStore.getState().pendingOps, 'new-session-id': { op: 'drop' } },
    });

    useSessionStore.getState().revertLocalMove('s1');

    expect(useSessionStore.getState().pendingOps).toEqual({});
  });

  it('returns false when there is no pending move for that session', () => {
    expect(useSessionStore.getState().revertLocalMove('s1')).toBe(false);
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });

  it('returns false for a pendingOps entry that is a drop, not a move', () => {
    useSessionStore.setState({
      byId: { ...useSessionStore.getState().byId, s1: { ...useSessionStore.getState().byId['s1'], status: 'dropped' } },
      pendingOps: { s1: { op: 'drop' } },
    });

    expect(useSessionStore.getState().revertLocalMove('s1')).toBe(false);
    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
  });

  it('is a no-op for a session not in the cache', () => {
    expect(useSessionStore.getState().revertLocalMove('does-not-exist')).toBe(false);
  });

  it('is idempotent -- calling it twice for the same dead letter does nothing the second time', async () => {
    await seedPendingMove();

    expect(useSessionStore.getState().revertLocalMove('s1')).toBe(true);
    expect(useSessionStore.getState().revertLocalMove('s1')).toBe(false);
  });
});

describe('sessionStore.linkActivity', () => {
  it('flips status to completed and sets activity_id; commits via _commitLink', async () => {
    await useSessionStore.getState().linkActivity('a1', 's1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('a1');
    expect(mockCommitLink).toHaveBeenCalledWith('s1', 'a1');
  });

  it('reverts on DB failure and sets lastError', async () => {
    mockCommitLink.mockRejectedValueOnce(new Error('link-fail'));
    await expect(useSessionStore.getState().linkActivity('a1', 's1')).rejects.toThrow('link-fail');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('planned');
    expect(row.activity_id).toBeNull();
    expect(useSessionStore.getState().lastError?.op).toBe('linkActivity');
  });
});

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

describe('sessionStore.reconcileFromActivities', () => {
  it('returns linked: 0 with no unlinked activities (orchestration smoke test)', async () => {
    const result = await useSessionStore.getState().reconcileFromActivities();
    expect(result).toEqual({ linked: 0 });
  });
});
