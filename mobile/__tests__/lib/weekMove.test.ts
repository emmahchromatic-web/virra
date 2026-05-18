import { groupSessionsByDay, findRowAtY, isOverloaded, OVERLOAD_THRESHOLD } from '@/lib/weekMove';

describe('groupSessionsByDay', () => {
  it('buckets sessions by scheduled_date and includes empty arrays for empty days', () => {
    const weekDates = ['2026-05-18', '2026-05-19', '2026-05-20'];
    const rows = [
      { id: '1', scheduled_date: '2026-05-18' },
      { id: '2', scheduled_date: '2026-05-20' },
      { id: '3', scheduled_date: '2026-05-20' },
    ];
    expect(groupSessionsByDay(rows, weekDates)).toEqual({
      '2026-05-18': [rows[0]],
      '2026-05-19': [],
      '2026-05-20': [rows[1], rows[2]],
    });
  });

  it('preserves order within a day', () => {
    const weekDates = ['2026-05-18'];
    const rows = [
      { id: 'a', scheduled_date: '2026-05-18' },
      { id: 'b', scheduled_date: '2026-05-18' },
      { id: 'c', scheduled_date: '2026-05-18' },
    ];
    expect(groupSessionsByDay(rows, weekDates)['2026-05-18'].map((r: any) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('findRowAtY', () => {
  const bounds = {
    '2026-05-18': { top: 100, bottom: 200 },
    '2026-05-19': { top: 200, bottom: 300 },
    '2026-05-20': { top: 300, bottom: 400 },
  };

  it('returns the date whose bounds contain Y', () => {
    expect(findRowAtY(bounds, 150)).toBe('2026-05-18');
    expect(findRowAtY(bounds, 250)).toBe('2026-05-19');
    expect(findRowAtY(bounds, 350)).toBe('2026-05-20');
  });

  it('returns null when Y is above the first row', () => {
    expect(findRowAtY(bounds, 50)).toBeNull();
  });

  it('returns null when Y is below the last row', () => {
    expect(findRowAtY(bounds, 500)).toBeNull();
  });

  it('treats top edge as inside and bottom edge as outside', () => {
    expect(findRowAtY(bounds, 200)).toBe('2026-05-19');
  });
});

describe('isOverloaded', () => {
  it('returns false when no day exceeds the threshold', () => {
    const groups = { 'd1': [{ id: 'a' }, { id: 'b' }], 'd2': [{ id: 'c' }] };
    expect(isOverloaded(groups)).toBe(false);
  });

  it('returns true when any day exceeds the threshold', () => {
    const groups = { 'd1': [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    expect(isOverloaded(groups)).toBe(true);
  });

  it('uses threshold = 2', () => {
    expect(OVERLOAD_THRESHOLD).toBe(2);
  });
});
