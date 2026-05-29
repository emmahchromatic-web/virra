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

  it('scales up when the runner is slower than expected', () => {
    expect(baselineEquivalentForRun(360, 435, easy5k, null, 'natural')).toBe(Math.round(360 * (435 / 414)));
  });
});

import { detectBaselineDrift, type CompletedRunSample } from '@/lib/baselineCalibration';

// Helper: a completed easy-5k run at a given actual pace, on a given date.
function sample(actual: number, date: string, label = 'easy'): CompletedRunSample {
  return {
    avg_pace_secs: actual,
    distance_m: 5000,
    elevation_gain_m: 10,
    phase_at_time: null,
    session_label: label,
    run_structure: {
      version: 1, workout_type: 'easy', total_distance_m: 5000,
      steps: [{ id: 'a', kind: 'work', target: { distance_m: 5000, pace_band: 'easy', pace_secs_per_km: 414 } }],
    },
    scheduled_date: date,
  };
}

const NO_GATES = {
  currentBaseline: 360,
  cycleProfile: 'natural' as const,
  today: '2026-05-28',
  lastAssessmentDate: null,
  snoozedUntil: null,
  breaks: [] as { start: string; end: string }[],
};

describe('detectBaselineDrift', () => {
  it('returns null below the minimum run count', () => {
    const samples = [sample(393, '2026-05-20'), sample(393, '2026-05-22'), sample(393, '2026-05-24')];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('fires "faster" when ≥4 consistent runs beat expected beyond threshold', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples });
    expect(v?.direction).toBe('faster');
    expect(v!.proposed).toBeLessThan(360);
    expect(v!.proposed).toBeGreaterThanOrEqual(345);
    expect(v!.wouldChangeUpcoming).toBe(false);
  });

  it('fires "slower" symmetrically', () => {
    const samples = [
      sample(440, '2026-05-10'), sample(438, '2026-05-14'),
      sample(442, '2026-05-18'), sample(439, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples });
    expect(v?.direction).toBe('slower');
    expect(v!.proposed).toBeGreaterThan(360);
  });

  it('returns null when the drift is below the magnitude threshold', () => {
    const samples = [
      sample(411, '2026-05-10'), sample(412, '2026-05-14'),
      sample(411, '2026-05-18'), sample(413, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('rejects a single outlier among neutral runs (consistency guard)', () => {
    const samples = [
      sample(340, '2026-05-10'),
      sample(414, '2026-05-14'), sample(414, '2026-05-18'), sample(414, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('respects cooldown', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples, lastAssessmentDate: '2026-05-23' })).toBeNull();
  });

  it('respects snooze', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples, snoozedUntil: '2026-06-10' })).toBeNull();
  });

  it('excludes recovery runs, short runs, and hilly runs from the sample set', () => {
    const recovery = sample(393, '2026-05-10', 'recovery');
    const short = { ...sample(393, '2026-05-14'), distance_m: 1000 };
    const hilly = { ...sample(393, '2026-05-18'), elevation_gain_m: 300 };
    const ok = sample(393, '2026-05-22');
    expect(detectBaselineDrift({ ...NO_GATES, samples: [recovery, short, hilly, ok] })).toBeNull();
  });

  it('suppresses a DOWNWARD verdict when the window is dominated by post-break runs', () => {
    const samples = [
      sample(440, '2026-05-10'), sample(438, '2026-05-14'),
      sample(442, '2026-05-18'), sample(439, '2026-05-22'),
    ];
    const v = detectBaselineDrift({
      ...NO_GATES, samples, breaks: [{ start: '2026-04-20', end: '2026-05-09' }],
    });
    expect(v).toBeNull();
  });

  it('sets wouldChangeUpcoming from the flag passed in', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples, hasUpcomingRuns: true });
    expect(v?.wouldChangeUpcoming).toBe(true);
  });
});
