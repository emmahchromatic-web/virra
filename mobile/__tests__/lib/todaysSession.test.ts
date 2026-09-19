// Card: offline J2 reads, Task 4. Two behaviours under test:
//   1. `getTodaysSessions` reads today's rows from the shared session-store
//      cache first, and only falls back to a direct `planned_sessions` query
//      when the cache has nothing for today yet.
//   2. `enrichTodaysSessions`'s three internal Supabase calls (activities by
//      id, user_profiles, today's activities) are independently fault
//      tolerant -- a rejection in any ONE of them must not blank out the
//      other two's real data.

jest.mock('@/store/cycle', () => ({
  useCycleStore: { getState: () => ({ cycleInfo: null, cycleProfile: 'natural', hasPlaceboWeek: false }) },
}));

jest.mock('@/lib/hydratePlannedSessions', () => {
  // Identity pass-through: this test isn't exercising workout-structure
  // generation, just the fault-tolerance/cache-first wiring around it.
  const hydratePlannedSessionStructures = jest.fn((rows: any[]) => rows.map((r: any) => ({ ...r })));
  return {
    hydratePlannedSessionStructures,
    persistHydratedRows: jest.fn(async () => {}),
  };
});

let mockPlannedDirectRows: any[]     = [];
let mockActivityByIdRows: any[]      = [];
let mockProfileRow: any              = null;
let mockTodayActivityRows: any[]     = [];
let rejectWhich: 'activities-by-id' | 'user_profiles' | 'today-activities' | 'planned_sessions' | null = null;
let plannedSessionsFromCalls = 0;
let activitiesCallCount      = 0;

// Indirection so the mock factory (hoisted above the `let`s below) always
// reads the current value rather than closing over an initial one. Jest only
// allows out-of-scope references from a `jest.mock` factory when the
// identifier is prefixed `mock` (case-insensitive), hence the naming.
function mockPlannedSessionsFromCallsInc() { plannedSessionsFromCalls += 1; }
function mockActivitiesCallCountInc()      { activitiesCallCount += 1; }
function mockActivitiesCallCountGet()      { return activitiesCallCount; }
function mockRejectWhichGet()              { return rejectWhich; }
function mockPlannedDirectRowsGet()        { return mockPlannedDirectRows; }
function mockActivityByIdRowsGet()         { return mockActivityByIdRows; }
function mockProfileRowGet()               { return mockProfileRow; }
function mockTodayActivityRowsGet()        { return mockTodayActivityRows; }

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let kind: string;
      if (table === 'planned_sessions') {
        mockPlannedSessionsFromCallsInc();
        kind = 'planned_sessions';
      } else if (table === 'activities') {
        mockActivitiesCallCountInc();
        kind = mockActivitiesCallCountGet() === 1 ? 'activities-by-id' : 'today-activities';
      } else if (table === 'user_profiles') {
        kind = 'user_profiles';
      } else {
        kind = table;
      }
      const chain: any = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') {
              return (resolve: any, reject: any) => {
                if (mockRejectWhichGet() === kind) {
                  reject(new Error(`${kind} failed`));
                  return;
                }
                let data: any;
                if (kind === 'planned_sessions')      data = mockPlannedDirectRowsGet();
                else if (kind === 'activities-by-id') data = mockActivityByIdRowsGet();
                else if (kind === 'user_profiles')    data = mockProfileRowGet();
                else if (kind === 'today-activities') data = mockTodayActivityRowsGet();
                resolve({ data, error: null });
              };
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  },
}));

let mockSessionState: any = { byId: {}, idsByDate: {} };
jest.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => mockSessionState },
}));

import { getTodaysSessions, enrichTodaysSessions } from '@/lib/todaysSession';
import { hydratePlannedSessionStructures as mockHydrate } from '@/lib/hydratePlannedSessions';

const TODAY = new Date().toLocaleDateString('en-CA');

beforeEach(() => {
  mockPlannedDirectRows  = [];
  mockActivityByIdRows   = [];
  mockProfileRow         = null;
  mockTodayActivityRows  = [];
  rejectWhich            = null;
  plannedSessionsFromCalls = 0;
  activitiesCallCount    = 0;
  mockSessionState       = { byId: {}, idsByDate: {} };
  (mockHydrate as jest.Mock).mockClear();
});

describe('getTodaysSessions — cache-first', () => {
  it('reads from the session-store cache when it has rows for today, without querying planned_sessions', async () => {
    mockSessionState = {
      byId: {
        p1: { id: 'p1', scheduled_date: TODAY, modality: 'run',      session_label: 'easy',  status: 'planned', activity_id: null, run_structure: null, strength_structure: null },
        p2: { id: 'p2', scheduled_date: TODAY, modality: 'strength', session_label: 'lower', status: 'dropped', activity_id: null, run_structure: null, strength_structure: null },
      },
      idsByDate: { [TODAY]: ['p1', 'p2'] },
    };

    const result = await getTodaysSessions('u1');

    expect(plannedSessionsFromCalls).toBe(0);
    expect(result.map((r) => r.id)).toEqual(['p1']); // dropped row excluded
  });

  it('excludes moved/dropped rows sourced from the cache and still does not fall back to a direct query when the filtered set is empty', async () => {
    mockSessionState = {
      byId: {
        p1: { id: 'p1', scheduled_date: TODAY, modality: 'run', session_label: 'easy', status: 'dropped', activity_id: null },
        p2: { id: 'p2', scheduled_date: TODAY, modality: 'run', session_label: 'long', status: 'moved',   activity_id: null },
      },
      idsByDate: { [TODAY]: ['p1', 'p2'] },
    };
    mockPlannedDirectRows = [{ id: 'should-not-be-used', modality: 'run', session_label: 'x', status: 'planned', activity_id: null }];

    const result = await getTodaysSessions('u1');

    expect(plannedSessionsFromCalls).toBe(0); // cache key existed, so no fallback query
    expect(result).toEqual([]);
  });

  it('falls back to a direct query when the cache has nothing for today yet', async () => {
    mockSessionState = { byId: {}, idsByDate: {} }; // e.g. fresh sign-in, no range loaded
    mockPlannedDirectRows = [
      { id: 'd1', modality: 'run', session_label: 'easy', status: 'planned', activity_id: null, run_structure: null, strength_structure: null },
    ];

    const result = await getTodaysSessions('u1');

    expect(plannedSessionsFromCalls).toBeGreaterThan(0);
    expect(result.map((r) => r.id)).toEqual(['d1']);
  });
});

describe('enrichTodaysSessions — independent fault tolerance', () => {
  // rLinked depends on the activities-by-id call for its actual_distance_m.
  // rUnlinked (status 'planned', no activity_id) depends on today's-activities
  // for its unlinked-fallback match. Baseline pace/weekly km depend on the
  // user_profiles call, observed via the hydrate-context spy.
  const rows = [
    { id: 'r-linked',   modality: 'run' as const,      session_label: 'easy',  status: 'completed' as const, activity_id: 'a1' },
    { id: 'r-unlinked', modality: 'strength' as const, session_label: 'general', status: 'planned' as const, activity_id: null },
  ];

  beforeEach(() => {
    mockActivityByIdRows  = [{ id: 'a1', activity_type: 'run', distance_meters: 5000, duration_seconds: 1800 }];
    mockProfileRow        = { baseline_pace_seconds_per_km: 300, weekly_mileage_km: 40 };
    mockTodayActivityRows = [
      { id: 'a2', activity_type: 'strength', distance_meters: 0, duration_seconds: 1200, planned_session_id: null, started_at: `${TODAY}T08:00:00` },
    ];
  });

  it('activities-by-id rejecting leaves the profile and today-activities data intact', async () => {
    rejectWhich = 'activities-by-id';

    const result = await enrichTodaysSessions('u1', rows as any);

    // Affected call: falls back to the code's existing empty-map shape.
    const linked = result.find((r) => r.id === 'r-linked')!;
    expect(linked.actual_distance_m).toBeNull();

    // Unaffected calls: today's-activities fallback match still applied...
    const unlinked = result.find((r) => r.id === 'r-unlinked')!;
    expect(unlinked.status).toBe('completed');
    expect(unlinked.actual_duration_s).toBe(1200);

    // ...and profile data still reached the hydrate context.
    expect(mockHydrate).toHaveBeenCalledWith(
      expect.anything(),
      { baseline_pace_secs: 300, weekly_km: 40 },
    );
  });

  it('user_profiles rejecting leaves the two activities calls intact and falls through to the existing defaults', async () => {
    rejectWhich = 'user_profiles';

    const result = await enrichTodaysSessions('u1', rows as any);

    const linked = result.find((r) => r.id === 'r-linked')!;
    expect(linked.actual_distance_m).toBe(5000); // activities-by-id data survived

    const unlinked = result.find((r) => r.id === 'r-unlinked')!;
    expect(unlinked.actual_duration_s).toBe(1200); // today-activities data survived

    expect(mockHydrate).toHaveBeenCalledWith(
      expect.anything(),
      { baseline_pace_secs: 360, weekly_km: 30 }, // existing ?? defaults
    );
  });

  it("today's-activities rejecting leaves the activities-by-id and profile data intact", async () => {
    rejectWhich = 'today-activities';

    const result = await enrichTodaysSessions('u1', rows as any);

    const linked = result.find((r) => r.id === 'r-linked')!;
    expect(linked.actual_distance_m).toBe(5000); // activities-by-id data survived

    const unlinked = result.find((r) => r.id === 'r-unlinked')!;
    expect(unlinked.status).toBe('planned'); // no unplanned match found -> unaffected default
    expect(unlinked.actual_distance_m).toBeNull();

    expect(mockHydrate).toHaveBeenCalledWith(
      expect.anything(),
      { baseline_pace_secs: 300, weekly_km: 40 }, // profile data survived
    );
  });

  it('with nothing rejecting, all three calls contribute their real data', async () => {
    const result = await enrichTodaysSessions('u1', rows as any);

    const linked = result.find((r) => r.id === 'r-linked')!;
    expect(linked.actual_distance_m).toBe(5000);

    const unlinked = result.find((r) => r.id === 'r-unlinked')!;
    expect(unlinked.actual_duration_s).toBe(1200);

    expect(mockHydrate).toHaveBeenCalledWith(
      expect.anything(),
      { baseline_pace_secs: 300, weekly_km: 40 },
    );
  });
});
