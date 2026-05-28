import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCommitLink = jest.fn().mockResolvedValue(undefined);
const mockDropSessionDb = jest.fn().mockResolvedValue(undefined);
const mockMoveSessionDb = jest.fn();
const mockLinkActivityToSession = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: (sid: string, aid: string) => mockCommitLink(sid, aid),
  dropSession: (sid: string) => mockDropSessionDb(sid),
  moveSession: (sid: string, newDate: string) => mockMoveSessionDb(sid, newDate),
  linkActivityToSession: (aid: string, sid: string) => mockLinkActivityToSession(aid, sid),
}));

jest.mock('@/lib/supabase', () => {
  const empty = {
    select: () => empty, eq: () => empty, gte: () => empty, lte: () => empty,
    in: () => empty, is: () => empty, neq: () => empty,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => empty,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

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
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCommitLink.mockClear().mockResolvedValue(undefined);
  mockDropSessionDb.mockClear().mockResolvedValue(undefined);
  mockMoveSessionDb.mockClear().mockResolvedValue('s1_new');
  mockLinkActivityToSession.mockClear().mockResolvedValue(undefined);
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
  it('flips status to dropped optimistically', async () => {
    await useSessionStore.getState().dropSession('s1');
    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
    expect(mockDropSessionDb).toHaveBeenCalledWith('s1');
  });

  it('reverts on DB failure', async () => {
    mockDropSessionDb.mockRejectedValueOnce(new Error('boom'));
    await expect(useSessionStore.getState().dropSession('s1')).rejects.toThrow('boom');
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(useSessionStore.getState().lastError?.op).toBe('dropSession');
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
