// Card: offline J2 reads, Task 4. `getDailyTrainingContext`'s primary
// `planned_sessions` query had no fallback of any kind -- a network failure
// left `sessions` empty (silently downgrading the day to "rest"). This
// verifies it now falls back to the session-store cache instead.

jest.mock('@/lib/trainingBlocks', () => ({
  getActiveBlocks:  jest.fn(async () => []),
  computeBlockLoad: jest.fn(() => []),
}));

let mockPlannedShouldFail = false;
// The failure mode that actually happens offline: PostgREST does NOT reject on
// a network failure, it RESOLVES with `{ data: null, error, status: 0 }`. The
// rejection above is kept as extra coverage, but this is the real path.
let mockPlannedShouldError = false;
let mockActivityRows: any[] = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') {
              return (resolve: any, reject: any) => {
                if (table === 'planned_sessions' && mockPlannedShouldFailGet()) {
                  reject(new Error('network down'));
                  return;
                }
                if (table === 'planned_sessions' && mockPlannedShouldErrorGet()) {
                  resolve({ data: null, error: { message: 'Network request failed' } });
                  return;
                }
                resolve({ data: table === 'planned_sessions' ? [] : mockActivityRowsGet(), error: null });
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

function mockPlannedShouldFailGet()  { return mockPlannedShouldFail; }
function mockPlannedShouldErrorGet() { return mockPlannedShouldError; }
function mockActivityRowsGet()       { return mockActivityRows; }

let mockSessionState: any = { byId: {} };
jest.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => mockSessionState },
}));

import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';

const DATE = '2026-08-25';

beforeEach(() => {
  mockPlannedShouldFail  = false;
  mockPlannedShouldError = false;
  mockActivityRows       = [];
  mockSessionState       = { byId: {} };
});

const CACHE_FOR_DATE = {
  byId: {
    p1: { id: 'p1', scheduled_date: DATE,          modality: 'run',      session_label: 'easy',    status: 'planned',   activity_id: null },
    p2: { id: 'p2', scheduled_date: DATE,          modality: 'strength', session_label: 'general', status: 'completed', activity_id: 'a9' },
    p3: { id: 'p3', scheduled_date: DATE,          modality: 'run',      session_label: 'long',    status: 'dropped',   activity_id: null }, // wrong status
    p4: { id: 'p4', scheduled_date: '2026-08-26',  modality: 'run',      session_label: 'tempo',   status: 'planned',   activity_id: null }, // wrong date
  },
};

describe('getDailyTrainingContext — planned_sessions fallback', () => {
  // THE offline case. A resolved `{ data: null, error }` used to sail straight
  // through `data ?? []`, reporting a day with a long run cached as
  // `inferred_load: 'rest'` and feeding that into the Nutrition tab's targets
  // and the Dashboard's fuelling copy.
  it('uses the session-store cache when the query RESOLVES with an error (the real offline path)', async () => {
    mockPlannedShouldError = true;
    mockSessionState = CACHE_FOR_DATE;

    const ctx = await getDailyTrainingContext('u1', DATE, null);

    expect(ctx.planned_sessions.map((s) => s.id).sort()).toEqual(['p1', 'p2']);
    expect(ctx.inferred_load).toBe('moderate');
    expect(ctx.stacked).toBe(true);
  });

  // Idempotence: repeated offline calls read the cache again and return the
  // same answer -- the fallback only reads, so nothing degrades.
  it('stays idempotent across repeated failing calls', async () => {
    mockPlannedShouldError = true;
    mockSessionState = CACHE_FOR_DATE;

    const first  = await getDailyTrainingContext('u1', DATE, null);
    const second = await getDailyTrainingContext('u1', DATE, null);
    const third  = await getDailyTrainingContext('u1', DATE, null);

    expect(second.planned_sessions.map((s) => s.id).sort()).toEqual(['p1', 'p2']);
    expect(third.inferred_load).toBe(first.inferred_load);
  });

  it('falls back to an empty context when the query errors and the cache has nothing for that date', async () => {
    mockPlannedShouldError = true;
    mockSessionState = { byId: {} };

    const ctx = await getDailyTrainingContext('u1', DATE, null);

    expect(ctx.planned_sessions).toEqual([]);
    expect(ctx.inferred_load).toBe('rest');
  });

  it('uses the session-store cache, filtered by date and status, when the query rejects', async () => {
    mockPlannedShouldFail = true;
    mockSessionState = {
      byId: {
        p1: { id: 'p1', scheduled_date: DATE,          modality: 'run',      session_label: 'easy',    status: 'planned',   activity_id: null },
        p2: { id: 'p2', scheduled_date: DATE,          modality: 'strength', session_label: 'general', status: 'completed', activity_id: 'a9' },
        p3: { id: 'p3', scheduled_date: DATE,          modality: 'run',      session_label: 'long',    status: 'dropped',   activity_id: null }, // wrong status
        p4: { id: 'p4', scheduled_date: '2026-08-26',  modality: 'run',      session_label: 'tempo',   status: 'planned',   activity_id: null }, // wrong date
      },
    };

    const ctx = await getDailyTrainingContext('u1', DATE, null);

    expect(ctx.planned_sessions.map((s) => s.id).sort()).toEqual(['p1', 'p2']);
    // easy run + strength general stack: max(easy, easy) stepped up one tier -> moderate
    expect(ctx.inferred_load).toBe('moderate');
    expect(ctx.stacked).toBe(true);
  });

  it('falls back to an empty context (not a throw) when the cache also has nothing for that date', async () => {
    mockPlannedShouldFail = true;
    mockSessionState = { byId: {} };

    const ctx = await getDailyTrainingContext('u1', DATE, null);

    expect(ctx.planned_sessions).toEqual([]);
    expect(ctx.inferred_load).toBe('rest');
  });

  it('uses the live query result (not the cache) when the query succeeds', async () => {
    mockPlannedShouldFail = false;
    mockSessionState = {
      byId: {
        cached: { id: 'cached', scheduled_date: DATE, modality: 'run', session_label: 'long', status: 'planned', activity_id: null },
      },
    };
    // The live query mock always returns [] for planned_sessions -- if the
    // cache leaked in here despite the query succeeding, this would fail.

    const ctx = await getDailyTrainingContext('u1', DATE, null);

    expect(ctx.planned_sessions).toEqual([]);
    expect(ctx.inferred_load).toBe('rest');
  });
});
