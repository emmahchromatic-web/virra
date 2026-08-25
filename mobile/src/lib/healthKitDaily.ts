import { hkSum, hkWorkouts } from './healthKitBridge';

interface DailyStats {
  steps:        number;
  exerciseMins: number;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Exercise minutes, in order of preference:
 *   1. AppleExerciseTime, summed. On a real device with a paired Watch this is
 *      what fills Apple's ring, so it matches the Fitness app.
 *   2. Sum of today's workout durations. Covers the Simulator, where no paired
 *      Watch means iOS never computes AppleExerciseTime from workouts, and any
 *      account where workouts exist but exercise-time samples do not.
 *
 * The old first choice was getActivitySummary, Apple's ring aggregate. The new
 * library has no equivalent: HKActivitySummaryType is exposed for
 * authorization only. Summing the AppleExerciseTime samples directly is the
 * same number by a shorter route, and unlike the ring aggregate it does not
 * need a paired Watch to exist at all. Card 216.
 */
async function exerciseMinutes(): Promise<number> {
  const start = startOfToday();
  const end   = endOfToday();

  const fromSamples = await hkSum('HKQuantityTypeIdentifierAppleExerciseTime', {
    start, end, unit: 'min',
  });
  if (fromSamples > 0) return Math.round(fromSamples);

  const { workouts } = await hkWorkouts({ start, end });
  if (workouts.length === 0) return 0;

  const startISO = start.toISOString();
  const total = workouts.reduce((sum, w) => {
    // duration is seconds: convert to minutes. Defensive on the start date
    // because the query is meant to have filtered this already.
    if (w.start && w.start >= startISO) return sum + (w.duration ?? 0) / 60;
    return sum;
  }, 0);

  return Math.round(total);
}

export async function getDailyStats(): Promise<DailyStats> {
  const [steps, exerciseMins] = await Promise.all([
    hkSum('HKQuantityTypeIdentifierStepCount', { start: startOfToday(), end: endOfToday(), unit: 'count' })
      .then((v) => Math.round(v)),
    exerciseMinutes(),
  ]);

  return { steps, exerciseMins };
}
