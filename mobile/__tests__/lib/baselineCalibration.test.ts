import {
  flattenRunSteps,
  expectedModulatedAvgPace,
  baselineEquivalentForRun,
} from '@/lib/baselineCalibration';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

// baseline 360 → easy band ×1.15 = 414/km over 5km, single easy step
const easy5k: RunWorkoutStructure = {
  version: 1,
  workout_type: 'easy',
  total_distance_m: 5000,
  steps: [
    { id: 'a', kind: 'work', label: 'easy', target: { distance_m: 5000, pace_band: 'easy', pace_secs_per_km: 414 } },
  ],
};

// intervals: 1km warmup easy (414) + 4×(800m vo2 @ 299 / 400m rest) + 1km cooldown
const intervals: RunWorkoutStructure = {
  version: 1,
  workout_type: 'intervals',
  total_distance_m: 1000 + 4 * 1200 + 1000,
  steps: [
    { id: 'w', kind: 'warmup', target: { distance_m: 1000, pace_band: 'easy', pace_secs_per_km: 414 } },
    {
      id: 'r', kind: 'repeat', repeat_count: 4,
      target: {},
      sub_steps: [
        { id: 'on', kind: 'work', target: { distance_m: 800, pace_band: 'vo2', pace_secs_per_km: 299 } },
        { id: 'off', kind: 'rest', target: { distance_m: 400, pace_band: 'recovery', pace_secs_per_km: 450 } },
      ],
    },
    { id: 'c', kind: 'cooldown', target: { distance_m: 1000, pace_band: 'easy', pace_secs_per_km: 414 } },
  ],
};

describe('flattenRunSteps', () => {
  it('expands repeats by repeat_count and keeps distance+pace pairs', () => {
    const flat = flattenRunSteps(intervals);
    expect(flat).toHaveLength(10);
    expect(flat.filter((s) => s.pace_secs_per_km === 299)).toHaveLength(4);
  });

  it('ignores steps without both distance and pace', () => {
    const s: RunWorkoutStructure = {
      version: 1, workout_type: 'easy', total_distance_m: 1000,
      steps: [{ id: 'x', kind: 'work', target: { duration_s: 600, pace_secs_per_km: 400 } }],
    };
    expect(flattenRunSteps(s)).toHaveLength(0);
  });
});

describe('expectedModulatedAvgPace', () => {
  it('returns the distance-weighted average pace with no phase modulation', () => {
    const avg = expectedModulatedAvgPace(easy5k, null, 'natural');
    expect(avg).toBe(414);
  });

  it('distance-weights across steps', () => {
    const avg = expectedModulatedAvgPace(intervals, null, 'natural');
    const expected = Math.round(
      (414 * 1000 + 299 * 800 * 4 + 450 * 400 * 4 + 414 * 1000) / (1000 + 800 * 4 + 400 * 4 + 1000),
    );
    expect(avg).toBe(expected);
  });

  it('returns null when no step carries a pace+distance pair', () => {
    const s: RunWorkoutStructure = {
      version: 1, workout_type: 'easy', total_distance_m: 0, steps: [],
    };
    expect(expectedModulatedAvgPace(s, null, 'natural')).toBeNull();
  });
});

describe('baselineEquivalentForRun', () => {
  it('returns current baseline when actual matches expected', () => {
    expect(baselineEquivalentForRun(360, 414, easy5k, null, 'natural')).toBe(360);
  });

  it('scales down when the runner is faster than expected', () => {
    expect(baselineEquivalentForRun(360, 393, easy5k, null, 'natural')).toBe(342);
  });

  it('returns null when expected pace cannot be computed', () => {
    const empty: RunWorkoutStructure = { version: 1, workout_type: 'easy', total_distance_m: 0, steps: [] };
    expect(baselineEquivalentForRun(360, 400, empty, null, 'natural')).toBeNull();
  });
});
