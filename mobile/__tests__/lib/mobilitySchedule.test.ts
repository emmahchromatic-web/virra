jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/store/sessionStore', () => ({ useSessionStore: { getState: () => ({ refresh: jest.fn() }) } }));

import {
  buildWeeklyRows,
  mondayOf,
  addDaysISO,
  weekdayOf,
  weekdayPlural,
  HORIZON_WEEKS,
} from '@/lib/mobilitySchedule';
import type { StrengthWorkoutStructureV2 } from '@/lib/workoutStructure';

const STRUCTURE: StrengthWorkoutStructureV2 = {
  version: 2,
  session_type: 'general',
  sections: [{ section: 'mobility', label: 'Mobility', exercises: [] }],
  estimated_minutes: 30,
};

/**
 * Card 264. "Deep Release every Sunday" becomes one planned row a week for the
 * next eight weeks. These pin the date arithmetic the calendar depends on:
 * Monday-start weeks, nothing in the past, week numbers counted from the block.
 */
describe('a weekly mobility session becomes planned rows', () => {
  // 2026-09-16 is a Wednesday.
  const WED = '2026-09-16';

  it('knows its weekdays, Monday first', () => {
    expect(mondayOf(WED)).toBe('2026-09-14');
    expect(mondayOf('2026-09-14')).toBe('2026-09-14');
    expect(mondayOf('2026-09-20')).toBe('2026-09-14'); // Sunday belongs to the week that began Monday
    expect(weekdayOf(WED)).toBe(2);
    expect(weekdayOf('2026-09-20')).toBe(6);
    expect(addDaysISO('2026-09-30', 1)).toBe('2026-10-01');
    expect(weekdayPlural(6)).toBe('Sundays');
  });

  it('writes the next eight Sundays, starting this week', () => {
    const rows = buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'Deep Release',
      structure: STRUCTURE, weekday: 6, from: WED, until: addDaysISO(WED, HORIZON_WEEKS * 7 - 1),
    });
    expect(rows).toHaveLength(8);
    expect(rows[0].scheduled_date).toBe('2026-09-20');
    expect(rows[7].scheduled_date).toBe('2026-11-08');
    expect(rows.every((r) => weekdayOf(r.scheduled_date) === 6)).toBe(true);
    expect(rows.every((r) => r.modality === 'mobility' && r.status === 'planned')).toBe(true);
    expect(rows[0].session_label).toBe('Deep Release');
    expect(rows[0].strength_structure).toBe(STRUCTURE);
  });

  it('never writes a day that has already passed this week', () => {
    // Monday chosen on a Wednesday: this week's Monday is gone, so next Monday is first.
    const rows = buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'Wake Up',
      structure: STRUCTURE, weekday: 0, from: WED, until: addDaysISO(WED, HORIZON_WEEKS * 7 - 1),
    });
    expect(rows[0].scheduled_date).toBe('2026-09-21');
    expect(rows.every((r) => r.scheduled_date >= WED)).toBe(true);
  });

  it('includes today when today is the chosen day', () => {
    const rows = buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'Wake Up',
      structure: STRUCTURE, weekday: 2, from: WED, until: addDaysISO(WED, 13),
    });
    expect(rows.map((r) => r.scheduled_date)).toEqual(['2026-09-16', '2026-09-23']);
  });

  it('numbers weeks from the Monday of the block start, so a top-up continues the count', () => {
    const until = addDaysISO(WED, HORIZON_WEEKS * 7 - 1);
    const first = buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'Deep Release',
      structure: STRUCTURE, weekday: 6, from: WED, until,
    });
    expect(first.map((r) => r.week_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Five weeks on, the top-up writes from the day after the last row.
    const topUp = buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'Deep Release',
      structure: STRUCTURE, weekday: 6,
      from: addDaysISO(first[7].scheduled_date, 1),
      until: addDaysISO(addDaysISO(WED, 35), HORIZON_WEEKS * 7 - 1),
    });
    expect(topUp[0].scheduled_date).toBe('2026-11-15');
    expect(topUp[0].week_number).toBe(9);
  });

  it('returns nothing when the window is already past', () => {
    expect(buildWeeklyRows({
      userId: 'u', blockId: 'b', blockStartsOn: WED, sessionName: 'x',
      structure: STRUCTURE, weekday: 6, from: WED, until: '2026-09-18',
    })).toEqual([]);
  });
});
