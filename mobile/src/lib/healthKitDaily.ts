import { NativeModules } from 'react-native';

interface DailyStats {
  steps:        number;
  exerciseMins: number;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function getDailyStats(): Promise<DailyStats> {
  const HK = NativeModules.AppleHealthKit;
  if (!HK) return Promise.resolve({ steps: 0, exerciseMins: 0 });

  // getStepCount uses fetchSumOfSamplesOnDayForType → single { value } dict.
  const stepsPromise = new Promise<number>((resolve) => {
    HK.getStepCount({ date: new Date().toISOString() }, (err: unknown, res: { value?: number }) => {
      resolve(err || !res ? 0 : Math.round(res.value ?? 0));
    });
  });

  // getAppleExerciseTime uses fetchCumulativeSumStatisticsCollection → returns
  // an array of period-bucketed samples. Default unit is seconds, so pass
  // unit: 'minute' to get minutes directly, then sum the buckets for the day.
  const minsPromise = new Promise<number>((resolve) => {
    HK.getAppleExerciseTime(
      { startDate: startOfToday(), endDate: endOfToday(), unit: 'minute' },
      (err: unknown, res: unknown) => {
        if (err || !res) { resolve(0); return; }
        if (Array.isArray(res)) {
          const total = (res as { value?: number }[]).reduce(
            (sum, sample) => sum + (sample.value ?? 0),
            0,
          );
          resolve(Math.round(total));
          return;
        }
        // Fallback for any future library version returning a sum object.
        const v = (res as { value?: number }).value;
        resolve(v != null ? Math.round(v) : 0);
      },
    );
  });

  return Promise.all([stepsPromise, minsPromise]).then(([steps, exerciseMins]) => ({
    steps,
    exerciseMins,
  }));
}
