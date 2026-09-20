import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCommitLink = jest.fn().mockResolvedValue(undefined);
const mockMoveSessionDb = jest.fn();
const mockLinkActivityToSession = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: (sid: string, aid: string) => mockCommitLink(sid, aid),
  moveSession: (sid: string, newDate: string) => mockMoveSessionDb(sid, newDate),
  linkActivityToSession: (aid: string, sid: string) => mockLinkActivityToSession(aid, sid),
}));

// dropSession now writes directly against `planned_sessions` (no more
// scheduleGenerator indirection) and, on a transient failure, routes through
// `enqueue`/`syncPending` -- mocked below, kept apart from the real
// `isPermanentError` classifier (pulled in via `requireActual`) so these
// tests exercise the real permanent-vs-transient decision, not a stub of it.
const mockPlannedUpdate = jest.fn();
const mockUpdateEq      = jest.fn();

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
            status: 'planned', block_id: null, activity_id: null, moved_to_id: null,
            week_number: 0, day_of_week: 0 },
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
  mockMoveSessionDb.mockClear().mockResolvedValue('s1_new');
  mockLinkActivityToSession.mockClear().mockResolvedValue(undefined);
  mockPlannedUpdate.mockClear();
  mockUpdateEq.mockClear().mockResolvedValue({ error: null, status: 200 });
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
  it('inserts a temp row at the new date, marks original moved, then swaps temp for real id', async () => {
    mockMoveSessionDb.mockResolvedValueOnce('s1_new');
    const newId = await useSessionStore.getState().moveSession('s1', '2026-05-26');
    const s = useSessionStore.getState();
    expect(newId).toBe('s1_new');
    expect(s.byId['s1'].status).toBe('moved');
    expect(s.byId['s1'].moved_to_id).toBe('s1_new');
    expect(s.byId['s1_new']).toMatchObject({ id: 's1_new', scheduled_date: '2026-05-26', modality: 'run' });
    expect(s.idsByDate['2026-05-26']).toContain('s1_new');
    expect(s.idsByDate['2026-05-25']).not.toContain('s1_new');
    expect(mockMoveSessionDb).toHaveBeenCalledWith('s1', '2026-05-26');
  });

  it('reverts both rows on DB failure', async () => {
    mockMoveSessionDb.mockRejectedValueOnce(new Error('move-fail'));
    await expect(useSessionStore.getState().moveSession('s1', '2026-05-26')).rejects.toThrow('move-fail');
    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['s1'].moved_to_id).toBeNull();
    expect(Object.keys(s.byId)).toEqual(['s1']);
    expect(s.idsByDate['2026-05-26']).toBeUndefined();
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
