import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => {
  const defaults = () => [
    { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    { id: 's2', scheduled_date: '2026-05-26', modality: 'strength', session_label: 'Lower', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 1, created_at: '2026-05-20T00:00:00Z' },
  ];
  let rows: any[] = defaults();
  const builder = {
    select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
    // Test-only seam: what "the server" currently says, so a test can let it
    // catch up with a completion that was queued offline.
    __setRows: (next?: any[]) => { rows = next ?? defaults(); },
  };
});

import { useSessionStore, hasLoadedDate } from '@/store/sessionStore';

const { __setRows } = jest.requireMock('@/lib/supabase') as { __setRows: (next?: any[]) => void };

beforeEach(async () => {
  await AsyncStorage.clear();
  __setRows();
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(),
    hasHydrated: true, lastError: null,
  });
});

describe('sessionStore.ensureLoaded', () => {
  it('fetches and indexes sessions for the requested range', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const s = useSessionStore.getState();
    expect(Object.keys(s.byId).sort()).toEqual(['s1','s2']);
    expect(s.idsByDate['2026-05-25']).toEqual(['s1']);
    expect(s.idsByDate['2026-05-26']).toEqual(['s2']);
    expect(s.loadedRanges).toHaveLength(1);
    expect(s.loadedRanges[0]).toMatchObject({ from: '2026-05-25', to: '2026-05-26' });
  });

  it('is idempotent — second call within staleness window does not refetch', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt1 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt2 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    expect(fetchedAt2).toBe(fetchedAt1);
  });

  it('hasLoadedDate is true for a loaded date with zero rows -- a confirmed rest day is not a cache miss', async () => {
    __setRows([]); // server confirms nothing scheduled in this range at all
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    expect(useSessionStore.getState().idsByDate['2026-05-25']).toBeUndefined(); // no key created
    expect(hasLoadedDate('2026-05-25')).toBe(true);  // but the range IS loaded
    expect(hasLoadedDate('2026-06-01')).toBe(false); // a date outside the loaded range is not
  });

  it('refresh() always refetches and updates fetchedAt', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt1 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');
    const fetchedAt2 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    expect(fetchedAt2).toBeGreaterThan(fetchedAt1);
  });
});

/**
 * A workout finished with no signal is marked completed locally and parked in
 * the outbox. Until that item drains, the server still says "planned" -- and a
 * screen focusing in that window used to flip the session straight back, with
 * nothing to put it right again for five minutes.
 */
describe('sessionStore.refresh — a completion still waiting in the outbox', () => {
  const LOCAL_ID = 'local_1758000000000_ab12cd';

  it('keeps the local completion the server has not caught up with yet', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    useSessionStore.getState().applyLocalCompletion('s1', LOCAL_ID);

    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');

    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe(LOCAL_ID);
    expect(useSessionStore.getState().idsByDate['2026-05-25']).toEqual(['s1']);
    // Everything else in the range is still replaced from the server.
    expect(useSessionStore.getState().byId['s2'].status).toBe('planned');
  });

  it('hands the row back to the server the moment it agrees the session is completed', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    useSessionStore.getState().applyLocalCompletion('s1', LOCAL_ID);

    __setRows([
      { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'completed',
        block_id: 'b1', activity_id: 'act-real-1', moved_to_id: null, week_number: 1, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    ]);
    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');

    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('act-real-1');
    expect(useSessionStore.getState().idsByDate['2026-05-25']).toEqual(['s1']);
  });

  it('does not preserve an ordinary completed row with a real activity id', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    useSessionStore.getState().applyLocalCompletion('s1', 'act-real-1');

    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');

    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
  });
});
