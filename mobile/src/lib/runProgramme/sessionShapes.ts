import type {
  RunWorkoutStructure, RunWorkoutType, RunStep, PaceBand,
} from '@/lib/workoutStructure';
import { paceForBand } from './paceModel';
import type { RaceDistance } from './volumeCurve';
import type { WeekPhase, Difficulty } from './weekComposer';

/**
 * A session's shape: the steps, and the pace attached to each.
 *
 * The old generator built every session from fixed constants — intervals were
 * always 800m with 200m float, whatever the runner was training for. A 5K runner
 * and a marathon runner got identical rep sessions, which is not what either of
 * them needs. Here the rep menu, the recovery, the work volume and the tempo
 * shape all come from the goal, the phase and how hard the week is meant to be.
 *
 * The `general` goal reproduces the old behaviour exactly, so existing call
 * sites that have no goal to give keep the sessions they were producing.
 */

export interface SessionSpec {
  type:        RunWorkoutType;
  distanceKm:  number;
  /** Threshold pace, s/km. Every band is a ratio of it — see paceModel. */
  thresholdSecs: number;
  goal?:       RaceDistance;
  phase?:      WeekPhase;
  intensity?:  Difficulty;
  /**
   * Where this session sits on the walk-run ladder. Only meaningful for
   * `run_walk`; without it the original fixed 4-minutes-on, 1-minute-off is
   * used, which is what the legacy call sites expect.
   */
  walkRun?:    { runS: number; walkS: number };
}

const WARMUP_M   = 1500;
const COOLDOWN_M = 1300;

// run_walk branch constants, unchanged from the original generator
const RUN_WALK_RUN_S  = 240;
const RUN_WALK_WALK_S = 60;

const INTERVAL_REP_MIN         = 3;
const INTERVAL_REP_MAX         = 8;
const INTERVAL_MIN_REMAINING_M = 2000;

/**
 * Rep distances by goal and phase, in metres. Shorter reps sharpen speed;
 * longer ones build the specific endurance a longer race needs. Preference
 * order: the first entry that fits the session's work volume is used.
 */
const REP_MENU: Record<RaceDistance, Partial<Record<WeekPhase, number[]>>> = {
  '5k':          { base: [400, 600],        build: [800, 600],        peak: [1000, 800],  taper: [400] },
  '10k':         { base: [600, 800],        build: [1000, 800],       peak: [1200, 1000], taper: [600] },
  half_marathon: { base: [1000, 1200],      build: [1600, 1200],      peak: [2000, 1600], taper: [1000] },
  marathon:      { base: [1600, 1200],      build: [3000, 1600],      peak: [3000, 2000], taper: [1600] },
  ultra:         { base: [1600, 2000],      build: [3000, 2000],      peak: [3000],       taper: [1600] },
  // The original generator's single rep length, preserved.
  general:       { base: [800], build: [800], peak: [800], taper: [800], race: [800] },
};

/**
 * Recovery between reps, as a fraction of the rep distance. Short sharp work
 * needs proportionally more recovery than long threshold-paced reps.
 */
const RECOVERY_RATIO: Record<RaceDistance, number> = {
  '5k':          1.00,
  '10k':         0.50,
  half_marathon: 0.33,
  marathon:      0.25,
  ultra:         0.25,
  general:       0.25,   // 200m off an 800m rep, as before
};

/** Share of the session spent at work pace in a rep session. */
const WORK_SHARE: Record<Difficulty, number> = {
  comfortable:  0.20,
  balanced:     0.25,
  challenging:  0.30,
};

/** Nobody below advanced does more than this much hard work in one session. */
const MAX_WORK_M = 8000;

function makeIdFactory(): () => string {
  let i = 0;
  return () => `s${++i}`;
}

export function bandForType(t: RunWorkoutType): PaceBand {
  switch (t) {
    case 'easy':            return 'easy';
    case 'long':            return 'easy';
    case 'recovery':        return 'recovery';
    case 'tempo':           return 'tempo';
    case 'threshold':       return 'threshold';
    case 'intervals':       return 'vo2';
    case 'progression':     return 'steady';
    case 'race':            return 'threshold';
    case 'run_walk':        return 'easy';
    case 'negative_split':  return 'steady';
  }
}

/**
 * Rep length for this goal and phase. Menus are ordered by preference; the first
 * one the session is long enough to repeat properly wins, and if none fit, the
 * shortest is used rather than prescribing two reps of something enormous.
 */
export function repDistanceFor(
  goal:       RaceDistance,
  phase:      WeekPhase,
  availableM: number,
): number {
  const menu = REP_MENU[goal][phase] ?? REP_MENU[goal].build ?? [800];
  const fits = menu.find((rep) => availableM / rep >= INTERVAL_REP_MIN);
  return fits ?? menu[menu.length - 1];
}

export function buildRunSession(spec: SessionSpec): RunWorkoutStructure {
  const id        = makeIdFactory();
  const goal      = spec.goal      ?? 'general';
  const phase     = spec.phase     ?? 'build';
  const intensity = spec.intensity ?? 'balanced';
  const totalM    = Math.round(spec.distanceKm * 1000);
  const pace      = (band: PaceBand) => paceForBand(spec.thresholdSecs, band);
  const type      = spec.type;

  const step = (
    kind: RunStep['kind'], label: string, distance_m: number, band: PaceBand,
  ): RunStep => ({
    id: id(), kind, label,
    target: { distance_m, pace_band: band, pace_secs_per_km: pace(band) },
  });

  if (type === 'race') {
    return {
      version: 1, workout_type: 'race', total_distance_m: totalM,
      steps: [step('work', 'race effort', totalM, bandForType('race'))],
    };
  }

  if (type === 'easy' || type === 'long' || type === 'recovery') {
    const useFrame = totalM >= 4000 && type !== 'recovery';
    const wu = useFrame ? Math.min(WARMUP_M,  Math.floor(totalM * 0.15)) : 0;
    const cd = useFrame ? Math.min(COOLDOWN_M, Math.floor(totalM * 0.15)) : 0;
    const band = bandForType(type);
    const steps: RunStep[] = [];
    if (wu > 0) steps.push(step('warmup', 'warmup', wu, 'easy'));

    // A structured long run finishes at goal pace: the specific fitness a long
    // race needs is running steadily when already tired, and a plain long run
    // never asks for that. Build and peak only, and only for the long races.
    const wantsGoalPaceFinish =
      type === 'long' &&
      (phase === 'build' || phase === 'peak') &&
      (goal === 'half_marathon' || goal === 'marathon') &&
      totalM - wu - cd >= 8000;

    if (wantsGoalPaceFinish) {
      const workM   = totalM - wu - cd;
      const finishM = Math.round(workM * (phase === 'peak' ? 0.35 : 0.25));
      steps.push(step('work', 'steady', workM - finishM, band));
      steps.push(step('work', 'goal pace', finishM, 'steady'));
    } else {
      steps.push(step('work', type === 'long' ? 'long run' : type, totalM - wu - cd, band));
    }

    if (cd > 0) steps.push(step('cooldown', 'cooldown', cd, 'easy'));
    return { version: 1, workout_type: type, total_distance_m: totalM, steps };
  }

  if (type === 'tempo' || type === 'threshold') {
    const wu = Math.min(WARMUP_M,  Math.floor(totalM * 0.18));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.16));
    const workM = totalM - wu - cd;
    const band  = bandForType(type);

    // Cruise intervals: the same work broken into blocks, which lets a runner
    // hold a genuinely honest pace for longer than one continuous effort would.
    // Only when the session is long enough for the blocks to be worth it.
    const wantsCruise = intensity === 'challenging' && workM >= 6000 && goal !== 'general';

    if (wantsCruise) {
      const blocks    = workM >= 9000 ? 4 : 3;
      const blockM    = Math.floor(workM / blocks);
      const floatM    = Math.round(blockM * 0.20);
      // Built in positional order: step ids are assigned as they are created,
      // and the logger reads them in sequence.
      const warmup = step('warmup', 'warmup', wu, 'easy');
      const repeat: RunStep = {
        id: id(), kind: 'repeat', repeat_count: blocks, target: {},
        sub_steps: [
          step('work', `${(blockM / 1000).toFixed(1)}km`, blockM, band),
          step('rest', 'float', floatM, 'recovery'),
        ],
      };
      const cooldown = step('cooldown', 'cooldown', cd, 'easy');
      return {
        version: 1, workout_type: type,
        total_distance_m: wu + blocks * (blockM + floatM) + cd,
        steps: [warmup, repeat, cooldown],
      };
    }

    return {
      version: 1, workout_type: type, total_distance_m: totalM,
      steps: [
        step('warmup', 'warmup', wu, 'easy'),
        step('work', type, workM, band),
        step('cooldown', 'cooldown', cd, 'easy'),
      ],
    };
  }

  if (type === 'intervals') {
    const wu = WARMUP_M;
    const cd = COOLDOWN_M;
    const remaining = Math.max(INTERVAL_MIN_REMAINING_M, totalM - wu - cd);

    // How the rep count is decided differs by whether we know what the runner
    // is training for.
    //
    // With a goal, the session is sized by how much of it should be spent at
    // work pace — a quarter of a balanced session, less if the week is meant to
    // be comfortable — and the rep length comes from the goal's own menu.
    //
    // Without one, `general` reproduces the original generator exactly: reps and
    // their recoveries fill everything between the warmup and the cooldown. That
    // keeps existing call sites producing the sessions they already produce.
    const repM  = repDistanceFor(goal, phase, remaining);
    const restM = Math.max(100, Math.round(repM * RECOVERY_RATIO[goal]));

    const repCount = goal === 'general'
      ? Math.max(INTERVAL_REP_MIN, Math.min(INTERVAL_REP_MAX,
          Math.round(remaining / (repM + restM))))
      : Math.max(INTERVAL_REP_MIN, Math.min(INTERVAL_REP_MAX,
          Math.round(Math.min(remaining * WORK_SHARE[intensity], MAX_WORK_M) / repM)));

    const repeatDistance = repCount * (repM + restM);

    // Built in positional order: step ids are assigned as they are created, and
    // the logger walks them in sequence.
    const warmup = step('warmup', 'warmup', wu, 'easy');
    const repeat: RunStep = {
      id: id(), kind: 'repeat', repeat_count: repCount, target: {},
      sub_steps: [
        step('work', `${repM}m`, repM, 'vo2'),
        step('rest', 'float', restM, 'recovery'),
      ],
    };
    const cooldown = step('cooldown', 'cooldown', cd, 'easy');
    return {
      version: 1, workout_type: 'intervals',
      total_distance_m: wu + repeatDistance + cd,
      steps: [warmup, repeat, cooldown],
    };
  }

  if (type === 'progression') {
    const wu = Math.min(WARMUP_M, Math.floor(totalM * 0.15));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.15));
    const workTotal = totalM - wu - cd;
    const seg   = Math.floor(workTotal / 3);
    const bands: PaceBand[] = ['easy', 'steady', 'tempo'];
    return {
      version: 1, workout_type: 'progression', total_distance_m: totalM,
      steps: [
        step('warmup', 'warmup', wu, 'easy'),
        ...bands.map((b, i) =>
          step('work', `segment ${i + 1}`, i === 2 ? workTotal - seg * 2 : seg, b)),
        step('cooldown', 'cooldown', cd, 'easy'),
      ],
    };
  }

  if (type === 'negative_split') {
    const wu = Math.min(WARMUP_M, Math.floor(totalM * 0.12));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.12));
    const workTotal = totalM - wu - cd;
    const half = Math.floor(workTotal / 2);
    return {
      version: 1, workout_type: 'negative_split', total_distance_m: totalM,
      steps: [
        step('warmup', 'warmup', wu, 'easy'),
        step('work', 'first half', half, 'easy'),
        step('work', 'second half', workTotal - half, 'tempo'),
        step('cooldown', 'cooldown', cd, 'easy'),
      ],
    };
  }

  if (type === 'run_walk') {
    const runS  = spec.walkRun?.runS  ?? RUN_WALK_RUN_S;
    const walkS = spec.walkRun?.walkS ?? RUN_WALK_WALK_S;
    const easyPace   = pace('easy');
    const runMperRep = (runS / easyPace) * 1000;
    const reps       = Math.max(3, Math.round(totalM / runMperRep));
    const repeat: RunStep = {
      id: id(), kind: 'repeat', repeat_count: reps, target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: 'run',
          target: { duration_s: runS, pace_band: 'easy', pace_secs_per_km: easyPace } },
        ...(walkS > 0 ? [{ id: id(), kind: 'rest' as const, label: 'walk',
          target: { duration_s: walkS, pace_band: 'recovery' as const, pace_secs_per_km: pace('recovery') } }] : []),
      ],
    };
    return {
      version: 1, workout_type: 'run_walk',
      total_distance_m: Math.round(runMperRep * reps),
      steps: [repeat],
    };
  }

  // Unreachable: every RunWorkoutType is handled above.
  throw new Error(`buildRunSession: unhandled workout_type ${type}`);
}
