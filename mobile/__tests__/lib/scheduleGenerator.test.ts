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
      const structure = r.strength_structure!;
      expect(structure).toBeDefined();
      // No programme context -> generated v1 structure with a flat exercise list.
      expect(structure.version).toBe(1);
      if (structure.version === 1) {
        expect(structure.exercises.length).toBeGreaterThanOrEqual(5);
      }
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


// Card 281. Week 1 is anchored to the Monday of the start date's week, so a
// mid-week start used to write the earlier days into the past. Dates verified
// against the calendar: 11 May 2026 is a Monday; the default 3-session run
// week lands on Mon 11, Wed 13, Sat 16.
describe('generateSchedule — a mid-week start writes nothing into the past', () => {
  const threeSession = { week: 1, km: 3, label: 'Base', sessions: ['easy', 'tempo', 'long'] };
  const twoWeeks = [threeSession, { ...threeSession, week: 2 }];

  test('a Saturday start keeps only the Saturday session in week 1', () => {
    // Before this fix: Mon 11 and Wed 13 were written too, already missed.
    const rows = generateSchedule('u', 'b', 'run', '2026-05-16', [threeSession]);
    expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-05-16']);
  });

  test('a Sunday start with no training day left gives an empty first week', () => {
    const rows = generateSchedule('u', 'b', 'run', '2026-05-17', [threeSession]);
    expect(rows).toHaveLength(0);
  });

  test('a Tuesday start keeps Wednesday and Saturday', () => {
    const rows = generateSchedule('u', 'b', 'run', '2026-05-12', [threeSession]);
    expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-05-13', '2026-05-16']);
  });

  test('only week 1 is shortened: week 2 is whole', () => {
    const rows = generateSchedule('u', 'b', 'run', '2026-05-16', twoWeeks);
    expect(rows.filter((r) => r.week_number === 1).map((r) => r.scheduled_date))
      .toEqual(['2026-05-16']);
    expect(rows.filter((r) => r.week_number === 2).map((r) => r.scheduled_date))
      .toEqual(['2026-05-18', '2026-05-20', '2026-05-23']);
  });

  test('keeps the Monday anchor, so week 2 still starts on a Monday', () => {
    // The fix drops past sessions; it must not shift the plan onto a
    // Saturday-start week, or "week 2" and "this week" stop agreeing.
    const rows = generateSchedule('u', 'b', 'run', '2026-05-16', twoWeeks);
    const firstOfWeek2 = rows.filter((r) => r.week_number === 2)[0];
    expect(new Date(`${firstOfWeek2.scheduled_date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  test('a Monday start is unchanged', () => {
    const rows = generateSchedule('u', 'b', 'run', '2026-05-11', [threeSession]);
    expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-05-11', '2026-05-13', '2026-05-16']);
  });

  test('no row is ever dated before its start, whichever day it starts', () => {
    for (let day = 11; day <= 17; day++) {
      const start = `2026-05-${String(day).padStart(2, '0')}`;
      for (const r of generateSchedule('u', 'b', 'run', start, twoWeeks)) {
        expect(r.scheduled_date >= start).toBe(true);
      }
    }
  });
});
