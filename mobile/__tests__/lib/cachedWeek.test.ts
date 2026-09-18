import { cachedWeekRows, mondayOfLocal } from '@/lib/cachedWeek';

describe('cachedWeekRows (card 295)', () => {
  const days = [
    { date: '2026-09-14', sessions: [{ id: 'a', session_label: 'EASY_RUN', modality: 'run', status: 'completed' }] },
    { date: '2026-09-15', sessions: [{ id: 'b', session_label: 'Upper', modality: 'strength', status: 'dropped' }] },
    { date: '2026-09-17', sessions: [
      { id: 'c', session_label: 'TEMPO', modality: 'run', status: 'planned' },
      { id: 'd', session_label: 'Deep Release', modality: 'mobility', status: 'moved' },
    ] },
  ];

  it('lists the live sessions with their weekday, and marks today', () => {
    const rows = cachedWeekRows(days, new Date(2026, 8, 17, 9));
    expect(rows.map((r) => [r.id, r.dayLabel, r.status, r.isToday])).toEqual([
      ['a', 'Mon', 'completed', false],
      ['c', 'Thu', 'planned',   true],
    ]);
  });

  it('is empty when nothing is saved', () => {
    expect(cachedWeekRows([{ date: '2026-09-14', sessions: [] }], new Date(2026, 8, 14))).toEqual([]);
  });
});

describe('mondayOfLocal', () => {
  it('gives the Monday of the week, Sunday belonging to the week before', () => {
    expect(mondayOfLocal(new Date(2026, 8, 17, 23, 30))).toBe('2026-09-14');
    expect(mondayOfLocal(new Date(2026, 8, 20, 0, 30))).toBe('2026-09-14');
    expect(mondayOfLocal(new Date(2026, 8, 21, 0, 5))).toBe('2026-09-21');
  });
});
