let mockSessions: any[] = [];
let mockUpdates: any[] = [];
let mockSessionError: any = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'user_profiles') {
        const chain: any = new Proxy({}, {
          get: (_t, prop) => {
            if (prop === 'then') return (r: any) => r({ data: { baseline_pace_seconds_per_km: 300 } });
            return () => chain;
          },
        });
        return chain;
      }
      // planned_sessions
      const chain: any = new Proxy({}, {
        get: (_t, prop) => {
          if (prop === 'update') return (patch: any) => { mockUpdates.push(patch); return chain; };
          if (prop === 'then') return (r: any) => r({ data: mockSessions, error: mockSessionError });
          return () => chain;
        },
      });
      return chain;
    },
  },
}));

import { applyRaceToSchedule } from '@/lib/raceSchedule';

const runSession = (over: Partial<any> = {}) => ({
  id: 'sess-1',
  session_label: 'tempo',
  modality: 'run',
  status: 'planned',
  run_structure: { total_distance_m: 3900 },
  ...over,
});

beforeEach(() => {
  mockSessions = [];
  mockUpdates = [];
  mockSessionError = null;
});

// Build 11 UAT card 26: a parkrun added as a race left the day's generated
// 3.9km tempo run in place, because nothing ever reconciled the two.
it('turns the run planned on race day into the race', async () => {
  mockSessions = [runSession()];
  const res = await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: '5k' });

  expect(res.outcome).toBe('converted');
  expect(mockUpdates).toHaveLength(1);
  expect(mockUpdates[0].session_label).toBe('race');
  // 5k event distance wins over the 3.9km the template had generated.
  expect(mockUpdates[0].run_structure.total_distance_m).toBeGreaterThanOrEqual(5000);
});

it('uses the event distance, not the planned one', async () => {
  mockSessions = [runSession({ run_structure: { total_distance_m: 8000 } })];
  await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: 'half_marathon' });
  expect(mockUpdates[0].run_structure.total_distance_m).toBeGreaterThan(20000);
});

// 'ultra' has no fixed distance, so inventing one would be worse than keeping
// whatever the plan already had.
it('keeps the planned distance for an ultra', async () => {
  mockSessions = [runSession({ run_structure: { total_distance_m: 50000 } })];
  await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: 'ultra' });
  expect(mockUpdates[0].run_structure.total_distance_m).toBeGreaterThan(40000);
});

it('does nothing when no run is planned that day', async () => {
  mockSessions = [];
  const res = await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: '10k' });
  expect(res.outcome).toBe('none');
  expect(mockUpdates).toHaveLength(0);
});

it('is idempotent once the session is already a race', async () => {
  mockSessions = [runSession({ session_label: 'race' })];
  const res = await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: '10k' });
  expect(res.outcome).toBe('converted');
  expect(mockUpdates).toHaveLength(0);
});

it('reports the reason when the lookup fails instead of throwing', async () => {
  mockSessionError = { message: 'network down' };
  const res = await applyRaceToSchedule('u1', { event_date: '2026-09-05', distance_goal: '10k' });
  expect(res.outcome).toBe('none');
  expect(res.reason).toBe('network down');
});
