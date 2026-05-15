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

describe('generateRunStructure — intervals', () => {
  test('intervals 8km produces a repeat with work/rest sub-steps', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.workout_type).toBe('intervals');
    const repeat = s.steps.find((st) => st.kind === 'repeat');
    expect(repeat).toBeDefined();
    expect(repeat!.repeat_count).toBeGreaterThanOrEqual(3);
    expect(repeat!.sub_steps).toHaveLength(2);
    expect(repeat!.sub_steps![0].kind).toBe('work');
    expect(repeat!.sub_steps![1].kind).toBe('rest');
  });

  test('intervals work step uses vo2 pace band', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    const repeat = s.steps.find((st) => st.kind === 'repeat')!;
    expect(repeat.sub_steps![0].target.pace_band).toBe('vo2');
  });

  test('intervals rest step uses recovery pace band', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    const repeat = s.steps.find((st) => st.kind === 'repeat')!;
    expect(repeat.sub_steps![1].target.pace_band).toBe('recovery');
  });

  test('intervals structure is wrapped by warmup + cooldown', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.steps[0].kind).toBe('warmup');
    expect(s.steps[s.steps.length - 1].kind).toBe('cooldown');
  });
});

describe('generateRunStructure — progression / negative_split', () => {
  test('progression 9km has three increasing-pace work segments', () => {
    const s = generateRunStructure({
      session_label: 'progression', baseline_pace_secs: 360, distance_km: 9,
    });
    expect(s.workout_type).toBe('progression');
    const works = s.steps.filter((st) => st.kind === 'work');
    expect(works).toHaveLength(3);
    const paces = works.map((w) => w.target.pace_secs_per_km!);
    expect(paces[1]).toBeLessThan(paces[0]);
    expect(paces[2]).toBeLessThan(paces[1]);
  });

  test('negative_split 12km has two halves, second faster than first', () => {
    const s = generateRunStructure({
      session_label: 'negative splits', baseline_pace_secs: 360, distance_km: 12,
    });
    expect(s.workout_type).toBe('negative_split');
    const works = s.steps.filter((st) => st.kind === 'work');
    expect(works).toHaveLength(2);
    expect(works[1].target.pace_secs_per_km!).toBeLessThan(works[0].target.pace_secs_per_km!);
  });
});
