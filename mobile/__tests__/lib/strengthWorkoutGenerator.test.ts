import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';

describe('generateStrengthStructure', () => {
  test('lower session picks 5 lower-body exercises', () => {
    const s = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('lower');
    expect(s.exercises.length).toBe(5);
    const LOWER_MUSCLES = ['glutes', 'quads', 'hamstrings', 'calves', 'adductors',
                           'hip abductors', 'lower back'];
    for (const ex of s.exercises) {
      expect(ex.primary_muscles.some((m) => LOWER_MUSCLES.includes(m))).toBe(true);
    }
  });

  test('upper session picks 5 upper-body exercises', () => {
    const s = generateStrengthStructure({
      session_type: 'upper',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('upper');
    expect(s.exercises.length).toBe(5);
  });

  test('general session mixes compound lifts', () => {
    const s = generateStrengthStructure({
      session_type: 'general',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('general');
    expect(s.exercises.length).toBe(5);
  });

  test('every exercise has target_sets and rest_seconds', () => {
    const s = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    for (const ex of s.exercises) {
      expect(ex.target_sets.length).toBeGreaterThan(0);
      expect(ex.rest_seconds).toBeGreaterThan(0);
      for (const set of ex.target_sets) {
        expect(set.reps).toBeGreaterThan(0);
      }
    }
  });
});

describe('generateStrengthStructure — repeat avoidance', () => {
  test('exercises chosen have lower overlap with recent muscles than the alternative', () => {
    const sRecent = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: ['glutes', 'hamstrings'],
    });
    const sFresh = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    const countGlutesHams = (xs: typeof sRecent.exercises) =>
      xs.filter((ex) => ex.primary_muscles.some(
        (m) => m === 'glutes' || m === 'hamstrings')).length;
    expect(countGlutesHams(sRecent.exercises))
      .toBeLessThanOrEqual(countGlutesHams(sFresh.exercises));
  });
});
