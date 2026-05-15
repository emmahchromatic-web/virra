import { inferWorkoutType } from '@/lib/runWorkoutGenerator';

describe('inferWorkoutType', () => {
  test('maps "easy" to easy', () => {
    expect(inferWorkoutType('easy')).toBe('easy');
  });
  test('maps "long run" to long', () => {
    expect(inferWorkoutType('long run')).toBe('long');
  });
  test('maps "tempo" to tempo', () => {
    expect(inferWorkoutType('tempo')).toBe('tempo');
  });
  test('maps "threshold" to threshold', () => {
    expect(inferWorkoutType('threshold')).toBe('threshold');
  });
  test('maps "intervals" or "vo2" to intervals', () => {
    expect(inferWorkoutType('intervals')).toBe('intervals');
    expect(inferWorkoutType('vo2 max')).toBe('intervals');
  });
  test('maps "progression" to progression', () => {
    expect(inferWorkoutType('progression run')).toBe('progression');
  });
  test('maps "race" to race', () => {
    expect(inferWorkoutType('race day')).toBe('race');
  });
  test('maps "recovery" to recovery', () => {
    expect(inferWorkoutType('recovery jog')).toBe('recovery');
  });
  test('falls back to easy', () => {
    expect(inferWorkoutType('shakeout')).toBe('easy');
  });
});

import { generateRunStructure } from '@/lib/runWorkoutGenerator';

describe('generateRunStructure — simple workouts', () => {
  test('easy 5km has warmup + steady + cooldown summing to 5km', () => {
    const s = generateRunStructure({
      session_label: 'easy', baseline_pace_secs: 360, distance_km: 5,
    });
    expect(s.workout_type).toBe('easy');
    expect(s.total_distance_m).toBe(5000);
    expect(s.steps.map((st) => st.kind)).toEqual(['warmup', 'work', 'cooldown']);
    const sum = s.steps.reduce((acc, st) => acc + (st.target.distance_m ?? 0), 0);
    expect(sum).toBe(5000);
  });

  test('long 18km uses easy pace band for work step', () => {
    const s = generateRunStructure({
      session_label: 'long', baseline_pace_secs: 360, distance_km: 18,
    });
    expect(s.workout_type).toBe('long');
    expect(s.total_distance_m).toBe(18000);
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('easy');
  });

  test('recovery 4km uses recovery band', () => {
    const s = generateRunStructure({
      session_label: 'recovery', baseline_pace_secs: 360, distance_km: 4,
    });
    expect(s.workout_type).toBe('recovery');
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('recovery');
  });

  test('race 10km is a single work step without warmup/cooldown', () => {
    const s = generateRunStructure({
      session_label: 'race', baseline_pace_secs: 360, distance_km: 10,
    });
    expect(s.workout_type).toBe('race');
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].kind).toBe('work');
    expect(s.steps[0].target.distance_m).toBe(10000);
  });
});

describe('generateRunStructure — tempo and threshold', () => {
  test('tempo 8km is warmup + tempo block + cooldown', () => {
    const s = generateRunStructure({
      session_label: 'tempo', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.workout_type).toBe('tempo');
    expect(s.steps.map((st) => st.kind)).toEqual(['warmup', 'work', 'cooldown']);
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('tempo');
    expect(work?.target.pace_secs_per_km).toBeLessThan(360);
  });

  test('threshold 8km uses threshold pace band', () => {
    const s = generateRunStructure({
      session_label: 'threshold', baseline_pace_secs: 360, distance_km: 8,
    });
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('threshold');
  });
});
