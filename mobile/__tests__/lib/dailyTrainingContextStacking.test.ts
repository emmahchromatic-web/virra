import type { TrainingLoad } from '@/lib/nutritionTargets';

// No training blocks: the run-suppression and deload rules are exercised
// elsewhere, and here they would only obscure the stacking arithmetic.
jest.mock('@/lib/trainingBlocks', () => ({
  getActiveBlocks:  jest.fn(async () => []),
  computeBlockLoad: jest.fn(() => []),
}));

let mockPlannedRows: any[] = [];
let mockActivityRows: any[] = [];

// Every builder method returns the same object, so the chain shape does not
// matter; awaiting it yields whichever table was asked for.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rows = () => (table === 'planned_sessions' ? mockPlannedRows : mockActivityRows);
      const chain: any = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') {
              return (resolve: any) => resolve({ data: rows(), error: null });
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  },
}));

import { getDailyTrainingContext, inferLoadFromActivity } from '@/lib/dailyTrainingContext';

const DATE = '2026-08-25';
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00`).toISOString();

beforeEach(() => {
  mockPlannedRows  = [];
  mockActivityRows = [];
});

const run = (label: string) => ({ id: `p-${label}`, session_label: label, modality: 'run', status: 'planned', activity_id: null });
const strength = (label: string) => ({ id: `s-${label}`, session_label: label, modality: 'strength', status: 'planned', activity_id: null });

async function loadFor(): Promise<TrainingLoad> {
  const ctx = await getDailyTrainingContext('u1', DATE, null);
  return ctx.inferred_load;
}

describe('unplanned activity → load', () => {
  it('ignores anything below the 20 minute floor', () => {
    expect(inferLoadFromActivity(19 * 60)).toBeNull();
  });

  it('tiers on duration', () => {
    expect(inferLoadFromActivity(30 * 60)).toBe('easy');
    expect(inferLoadFromActivity(60 * 60)).toBe('moderate');
    expect(inferLoadFromActivity(180 * 60)).toBe('hard');
  });
});

describe('getDailyTrainingContext', () => {
  it('is a rest day with nothing planned and nothing logged', async () => {
    expect(await loadFor()).toBe('rest');
  });

  it('takes the single session load when only one thing happened', async () => {
    mockPlannedRows = [run('easy')];
    expect(await loadFor()).toBe('easy');
  });

  // The build 11 UAT report: an easy run plus a strength session fuelled
  // exactly the same as the easy run on its own.
  it('steps up a tier when two sessions are stacked', async () => {
    mockPlannedRows = [run('easy'), strength('general')];
    const ctx = await getDailyTrainingContext('u1', DATE, null);
    expect(ctx.inferred_load).toBe('moderate');
    expect(ctx.stacked).toBe(true);
    expect(ctx.source_label).toBe('2 sessions');
  });

  it('never steps past hard', async () => {
    mockPlannedRows = [run('long'), strength('lower')];
    expect(await loadFor()).toBe('hard');
  });

  // A 10-mile hike on a rest day used to fuel as a rest day.
  it('lifts a rest day when an unplanned activity is logged', async () => {
    mockActivityRows = [{ id: 'a1', activity_type: 'other', duration_seconds: 180 * 60, started_at: at('09:00'), planned_session_id: null }];
    expect(await loadFor()).toBe('hard');
  });

  it('stacks an unplanned activity on top of a planned session', async () => {
    mockPlannedRows  = [run('easy')];
    mockActivityRows = [{ id: 'a1', activity_type: 'other', duration_seconds: 60 * 60, started_at: at('18:00'), planned_session_id: null }];
    expect(await loadFor()).toBe('hard'); // max(easy, moderate) = moderate, +1 = hard
  });

  it('does not double count an activity already matched to a session', async () => {
    mockPlannedRows  = [{ ...run('easy'), status: 'completed', activity_id: 'a1' }];
    mockActivityRows = [{ id: 'a1', activity_type: 'run', duration_seconds: 45 * 60, started_at: at('07:00'), planned_session_id: null }];
    expect(await loadFor()).toBe('easy');
  });

  it('does not double count an activity that names its planned session', async () => {
    mockPlannedRows  = [run('easy')];
    mockActivityRows = [{ id: 'a1', activity_type: 'run', duration_seconds: 45 * 60, started_at: at('07:00'), planned_session_id: 'p-easy' }];
    expect(await loadFor()).toBe('easy');
  });

  it('ignores an activity that landed on another day', async () => {
    mockActivityRows = [{ id: 'a1', activity_type: 'other', duration_seconds: 180 * 60, started_at: new Date('2026-08-26T09:00:00').toISOString(), planned_session_id: null }];
    expect(await loadFor()).toBe('rest');
  });
});
