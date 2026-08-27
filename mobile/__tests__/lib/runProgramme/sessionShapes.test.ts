import { buildRunSession, repDistanceFor, type SessionSpec } from '@/lib/runProgramme/sessionShapes';
import { generateRunStructure } from '@/lib/runWorkoutGenerator';
import type { RunStep } from '@/lib/workoutStructure';

const THRESHOLD = 315; // a 25:00 5K runner

const spec = (over: Partial<SessionSpec> = {}): SessionSpec => ({
  type: 'intervals', distanceKm: 10, thresholdSecs: THRESHOLD, ...over,
});

/** Every leaf step, with repeats expanded. */
function leaves(steps: RunStep[]): RunStep[] {
  return steps.flatMap((s) =>
    s.kind === 'repeat' && s.sub_steps
      ? Array.from({ length: s.repeat_count ?? 1 }, () => leaves(s.sub_steps!)).flat()
      : [s],
  );
}

function workMetres(steps: RunStep[]): number {
  return leaves(steps).filter((s) => s.kind === 'work').reduce((a, s) => a + (s.target.distance_m ?? 0), 0);
}

describe('the general pack reproduces the old generator', () => {
  // The legacy call sites pass no goal, and must keep getting what they got.
  it('produces identical output through both entry points', () => {
    for (const label of ['easy', 'long', 'tempo', 'threshold', 'intervals', 'progression', 'recovery', 'run_walk', 'negative split', 'race']) {
      const viaLegacy = generateRunStructure({ session_label: label, baseline_pace_secs: THRESHOLD, distance_km: 10 });
      const viaSpec   = buildRunSession(spec({ type: viaLegacy.workout_type, distanceKm: 10, goal: 'general' }));
      expect(viaSpec).toEqual(viaLegacy);
    }
  });

  it('still uses 800m reps with a 200m float when no goal is known', () => {
    const s = buildRunSession(spec({ goal: 'general' }));
    const repeat = s.steps.find((x) => x.kind === 'repeat')!;
    expect(repeat.sub_steps![0].target.distance_m).toBe(800);
    expect(repeat.sub_steps![1].target.distance_m).toBe(200);
  });
});

describe('repDistanceFor', () => {
  it('gives a 5K plan shorter reps than a marathon plan', () => {
    expect(repDistanceFor('5k', 'build', 8000)).toBeLessThan(repDistanceFor('marathon', 'build', 8000));
  });

  it('lengthens reps from base to peak within a goal', () => {
    expect(repDistanceFor('10k', 'peak', 8000)).toBeGreaterThan(repDistanceFor('10k', 'base', 8000));
  });

  it('drops to a shorter rep when the session cannot hold the preferred one', () => {
    // 3000m reps need a big session; a small one should not get two of them.
    expect(repDistanceFor('marathon', 'build', 3000)).toBeLessThan(3000);
  });

  it('falls back rather than returning undefined for a tiny session', () => {
    expect(repDistanceFor('marathon', 'build', 100)).toBeGreaterThan(0);
  });
});

describe('intervals are shaped by the goal', () => {
  it('gives a 5K runner short reps and a marathon runner long ones', () => {
    const fiveK    = buildRunSession(spec({ goal: '5k',      phase: 'build' }));
    const marathon = buildRunSession(spec({ goal: 'marathon', phase: 'build' }));
    const rep = (s: typeof fiveK) => s.steps.find((x) => x.kind === 'repeat')!.sub_steps![0].target.distance_m!;
    expect(rep(fiveK)).toBeLessThan(rep(marathon));
  });

  it('gives short-race reps proportionally more recovery', () => {
    const ratio = (goal: '5k' | 'marathon') => {
      const s = buildRunSession(spec({ goal, phase: 'build' }));
      const sub = s.steps.find((x) => x.kind === 'repeat')!.sub_steps!;
      return sub[1].target.distance_m! / sub[0].target.distance_m!;
    };
    expect(ratio('5k')).toBeGreaterThan(ratio('marathon'));
  });

  it('does more work in a challenging session than a comfortable one', () => {
    // Needs a session with room for the difference to show — see the next test.
    const easy = buildRunSession(spec({ goal: '10k', intensity: 'comfortable', distanceKm: 16 }));
    const hard = buildRunSession(spec({ goal: '10k', intensity: 'challenging', distanceKm: 16 }));
    expect(workMetres(hard.steps)).toBeGreaterThan(workMetres(easy.steps));
  });

  it('falls back to the minimum rep count on a small session, whatever the intensity', () => {
    // A 10km session has room for three 1000m reps and not much else, so the
    // floor binds and intensity cannot express itself. That is the right
    // answer — three reps is a real session — but it is worth pinning down so
    // nobody reads the intensity setting as broken.
    const easy = buildRunSession(spec({ goal: '10k', intensity: 'comfortable', distanceKm: 10 }));
    const hard = buildRunSession(spec({ goal: '10k', intensity: 'challenging', distanceKm: 10 }));
    expect(easy.steps.find((x) => x.kind === 'repeat')!.repeat_count).toBe(3);
    expect(hard.steps.find((x) => x.kind === 'repeat')!.repeat_count).toBe(3);
  });

  it('always keeps a warmup and a cooldown around the reps', () => {
    for (const goal of ['5k', '10k', 'half_marathon', 'marathon'] as const) {
      const s = buildRunSession(spec({ goal }));
      expect(s.steps[0].kind).toBe('warmup');
      expect(s.steps[s.steps.length - 1].kind).toBe('cooldown');
    }
  });

  it('numbers steps in positional order', () => {
    // The logger walks step ids in sequence, so they must be created in the
    // order they appear rather than the order the code happens to build them.
    const s = buildRunSession(spec({ goal: '10k' }));
    expect(s.steps[0].id).toBe('s1');
    expect(s.steps[1].id).toBe('s2');
    expect(s.steps[1].sub_steps![0].id).toBe('s3');
    expect(s.steps[1].sub_steps![1].id).toBe('s4');
    expect(s.steps[2].id).toBe('s5');
  });

  it('never asks for fewer than three or more than eight reps', () => {
    for (const goal of ['5k', '10k', 'half_marathon', 'marathon'] as const) {
      for (const km of [4, 8, 12, 20]) {
        const s = buildRunSession(spec({ goal, distanceKm: km }));
        const n = s.steps.find((x) => x.kind === 'repeat')!.repeat_count!;
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('tempo sessions', () => {
  it('stays one continuous effort at balanced intensity', () => {
    const s = buildRunSession(spec({ type: 'tempo', goal: '10k', intensity: 'balanced', distanceKm: 12 }));
    expect(s.steps.some((x) => x.kind === 'repeat')).toBe(false);
  });

  it('breaks into cruise intervals when the week is meant to be challenging', () => {
    const s = buildRunSession(spec({ type: 'tempo', goal: '10k', intensity: 'challenging', distanceKm: 12 }));
    expect(s.steps.some((x) => x.kind === 'repeat')).toBe(true);
  });

  it('stays continuous for a short session even when challenging', () => {
    const s = buildRunSession(spec({ type: 'tempo', goal: '10k', intensity: 'challenging', distanceKm: 6 }));
    expect(s.steps.some((x) => x.kind === 'repeat')).toBe(false);
  });

  it('never breaks up a general-pack tempo, preserving legacy behaviour', () => {
    const s = buildRunSession(spec({ type: 'tempo', goal: 'general', intensity: 'challenging', distanceKm: 12 }));
    expect(s.steps.some((x) => x.kind === 'repeat')).toBe(false);
  });
});

describe('long runs', () => {
  it('finishes at goal pace during a marathon build', () => {
    const s = buildRunSession(spec({ type: 'long', goal: 'marathon', phase: 'build', distanceKm: 24 }));
    expect(s.steps.map((x) => x.label)).toContain('goal pace');
  });

  it('puts more of the run at goal pace in peak than in build', () => {
    const share = (phase: 'build' | 'peak') => {
      const s = buildRunSession(spec({ type: 'long', goal: 'marathon', phase, distanceKm: 24 }));
      return s.steps.find((x) => x.label === 'goal pace')!.target.distance_m!;
    };
    expect(share('peak')).toBeGreaterThan(share('build'));
  });

  it('leaves a 5K plan\'s long run plain', () => {
    const s = buildRunSession(spec({ type: 'long', goal: '5k', phase: 'build', distanceKm: 12 }));
    expect(s.steps.map((x) => x.label)).not.toContain('goal pace');
  });

  it('leaves a base-phase long run plain', () => {
    const s = buildRunSession(spec({ type: 'long', goal: 'marathon', phase: 'base', distanceKm: 24 }));
    expect(s.steps.map((x) => x.label)).not.toContain('goal pace');
  });

  it('leaves a short long run plain, whatever the phase', () => {
    const s = buildRunSession(spec({ type: 'long', goal: 'marathon', phase: 'peak', distanceKm: 8 }));
    expect(s.steps.map((x) => x.label)).not.toContain('goal pace');
  });
});

describe('every session type builds something coherent', () => {
  const types = ['easy', 'long', 'tempo', 'threshold', 'intervals', 'progression', 'race', 'recovery', 'run_walk', 'negative_split'] as const;

  it('produces steps with positive distances for every type and goal', () => {
    for (const type of types) {
      for (const goal of ['5k', '10k', 'half_marathon', 'marathon', 'general'] as const) {
        const s = buildRunSession(spec({ type, goal, distanceKm: 10 }));
        expect(s.steps.length).toBeGreaterThan(0);
        expect(s.total_distance_m).toBeGreaterThan(0);
        for (const leaf of leaves(s.steps)) {
          const hasDistance = (leaf.target.distance_m ?? 0) > 0;
          const hasDuration = (leaf.target.duration_s ?? 0) > 0;
          expect(hasDistance || hasDuration).toBe(true);
        }
      }
    }
  });

  it('attaches a pace to every step that carries one', () => {
    for (const type of types) {
      const s = buildRunSession(spec({ type, goal: '10k', distanceKm: 10 }));
      for (const leaf of leaves(s.steps)) {
        if (leaf.target.pace_band) expect(leaf.target.pace_secs_per_km).toBeGreaterThan(0);
      }
    }
  });
});
