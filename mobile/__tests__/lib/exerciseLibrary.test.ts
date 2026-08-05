import { EXERCISE_LIBRARY, getExerciseMeta } from '@/lib/exerciseLibrary';

const ALL = Object.values(EXERCISE_LIBRARY).flat();

describe('exercise library content', () => {
  it('every exercise has a description, tempo and cues', () => {
    for (const ex of ALL) {
      expect(ex.description.length).toBeGreaterThan(10);
      expect(ex.tempo.length).toBeGreaterThan(0);
      expect(ex.cues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('exercise names are unique across the library', () => {
    const names = ALL.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('getExerciseMeta', () => {
  it('looks up content by exact exercise name', () => {
    const rdl = getExerciseMeta('Romanian Deadlift');
    expect(rdl?.tempo).toBe('3-1-1');
    expect(rdl?.cues.length).toBeGreaterThan(0);
  });

  it('resolves every name that appears in the library', () => {
    for (const ex of ALL) {
      expect(getExerciseMeta(ex.name)).toBe(ex);
    }
  });

  it('returns undefined for an unknown movement', () => {
    expect(getExerciseMeta('Moonwalk')).toBeUndefined();
  });
});
