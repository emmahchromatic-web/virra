import { reconcileRange } from '@/lib/sessionReconciler';

// --- reconcileRange (pure) ---
describe('reconcileRange', () => {
  test('first install returns a one-year window ending today', () => {
    const { from, to } = reconcileRange(false, new Date('2026-05-22T12:00:00'));
    expect(to).toBe('2026-05-22');
    expect(from).toBe('2025-05-22');
  });
  test('after backfill returns the current Mon-Sun week', () => {
    // 2026-05-22 is a Friday
    const { from, to } = reconcileRange(true, new Date('2026-05-22T12:00:00'));
    expect(from).toBe('2026-05-18'); // Monday
    expect(to).toBe('2026-05-24');   // Sunday
  });
  test('after backfill on a Sunday still spans that week', () => {
    const { from, to } = reconcileRange(true, new Date('2026-05-24T12:00:00'));
    expect(from).toBe('2026-05-18');
    expect(to).toBe('2026-05-24');
  });
});

// --- reconcileSessions (mocked supabase + _commitLink) ---
const commitCalls: Array<[string, string]> = [];
jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: jest.fn((sessionId: string, activityId: string) => {
    commitCalls.push([sessionId, activityId]);
    return Promise.resolve();
  }),
}));

let mockActivities: any[] = [];
let mockSessions: any[] = [];
jest.mock('@/lib/supabase', () => {
  const makeBuilder = (rows: () => any[]) => {
    const b: any = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'lte', 'order', 'in']) b[m] = () => b;
    b.then = (resolve: (v: any) => void) => resolve({ data: rows(), error: null });
    return b;
  };
  return {
    supabase: {
      from: jest.fn((table: string) => makeBuilder(() => (table === 'activities' ? mockActivities : mockSessions))),
    },
  };
});

import { reconcileSessions } from '@/lib/sessionReconciler';

beforeEach(() => {
  commitCalls.length = 0;
  mockActivities = [];
  mockSessions = [];
});

test('links a run activity that clears the distance gate', async () => {
  mockActivities = [{ id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'run', duration_seconds: 2400, distance_meters: 9500 }];
  mockSessions = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  const n = await reconcileSessions('u', '2026-05-18', '2026-05-24');
  expect(n).toBe(1);
  expect(commitCalls).toEqual([['s1', 'a1']]);
});

test('two same-modality activities link to two distinct sessions (no double-link)', async () => {
  mockActivities = [
    { id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'strength', duration_seconds: 2500, distance_meters: null },
    { id: 'a2', started_at: '2026-05-18T18:00:00Z', activity_type: 'strength', duration_seconds: 3000, distance_meters: null },
  ];
  mockSessions = [
    { id: 'upper', scheduled_date: '2026-05-18', modality: 'strength', session_label: 'upper', run_structure: null, created_at: '2026-05-01' },
    { id: 'lower', scheduled_date: '2026-05-18', modality: 'strength', session_label: 'lower', run_structure: null, created_at: '2026-05-02' },
  ];
  const n = await reconcileSessions('u', '2026-05-18', '2026-05-24');
  expect(n).toBe(2);
  const linkedSessions = commitCalls.map((c) => c[0]).sort();
  expect(linkedSessions).toEqual(['lower', 'upper']);
});

test('no unlinked activities -> zero links', async () => {
  mockActivities = [];
  mockSessions = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  expect(await reconcileSessions('u', '2026-05-18', '2026-05-24')).toBe(0);
  expect(commitCalls).toEqual([]);
});

test('activity below gate is left unlinked', async () => {
  mockActivities = [{ id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'run', duration_seconds: 600, distance_meters: 4000 }];
  mockSessions = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  expect(await reconcileSessions('u', '2026-05-18', '2026-05-24')).toBe(0);
});
