import { weekStartLocal } from '@/lib/insightMetrics';

/**
 * Card 260. This is the only definition of "the runner's week" in the app.
 * The insight narrative now describes the window this returns, so a change
 * here silently changes what the narrative claims — which is the failure the
 * card is about, in the other direction.
 */

// Local time throughout: a runner's week starts when Monday starts where they
// are. Constructing with `new Date(y, m, d, h)` keeps these tests in whatever
// zone they run in, which is the behaviour under test.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('weekStartLocal', () => {
  it('returns the Monday of the current week', () => {
    // Thursday 10 September 2026 -> Monday 7 September.
    const start = weekStartLocal(at(2026, 9, 10));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(7);
    expect(start.getMonth()).toBe(8);
  });

  it('treats Monday as the start of its own week, not the previous one', () => {
    const monday = at(2026, 8, 31, 9);   // Monday 31 August 2026
    const start  = weekStartLocal(monday);
    expect(start.getDate()).toBe(31);
    expect(start.getMonth()).toBe(7);
  });

  it('keeps Sunday in the week that began six days earlier', () => {
    // The reason `(getDay() + 6) % 7` exists: JS Sunday is 0, and a naive
    // subtraction rolls Sunday forward into the week that has not started.
    const start = weekStartLocal(at(2026, 9, 6));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(31);
    expect(start.getMonth()).toBe(7);
  });

  it('starts at local midnight, not at the current time', () => {
    const start = weekStartLocal(at(2026, 9, 4, 23, 47));
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()])
      .toEqual([0, 0, 0, 0]);
  });

  it('crosses a month boundary', () => {
    // Wednesday 2 September 2026 -> Monday 31 August.
    const start = weekStartLocal(at(2026, 9, 2));
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(31);
  });

  it('crosses a year boundary', () => {
    // Friday 1 January 2027 -> Monday 28 December 2026.
    const start = weekStartLocal(at(2027, 1, 1));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(28);
  });

  it('is never in the future and never more than seven days back', () => {
    // The edge function rejects a boundary outside this range, so a value this
    // produces must always be inside it.
    for (let offset = 0; offset < 400; offset++) {
      const now   = new Date(2026, 0, 1 + offset, 13, 30);
      const start = weekStartLocal(now);
      const ageDays = (now.getTime() - start.getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThanOrEqual(0);
      expect(ageDays).toBeLessThan(7);
    }
  });

  it('gives every day of one week the same boundary', () => {
    // Monday 31 August 2026 through Sunday 6 September.
    const boundaries = new Set<number>();
    for (let offset = 0; offset < 7; offset++) {
      boundaries.add(weekStartLocal(at(2026, 8, 31 + offset)).getTime());
    }
    expect(boundaries.size).toBe(1);
  });

  it('does not mutate the date it is given', () => {
    const now  = at(2026, 9, 4, 15, 20);
    const copy = new Date(now.getTime());
    weekStartLocal(now);
    expect(now.getTime()).toBe(copy.getTime());
  });

  it('defaults to now when called with no argument', () => {
    const start = weekStartLocal();
    expect(start.getDay()).toBe(1);
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
