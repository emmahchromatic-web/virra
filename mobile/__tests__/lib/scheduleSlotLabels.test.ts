import { computeDefaultDayAssignment, type WeekSession } from '@/lib/scheduleGenerator';

// Card 311. The "Schedule your week" rows come from computeDefaultDayAssignment.
// Shapes below are the real ones: Path to parkrun is seeded by
// 20260910000000_walk_run_plan_templates.sql, Get Strong by
// 20260819010000_get_strong_plan_templates.sql, Gym 2x/week by
// 005_strength_plan_template.sql. Beginner 5K lives only in production; its
// shape here is what the plan screen showed on the simulator (easy weeks with a
// long run, tempo and intervals in the build, a race to finish).

const weeks = (lists: string[][]): WeekSession[] =>
  lists.map((sessions, i) => ({ week: i + 1, km: 10, label: 'Base', sessions }));

const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

const pathToParkrun = weeks([
  ...Array.from({ length: 8 }, () => ['run_walk', 'run_walk', 'run_walk']),
  ['run_walk', 'run_walk', 'race'],
]);

const beginner5k = weeks([
  ['easy', 'easy', 'long'],
  ['easy', 'easy', 'long'],
  ['easy', 'tempo', 'long'],
  ['easy', 'easy', 'long'],
  ['easy', 'intervals', 'long'],
  ['easy', 'tempo', 'long'],
  ['easy', 'intervals', 'long'],
  ['easy', 'easy', 'race'],
]);

describe('computeDefaultDayAssignment: run plans (card 311)', () => {
  it('never calls a weekly slot "race" when the race is only in the final week', () => {
    const slots = computeDefaultDayAssignment(pathToParkrun, 3);
    expect(labels(slots)).toEqual(['run_walk', 'run_walk', 'run_walk']);
    expect(slots.map((s) => s.key)).toEqual(['run_walk_0', 'run_walk_1', 'run_walk_2']);
    expect(slots.map((s) => s.day)).toEqual([0, 2, 5]);
  });

  it('puts the long run last, on the weekend day, not wherever it first appeared', () => {
    const slots = computeDefaultDayAssignment(beginner5k, 3);
    expect(labels(slots)).toEqual(['easy', 'tempo', 'long']);
    expect(slots[2].day).toBe(5);
  });

  it('keeps the long run when fewer sessions are asked for', () => {
    expect(labels(computeDefaultDayAssignment(beginner5k, 2))).toEqual(['easy', 'long']);
    expect(labels(computeDefaultDayAssignment(beginner5k, 1))).toEqual(['long']);
  });

  it('repeats the everyday sessions, not the long run, when more are asked for', () => {
    const slots = computeDefaultDayAssignment(beginner5k, 5);
    expect(labels(slots)).toEqual(['easy', 'tempo', 'intervals', 'easy', 'long']);
    expect(new Set(slots.map((s) => s.key)).size).toBe(5);
    expect(slots.filter((s) => s.label === 'long')).toHaveLength(1);
  });

  it('never offers "race" at any session count', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(labels(computeDefaultDayAssignment(pathToParkrun, n))).not.toContain('race');
      expect(labels(computeDefaultDayAssignment(beginner5k, n))).not.toContain('race');
    }
  });

  it('still has something to call a slot when a template is nothing but a race', () => {
    expect(labels(computeDefaultDayAssignment(weeks([['race']]), 1))).toEqual(['race']);
  });
});

// These pass against the code before card 311 too. Strength plans write
// slot.label as session_label and Get Strong maps it to an authored day, so
// they must not move.
describe('computeDefaultDayAssignment: strength is unchanged', () => {
  const getStrong3 = weeks(Array.from({ length: 12 }, () => ['push', 'pull', 'legs']));
  const gym2x = weeks([
    ['lower', 'upper'], ['lower', 'upper'], ['lower', 'upper'], ['strength'],
    ['lower', 'upper'], ['lower', 'upper'], ['lower', 'upper'], ['strength'],
  ]);

  it('Get Strong: one slot per authored day, in day order', () => {
    const slots = computeDefaultDayAssignment(getStrong3, 3);
    expect(slots).toEqual([
      { key: 'push_0', label: 'push', day: 0 },
      { key: 'pull_0', label: 'pull', day: 2 },
      { key: 'legs_0', label: 'legs', day: 5 },
    ]);
  });

  it('Gym 2x/week: lower, upper, then its deload label, as before', () => {
    expect(computeDefaultDayAssignment(gym2x, 2)).toEqual([
      { key: 'lower_0', label: 'lower', day: 0 },
      { key: 'upper_0', label: 'upper', day: 3 },
    ]);
    expect(labels(computeDefaultDayAssignment(gym2x))).toEqual(['lower', 'upper', 'strength']);
    expect(labels(computeDefaultDayAssignment(gym2x, 4))).toEqual(['lower', 'upper', 'strength', 'lower']);
  });
});
