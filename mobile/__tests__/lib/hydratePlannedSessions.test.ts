import { hydratePlannedSessionStructures } from '@/lib/hydratePlannedSessions';

describe('hydratePlannedSessionStructures', () => {
  test('run row missing structure gets one generated', () => {
    const rows = [
      {
        id: 's1',
        modality: 'run',
        session_label: 'tempo',
        run_structure: null,
        strength_structure: null,
      },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360,
      weekly_km: 30,
    });
    expect(out[0].run_structure).toBeDefined();
    expect(out[0].run_structure!.workout_type).toBe('tempo');
  });

  test('strength row missing structure gets one generated', () => {
    const rows = [
      {
        id: 's2',
        modality: 'strength',
        session_label: 'lower',
        run_structure: null,
        strength_structure: null,
      },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360,
      weekly_km: 30,
    });
    expect(out[0].strength_structure).toBeDefined();
    expect(out[0].strength_structure!.session_type).toBe('lower');
  });

  test('row that already has structure is passed through unchanged', () => {
    const existing = {
      version: 1 as const,
      workout_type: 'easy' as const,
      total_distance_m: 5000,
      steps: [],
    };
    const rows = [
      {
        id: 's3',
        modality: 'run',
        session_label: 'easy',
        run_structure: existing,
        strength_structure: null,
      },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360,
      weekly_km: 30,
    });
    expect(out[0].run_structure).toBe(existing);
  });

  test('reports which rows needed backfill via the returned __hydrated flag', () => {
    const rows = [
      {
        id: 's1',
        modality: 'run',
        session_label: 'easy',
        run_structure: null,
        strength_structure: null,
      },
      {
        id: 's2',
        modality: 'run',
        session_label: 'easy',
        run_structure: {
          version: 1 as const,
          workout_type: 'easy' as const,
          total_distance_m: 5000,
          steps: [],
        },
        strength_structure: null,
      },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360,
      weekly_km: 30,
    });
    expect(out[0].__hydrated).toBe(true);
    expect(out[1].__hydrated).toBeFalsy();
  });
});
