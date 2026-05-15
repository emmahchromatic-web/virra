import { modulateRunStructure } from '@/lib/cycleModulation';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

const baseStructure: RunWorkoutStructure = {
  version: 1,
  workout_type: 'tempo',
  total_distance_m: 8000,
  steps: [
    { id: 'a', kind: 'warmup',   target: { distance_m: 1500, pace_secs_per_km: 414, pace_band: 'easy' } },
    { id: 'b', kind: 'work',     target: { distance_m: 5200, pace_secs_per_km: 342, pace_band: 'tempo' } },
    { id: 'c', kind: 'cooldown', target: { distance_m: 1300, pace_secs_per_km: 414, pace_band: 'easy' } },
  ],
};

describe('modulateRunStructure', () => {
  test('returns adjusted structure with same step ids and shape', () => {
    const out = modulateRunStructure(baseStructure, 'follicular', 'natural');
    expect(out.adjusted.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(out.adjusted.workout_type).toBe('tempo');
  });

  test('ovulatory phase makes tempo work step faster (lower secs/km)', () => {
    // Tempo on ovulatory has intensity_delta_pct: +3 → pace shifts faster
    const out = modulateRunStructure(baseStructure, 'ovulatory', 'natural');
    const work = out.adjusted.steps.find((s) => s.kind === 'work')!;
    expect(work.target.pace_secs_per_km!).toBeLessThan(342);
  });

  test('luteal phase makes tempo work step slower (higher secs/km)', () => {
    const out = modulateRunStructure(baseStructure, 'luteal', 'natural');
    const work = out.adjusted.steps.find((s) => s.kind === 'work')!;
    expect(work.target.pace_secs_per_km!).toBeGreaterThan(342);
  });

  test('null phase leaves the structure unchanged and reason null', () => {
    const out = modulateRunStructure(baseStructure, null, 'natural');
    expect(out.reason).toBeNull();
    expect(out.adjusted.steps.find((s) => s.kind === 'work')!.target.pace_secs_per_km).toBe(342);
  });

  test('null profile defaults to natural and still modulates', () => {
    const out = modulateRunStructure(baseStructure, 'luteal', null);
    expect(out.reason).not.toBeNull();
  });

  test('hormonal profile yields no modulation (reason null)', () => {
    const out = modulateRunStructure(baseStructure, 'luteal', 'hormonal');
    expect(out.reason).toBeNull();
  });

  test('reason summarises across steps when any step is modulated', () => {
    const out = modulateRunStructure(baseStructure, 'luteal', 'natural');
    expect(typeof out.reason).toBe('string');
    expect(out.reason!.length).toBeGreaterThan(0);
  });
});

describe('modulateRunStructure — read-time integration', () => {
  test('modulateRunStructure applied to read-time structure produces faster work step in ovulatory', () => {
    const structure: RunWorkoutStructure = {
      version: 1 as const, workout_type: 'tempo' as const, total_distance_m: 8000,
      steps: [
        { id: 'a', kind: 'work' as const, target: { distance_m: 5200, pace_secs_per_km: 342, pace_band: 'tempo' as const } },
      ],
    };
    const { adjusted } = modulateRunStructure(structure, 'ovulatory', 'natural');
    expect(adjusted.steps[0].target.pace_secs_per_km!).toBeLessThan(342);
  });
});

describe('modulateRunStructure — repeat structures', () => {
  test('repeat sub_steps are modulated', () => {
    const intervalStructure: RunWorkoutStructure = {
      version: 1, workout_type: 'intervals', total_distance_m: 6800,
      steps: [
        { id: 'wu', kind: 'warmup', target: { distance_m: 1500, pace_secs_per_km: 414, pace_band: 'easy' } },
        { id: 'r1', kind: 'repeat', repeat_count: 4, target: {}, sub_steps: [
          { id: 'work1', kind: 'work', target: { distance_m: 800, pace_secs_per_km: 298, pace_band: 'vo2' } },
          { id: 'rest1', kind: 'rest', target: { distance_m: 200, pace_secs_per_km: 450, pace_band: 'recovery' } },
        ]},
        { id: 'cd', kind: 'cooldown', target: { distance_m: 1300, pace_secs_per_km: 414, pace_band: 'easy' } },
      ],
    };

    const out = modulateRunStructure(intervalStructure, 'luteal', 'natural');
    const repeat = out.adjusted.steps.find((s) => s.id === 'r1')!;
    expect(repeat.sub_steps).toHaveLength(2);
    const work = repeat.sub_steps!.find((s) => s.kind === 'work')!;
    // Luteal intervals: intensity_delta_pct -6 → pace slows
    expect(work.target.pace_secs_per_km!).toBeGreaterThan(298);
  });
});
