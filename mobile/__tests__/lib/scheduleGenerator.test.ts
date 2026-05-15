import { generateSchedule } from '@/lib/scheduleGenerator';

const mockWeeks = [
  { week: 1, km: 3, label: 'Base', sessions: ['easy', 'tempo', 'long'] },
  { week: 2, km: 2, label: 'Base', sessions: ['lower', 'upper'] },
];

test('3-session run week starting 2026-05-11 (Monday)', () => {
  const rows = generateSchedule('u', 'b', 'run', '2026-05-11', [mockWeeks[0]]);
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-05-11', '2026-05-13', '2026-05-16']);
  expect(rows.find((r) => r.session_label === 'long')?.scheduled_date).toBe('2026-05-16');
});

test('2-session strength week gives Mon + Thu', () => {
  const rows = generateSchedule('u', 'b', 'strength', '2026-05-11', [mockWeeks[1]]);
  expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-05-11', '2026-05-14']);
});

test('total rows equals sum of all sessions', () => {
  const rows = generateSchedule('u', 'b', 'run', '2026-05-11', mockWeeks);
  expect(rows).toHaveLength(5);
});

describe('generateSchedule — structure attachment', () => {
  test('run rows include run_structure when context provided', () => {
    const rows = generateSchedule(
      'u', 'b', 'run', '2026-05-11',
      [{ week: 1, km: 30, label: 'Base', sessions: ['easy', 'tempo', 'long'] }],
      undefined,
      undefined,
      { baseline_pace_secs: 360 },
    );
    for (const r of rows) {
      expect(r.run_structure).toBeDefined();
      expect(r.run_structure!.version).toBe(1);
      expect(r.run_structure!.total_distance_m).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.session_label === 'tempo')!.run_structure!.workout_type).toBe('tempo');
    expect(rows.find((r) => r.session_label === 'long')!.run_structure!.workout_type).toBe('long');
  });

  test('strength rows include strength_structure when context provided', () => {
    const rows = generateSchedule(
      'u', 'b', 'strength', '2026-05-11',
      [{ week: 1, km: 0, label: 'Base', sessions: ['lower', 'upper'] }],
      undefined,
      undefined,
      { baseline_pace_secs: 360 },
    );
    for (const r of rows) {
      expect(r.strength_structure).toBeDefined();
      expect(r.strength_structure!.exercises.length).toBeGreaterThanOrEqual(5);
    }
    expect(rows.find((r) => r.session_label === 'lower')!.strength_structure!.session_type).toBe('lower');
    expect(rows.find((r) => r.session_label === 'upper')!.strength_structure!.session_type).toBe('upper');
  });

  test('rows omit structure when no context provided (backwards-compatible)', () => {
    const rows = generateSchedule(
      'u', 'b', 'run', '2026-05-11',
      [{ week: 1, km: 30, label: 'Base', sessions: ['easy'] }],
    );
    expect(rows[0].run_structure).toBeUndefined();
  });
});

