const mockGetAuthoredSession = jest.fn();
jest.mock('@/lib/getStrongSession', () => {
  const actual = jest.requireActual('@/lib/getStrongSession');
  return {
    ...actual,
    getAuthoredSession: (...args: unknown[]) => mockGetAuthoredSession(...args),
  };
});

import { recoverProgrammeStructure } from '@/lib/hydratePlannedSessions';

/** A client that answers each table from a fixed map, chained the way the real one is. */
function fakeClient(workoutPreference: string | null) {
  const rows: Record<string, unknown> = {
    training_blocks: { template_id: 'tmpl-1' },
    plan_templates:  { programme_id: 'prog-1' },
    user_profiles:   { workout_preference: workoutPreference },
  };
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rows[table] ?? null }),
          // programme_days is read as a list, not a single row.
          then: (resolve: (r: unknown) => void) =>
            resolve({ data: [{ day_index: 1, focus: 'lower' }] }),
        }),
      }),
    }),
  };
}

const ROW = { session_label: 'lower', week_number: 3, block_id: 'block-1' };

/**
 * Card 261. `?? 'gym_full'` put back exactly what migration 20260830 removed: a
 * default nobody had chosen, deciding which authored variant of a programme a
 * user is handed. Card 246 made "never asked" representable in the database and
 * in the profile store; this is the last place it was being answered on the
 * user's behalf.
 */
describe('an unset equipment preference is not a vote for the gym', () => {
  beforeEach(() => {
    mockGetAuthoredSession.mockReset();
    mockGetAuthoredSession.mockResolvedValue({ sections: [{ title: 'Main', exercises: [] }] });
  });

  it('recovers nothing rather than handing back the barbell variant', async () => {
    const result = await recoverProgrammeStructure(ROW, 'user-1', fakeClient(null) as never);

    expect(result).toBeNull();
    // The point: we never even asked for an authored session, because there is
    // no variant to ask for.
    expect(mockGetAuthoredSession).not.toHaveBeenCalled();
  });

  it('still recovers the authored session once the user has answered', async () => {
    const result = await recoverProgrammeStructure(ROW, 'user-1', fakeClient('home_dumbbells') as never);

    expect(result).not.toBeNull();
    expect(mockGetAuthoredSession).toHaveBeenCalledWith('prog-1', 1, 'dumbbells', expect.anything());
  });

  it('honours a real choice of the gym, which is not the same as silence', async () => {
    await recoverProgrammeStructure(ROW, 'user-1', fakeClient('gym_full') as never);

    expect(mockGetAuthoredSession).toHaveBeenCalledWith('prog-1', 1, 'gym', expect.anything());
  });
});
