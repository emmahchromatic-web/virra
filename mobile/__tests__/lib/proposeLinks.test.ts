import { proposeLinks } from '@/lib/sessionReconciler';

const baseSession = {
  id: 's1',
  scheduled_date: '2026-05-25',
  modality: 'run' as const,
  session_label: 'Easy',
  run_structure: { total_distance_m: 5000 },
  created_at: '2026-05-20T00:00:00Z',
};

const baseActivity = {
  id: 'a1',
  started_at: '2026-05-25T07:30:00.000Z',
  activity_type: 'run' as const,
  duration_seconds: 1800,
  distance_meters: 5000,
};

describe('proposeLinks', () => {
  it('proposes a link when activity local date + modality match a planned session', () => {
    const links = proposeLinks([baseActivity], [baseSession]);
    expect(links).toEqual([{ activityId: 'a1', sessionId: 's1' }]);
  });

  it('does not propose a link when activity has no matching modality', () => {
    const links = proposeLinks(
      [{ ...baseActivity, activity_type: 'swim' as const }],
      [baseSession],
    );
    expect(links).toEqual([]);
  });

  it('does not double-link a session already proposed in the same pass', () => {
    const links = proposeLinks(
      [baseActivity, { ...baseActivity, id: 'a2', started_at: '2026-05-25T18:00:00.000Z' }],
      [baseSession],
    );
    expect(links).toHaveLength(1);
    expect(links[0].sessionId).toBe('s1');
  });
});
