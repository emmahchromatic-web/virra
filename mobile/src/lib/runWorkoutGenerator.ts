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

const PACE_MULT: Record<PaceBand, number> = {
  recovery:  1.25,
  easy:      1.15,
  steady:    1.05,
  tempo:     0.95,
  threshold: 0.90,
  vo2:       0.83,
};

export function paceForBand(baselineSecsPerKm: number, band: PaceBand): number {
  return Math.round(baselineSecsPerKm * PACE_MULT[band]);
}

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
    const wu = WARMUP_M;
    const cd = COOLDOWN_M;
    const remaining = Math.max(2000, totalM - wu - cd);
    const workRep = 800;
    const restRep = 200;
    const repCount = Math.max(3, Math.min(8, Math.round(remaining / (workRep + restRep))));
    const repeatStep: RunStep = {
      id: id(), kind: 'repeat', repeat_count: repCount, target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: `${workRep}m`,
          target: { distance_m: workRep, pace_band: 'vo2',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'vo2') } },
        { id: id(), kind: 'rest', label: 'float',
          target: { distance_m: restRep, pace_band: 'recovery',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'recovery') } },
      ],
    };
    const repeatDistance = repCount * (workRep + restRep);
    return {
      version: 1, workout_type: 'intervals',
      total_distance_m: wu + repeatDistance + cd,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        repeatStep,
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
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

  // Unreachable — all RunWorkoutType cases handled above.
  throw new Error(`generateRunStructure: unhandled workout_type ${type}`);
}
