import type {
  RunWorkoutStructure, RunWorkoutType, RunStep, PaceBand,
} from './workoutStructure';

export function inferWorkoutType(sessionLabel: string): RunWorkoutType {
  const L = sessionLabel.toLowerCase();
  if (L.includes('long'))                            return 'long';
  if (L.includes('tempo'))                           return 'tempo';
  if (L.includes('threshold'))                       return 'threshold';
  if (L.includes('interval') || L.includes('vo2'))   return 'intervals';
  if (L.includes('progression'))                     return 'progression';
  if (L.includes('race'))                            return 'race';
  if (L.includes('recovery'))                        return 'recovery';
  if (L.includes('run_walk') || L.includes('walk'))  return 'run_walk';
  if (L.includes('negative'))                        return 'negative_split';
  return 'easy';
}

// Bands come from the pace model, which expresses them as ratios of THRESHOLD
// pace. The multipliers that used to live here were applied to the runner's 5K
// pace, which made every prescribed pace too fast and the fast end worst of all
// — see card 228 and the header of paceModel.ts.
//
// `baseline_pace_secs` below is therefore threshold pace once the re-anchor
// migration has run. `user_profiles.baseline_anchor` records which it holds.
export { paceForBand } from '@/lib/runProgramme/paceModel';
import { paceForBand } from '@/lib/runProgramme/paceModel';

function makeIdFactory(): () => string {
  let i = 0;
  return () => `s${++i}`;
}

export interface GenerateRunInput {
  session_label:      string;
  baseline_pace_secs: number;
  distance_km:        number;
}

const WARMUP_M   = 1500;
const COOLDOWN_M = 1300;

// intervals branch constants
const INTERVAL_WORK_M         = 800;
const INTERVAL_REST_M         = 200;
const INTERVAL_REP_MIN        = 3;
const INTERVAL_REP_MAX        = 8;
const INTERVAL_MIN_REMAINING_M = 2000;

// run_walk branch constants
const RUN_WALK_RUN_S  = 240;
const RUN_WALK_WALK_S = 60;

function bandForType(t: RunWorkoutType): PaceBand {
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

export function generateRunStructure(input: GenerateRunInput): RunWorkoutStructure {
  const id = makeIdFactory();
  const type = inferWorkoutType(input.session_label);
  const totalM = Math.round(input.distance_km * 1000);

  if (type === 'race') {
    return {
      version: 1, workout_type: 'race', total_distance_m: totalM,
      steps: [{
        id: id(), kind: 'work', label: 'race effort',
        target: {
          distance_m: totalM,
          pace_band: bandForType('race'),
          pace_secs_per_km: paceForBand(input.baseline_pace_secs, bandForType('race')),
        },
      }],
    };
  }

  if (type === 'easy' || type === 'long' || type === 'recovery') {
    const useFrame = totalM >= 4000 && type !== 'recovery';
    const wu = useFrame ? Math.min(WARMUP_M,  Math.floor(totalM * 0.15)) : 0;
    const cd = useFrame ? Math.min(COOLDOWN_M, Math.floor(totalM * 0.15)) : 0;
    const workM = totalM - wu - cd;
    const band = bandForType(type);
    const steps: RunStep[] = [];
    if (wu > 0) {
      steps.push({
        id: id(), kind: 'warmup', label: 'warmup',
        target: { distance_m: wu, pace_band: 'easy',
                  pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
      });
    }
    steps.push({
      id: id(), kind: 'work', label: type === 'long' ? 'long run' : type,
      target: { distance_m: workM, pace_band: band,
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, band) },
    });
    if (cd > 0) {
      steps.push({
        id: id(), kind: 'cooldown', label: 'cooldown',
        target: { distance_m: cd, pace_band: 'easy',
                  pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
      });
    }
    return { version: 1, workout_type: type, total_distance_m: totalM, steps };
  }

  if (type === 'tempo' || type === 'threshold') {
    const wu = Math.min(WARMUP_M,  Math.floor(totalM * 0.18));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.16));
    const workM = totalM - wu - cd;
    const band = bandForType(type);
    return {
      version: 1, workout_type: type, total_distance_m: totalM,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work', label: type,
          target: { distance_m: workM, pace_band: band,
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, band) } },
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }

  if (type === 'intervals') {
    // total_distance_m is computed from the rep structure (warmup + repCount × (work+rest) + cooldown),
    // so it may differ from the input distance_km. Repeat count is bounded INTERVAL_REP_MIN..INTERVAL_REP_MAX.
    const wu = WARMUP_M;
    const cd = COOLDOWN_M;
    const remaining = Math.max(INTERVAL_MIN_REMAINING_M, totalM - wu - cd);
    const repCount = Math.max(
      INTERVAL_REP_MIN,
      Math.min(INTERVAL_REP_MAX, Math.round(remaining / (INTERVAL_WORK_M + INTERVAL_REST_M))),
    );
    const repeatDistance = repCount * (INTERVAL_WORK_M + INTERVAL_REST_M);
    const warmupStep: RunStep = {
      id: id(), kind: 'warmup', label: 'warmup',
      target: { distance_m: wu, pace_band: 'easy',
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
    };
    const repeatStep: RunStep = {
      id: id(), kind: 'repeat', repeat_count: repCount, target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: `${INTERVAL_WORK_M}m`,
          target: { distance_m: INTERVAL_WORK_M, pace_band: 'vo2',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'vo2') } },
        { id: id(), kind: 'rest', label: 'float',
          target: { distance_m: INTERVAL_REST_M, pace_band: 'recovery',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'recovery') } },
      ],
    };
    const cooldownStep: RunStep = {
      id: id(), kind: 'cooldown', label: 'cooldown',
      target: { distance_m: cd, pace_band: 'easy',
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
    };
    return {
      version: 1, workout_type: 'intervals',
      total_distance_m: wu + repeatDistance + cd,
      steps: [warmupStep, repeatStep, cooldownStep],
    };
  }

  if (type === 'progression') {
    const wu = Math.min(WARMUP_M, Math.floor(totalM * 0.15));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.15));
    const workTotal = totalM - wu - cd;
    const seg = Math.floor(workTotal / 3);
    const bands: PaceBand[] = ['easy', 'steady', 'tempo'];
    const workSteps: RunStep[] = bands.map((b, i) => ({
      id: id(), kind: 'work', label: `segment ${i + 1}`,
      target: { distance_m: i === 2 ? workTotal - seg * 2 : seg,
                pace_band: b,
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, b) },
    }));
    return {
      version: 1, workout_type: 'progression', total_distance_m: totalM,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        ...workSteps,
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
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
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work', label: 'first half',
          target: { distance_m: half, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work', label: 'second half',
          target: { distance_m: workTotal - half, pace_band: 'tempo',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'tempo') } },
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }

  if (type === 'run_walk') {
    // total_distance_m is derived from time × pace × reps, so it approximates input.distance_km but won't match exactly.
    const easyPace = paceForBand(input.baseline_pace_secs, 'easy');
    const runMperRep = (RUN_WALK_RUN_S / easyPace) * 1000;
    const reps = Math.max(3, Math.round(totalM / runMperRep));
    const repeatStep: RunStep = {
      id: id(), kind: 'repeat', repeat_count: reps, target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: 'run',
          target: { duration_s: RUN_WALK_RUN_S, pace_band: 'easy', pace_secs_per_km: easyPace } },
        { id: id(), kind: 'rest', label: 'walk',
          target: { duration_s: RUN_WALK_WALK_S, pace_band: 'recovery',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'recovery') } },
      ],
    };
    return {
      version: 1, workout_type: 'run_walk',
      total_distance_m: Math.round(runMperRep * reps),
      steps: [repeatStep],
    };
  }

  // Unreachable: all RunWorkoutType cases handled above.
  throw new Error(`generateRunStructure: unhandled workout_type ${type}`);
}
