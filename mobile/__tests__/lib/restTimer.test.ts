import {
  startRest, restartRest, restRemainingSeconds, restProgress, shouldChime, formatRest,
} from '@/lib/restTimer';

const T0 = 1_700_000_000_000;

describe('restTimer', () => {
  describe('startRest', () => {
    it('sets an end time from the authored rest', () => {
      const r = startRest('e1', 'Barbell Box Squat', 120, T0);
      expect(r).toEqual({
        exerciseId: 'e1', exerciseName: 'Barbell Box Squat', totalSeconds: 120, endsAt: T0 + 120_000,
      });
    });

    it('returns null when the exercise has no rest, so mobility and activation never start one', () => {
      expect(startRest('e1', 'Squat & Reach', 0, T0)).toBeNull();
      expect(startRest('e1', 'Squat & Reach', NaN, T0)).toBeNull();
      expect(startRest('e1', 'Squat & Reach', -30, T0)).toBeNull();
    });
  });

  it('restartRest runs the full duration again from now', () => {
    const r = startRest('e1', 'Deadlift', 90, T0)!;
    expect(restartRest(r, T0 + 60_000)).toEqual({ ...r, endsAt: T0 + 60_000 + 90_000 });
  });

  describe('restRemainingSeconds', () => {
    const r = startRest('e1', 'Deadlift', 90, T0)!;

    it('rounds up so a fresh rest reads its full length', () => {
      expect(restRemainingSeconds(r, T0)).toBe(90);
      expect(restRemainingSeconds(r, T0 + 1)).toBe(90);
    });

    it('counts down against the clock', () => {
      expect(restRemainingSeconds(r, T0 + 30_000)).toBe(60);
      expect(restRemainingSeconds(r, T0 + 89_500)).toBe(1);
    });

    it('floors at zero, however long the app was away', () => {
      expect(restRemainingSeconds(r, T0 + 90_000)).toBe(0);
      expect(restRemainingSeconds(r, T0 + 10 * 60_000)).toBe(0);
    });

    it('is zero with no rest running', () => {
      expect(restRemainingSeconds(null, T0)).toBe(0);
    });
  });

  describe('restProgress', () => {
    const r = startRest('e1', 'Deadlift', 60, T0)!;

    it('runs 0 to 1 across the rest and clamps at both ends', () => {
      expect(restProgress(r, T0)).toBe(0);
      expect(restProgress(r, T0 + 30_000)).toBeCloseTo(0.5);
      expect(restProgress(r, T0 + 60_000)).toBe(1);
      expect(restProgress(r, T0 + 120_000)).toBe(1);
    });
  });

  describe('shouldChime', () => {
    const r = startRest('e1', 'Deadlift', 90, T0)!;   // ends at T0 + 90s

    it('sounds when the rest ended while the app was in the foreground', () => {
      expect(shouldChime(r, T0)).toBe(true);                 // active the whole time
      expect(shouldChime(r, T0 + 20_000)).toBe(true);        // came back before it ended
    });

    it('stays silent when the rest ran out while the user was in another app', () => {
      // Returned to the app after the rest was already due to end.
      expect(shouldChime(r, T0 + 120_000)).toBe(false);
    });
  });

  describe('formatRest', () => {
    it('formats as m:ss', () => {
      expect(formatRest(90)).toBe('1:30');
      expect(formatRest(60)).toBe('1:00');
      expect(formatRest(5)).toBe('0:05');
      expect(formatRest(0)).toBe('0:00');
      expect(formatRest(-3)).toBe('0:00');
    });
  });
});
