import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => {
  const rows: any[] = [
    { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    { id: 's2', scheduled_date: '2026-05-26', modality: 'strength', session_label: 'Lower', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 1, created_at: '2026-05-20T00:00:00Z' },
  ];
  const builder = {
    select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

import { useSessionStore } from '@/store/sessionStore';

beforeEach(async () => {
  await AsyncStorage.clear();
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

  it('refresh() always refetches and updates fetchedAt', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt1 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');
    const fetchedAt2 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    expect(fetchedAt2).toBeGreaterThan(fetchedAt1);
  });
});
