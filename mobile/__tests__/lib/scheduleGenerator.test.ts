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
