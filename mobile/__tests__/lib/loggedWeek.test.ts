// Card 298. The free tier's "This week": what she did, from the activities table.
import { loggedWeekStates, modalityOf, weekDates } from '@/lib/loggedWeek';

// Built from local-time parts so the test means the same thing in any timezone.
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString();
const MONDAY = '2026-09-14';

describe('weekDates', () => {
  it('is seven local dates from the Monday, across a month boundary too', () => {
    expect(weekDates(MONDAY)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
    expect(weekDates('2026-09-28')[6]).toBe('2026-10-04');
  });
});

describe('modalityOf', () => {
  it('uses the activity type, and the sub type where the type is only "other"', () => {
    expect(modalityOf({ activity_type: 'run' })).toBe('run');
    expect(modalityOf({ activity_type: 'strength', sub_type: null })).toBe('strength');
    expect(modalityOf({ activity_type: 'other', sub_type: 'cycle' })).toBe('cycle');
    expect(modalityOf({ activity_type: 'other', sub_type: 'walk' })).toBe('hike');
    expect(modalityOf({ activity_type: 'other', sub_type: 'pilates' })).toBe('other');
  });
});

describe('loggedWeekStates', () => {
  it('an empty week is seven rest days, never "missed": nothing was asked of her', () => {
    const states = loggedWeekStates([], MONDAY);
    expect(states).toHaveLength(7);
    expect(states.every((s) => s.kind === 'rest')).toBe(true);
  });

  it('puts each activity on its own local day', () => {
    const states = loggedWeekStates([
      { activity_type: 'run',      started_at: at(2026, 9, 14) },       // Monday
      { activity_type: 'strength', started_at: at(2026, 9, 17, 18) },   // Thursday evening
    ], MONDAY);
    expect(states[0]).toEqual({ kind: 'completed', modality: 'run' });
    expect(states[3]).toEqual({ kind: 'completed', modality: 'strength' });
    expect(states[1].kind).toBe('rest');
  });

  it('two things on one day show as a double, run first', () => {
    const states = loggedWeekStates([
      { activity_type: 'yoga', started_at: at(2026, 9, 16, 7) },
      { activity_type: 'run',  started_at: at(2026, 9, 16, 18) },
    ], MONDAY);
    expect(states[2]).toEqual({ kind: 'completed_multi', a: 'run', b: 'yoga' });
  });

  it('ignores anything outside the week', () => {
    const states = loggedWeekStates([
      { activity_type: 'run', started_at: at(2026, 9, 13, 23) },   // Sunday before
      { activity_type: 'run', started_at: at(2026, 9, 21, 0) },    // Monday after
    ], MONDAY);
    expect(states.every((s) => s.kind === 'rest')).toBe(true);
  });

  it('a late-night run stays on the day she ran it', () => {
    const states = loggedWeekStates([{ activity_type: 'run', started_at: at(2026, 9, 20, 23) }], MONDAY);
    expect(states[6]).toEqual({ kind: 'completed', modality: 'run' });
  });
});
