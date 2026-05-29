const captured: any = { updates: [], inserts: [], regenerated: [] };

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          update: (patch: any) => { captured.updates.push({ table, patch }); return { eq: () => Promise.resolve({ error: null }) }; },
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { assessment_history: [] }, error: null }) }) }),
        };
      }
      if (table === 'fitness_assessments') {
        return { insert: (row: any) => { captured.inserts.push({ table, row }); return Promise.resolve({ error: null }); } };
      }
      if (table === 'planned_sessions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ gte: () => Promise.resolve({
            data: [
              { id: 'p1', session_label: 'easy',  run_structure: { version: 1, workout_type: 'easy', total_distance_m: 5000, steps: [] } },
              { id: 'p2', session_label: 'tempo', run_structure: { version: 1, workout_type: 'tempo', total_distance_m: 8000, steps: [] } },
              { id: 'p3', session_label: 'mystery-label', run_structure: { version: 1, workout_type: 'easy', total_distance_m: 6000, steps: [] } },
            ], error: null,
          }) }) }) }),
          update: (patch: any) => ({ eq: (_c: string, id: string) => { captured.regenerated.push({ id, patch }); return Promise.resolve({ error: null }); } }),
        };
      }
      return {};
    }),
  },
}));

jest.mock('@/lib/runWorkoutGenerator', () => ({
  __esModule: true,
  generateRunStructure: jest.fn((input: any) => {
    if (input.session_label === 'mystery-label') throw new Error('unhandled workout type');
    return { version: 1, workout_type: input.session_label, total_distance_m: input.distance_km * 1000, steps: [], __regen: input.baseline_pace_secs };
  }),
}));

import { applyBaselineUpdate } from '@/lib/applyBaselineUpdate';
import type { Verdict } from '@/lib/baselineCalibration';

const verdict: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'x', nRuns: 5, windowDays: 42, wouldChangeUpcoming: true,
};

beforeEach(() => { captured.updates = []; captured.inserts = []; captured.regenerated = []; });

describe('applyBaselineUpdate', () => {
  it('writes the new baseline to user_profiles', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const profileUpdate = captured.updates.find((u: any) => u.table === 'user_profiles');
    expect(profileUpdate.patch.baseline_pace_seconds_per_km).toBe(348);
  });

  it('appends a snapshot to assessment_history', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const profileUpdate = captured.updates.find((u: any) => u.table === 'user_profiles');
    expect(profileUpdate.patch.assessment_history).toHaveLength(1);
    expect(profileUpdate.patch.assessment_history[0]).toMatchObject({ from: 360, to: 348, direction: 'faster' });
  });

  it('inserts a fitness_assessments row with the direction', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    expect(captured.inserts[0].row).toMatchObject({
      user_id: 'u1', actual_pace_seconds_per_km: 348, direction: 'faster', stated_level: 'recreational',
    });
    expect(captured.inserts[0].row.celebrated_at).toBeTruthy();
  });

  it('regenerates run_structure for generatable future runs and skips the unknown label', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const ids = captured.regenerated.map((r: any) => r.id);
    expect(ids).toEqual(['p1', 'p2']);
    expect(captured.regenerated[0].patch.run_structure.__regen).toBe(348);
  });
});
