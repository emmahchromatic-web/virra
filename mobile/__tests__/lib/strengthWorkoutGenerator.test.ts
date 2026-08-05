import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';
import { normalizeStrengthSessionType } from '@/lib/strengthTypes';

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

describe('normalizeStrengthSessionType', () => {
  test('maps friendly leg/lower labels to lower', () => {
    for (const label of ['Leg day', 'Leg Day', 'lower', 'Lower body', 'Glute focus', 'Squat session']) {
      expect(normalizeStrengthSessionType(label)).toBe('lower');
    }
  });

  test('maps upper-body labels to upper', () => {
    for (const label of ['Upper body', 'upper', 'Push day', 'Pull day', 'Arms & chest']) {
      expect(normalizeStrengthSessionType(label)).toBe('upper');
    }
  });

  test('"lower back" resolves to lower, not upper', () => {
    expect(normalizeStrengthSessionType('Lower back & core')).toBe('lower');
  });

  test('unknown / generic labels fall back to general', () => {
    for (const label of ['Full body', 'Strength', 'general', '', 'mystery', null, undefined]) {
      expect(normalizeStrengthSessionType(label)).toBe('general');
    }
  });
});

describe('generateStrengthStructure — defensive fallback', () => {
  test('an unmapped session_type falls back to general instead of throwing', () => {
    // Simulates a legacy row that slipped through without normalisation.
    const s = generateStrengthStructure({
      // @ts-expect-error deliberately passing a non-canonical key
      session_type: 'Leg day',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('general');
    expect(s.exercises.length).toBe(5);
  });

  test('a normalised friendly label produces a real structure end-to-end', () => {
    const s = generateStrengthStructure({
      session_type: normalizeStrengthSessionType('Leg day'),
      phase: 'luteal',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('lower');
    expect(s.exercises.length).toBe(5);
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
