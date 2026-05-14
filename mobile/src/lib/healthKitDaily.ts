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

  // Primary path: getActivitySummary returns the daily total exercise minutes
  // directly (Apple's intended ring API). Falls back to summing
  // getAppleExerciseTime samples if no activity summary exists (e.g. simulator
  // without a paired Watch, or third-party apps writing exercise time outside
  // the Activity Summary system).
  const minsPromise = new Promise<number>((resolve) => {
    HK.getActivitySummary(
      { startDate: startOfToday(), endDate: endOfToday() },
      (summaryErr: unknown, summaryRes: unknown) => {
        if (!summaryErr && Array.isArray(summaryRes) && summaryRes.length > 0) {
          const total = (summaryRes as { appleExerciseTime?: number }[]).reduce(
            (sum, day) => sum + (day.appleExerciseTime ?? 0),
            0,
          );
          if (total > 0) {
            resolve(Math.round(total));
            return;
          }
        }

        // Fallback to AppleExerciseTime samples
        HK.getAppleExerciseTime(
          { startDate: startOfToday(), endDate: endOfToday(), unit: 'minute', includeManuallyAdded: true },
          (err: unknown, res: unknown) => {
            if (err || !res) { resolve(0); return; }
            let total = 0;
            if (Array.isArray(res)) {
              total = (res as { value?: number }[]).reduce(
                (sum, sample) => sum + (sample.value ?? 0),
                0,
              );
            } else {
              total = (res as { value?: number }).value ?? 0;
            }
            resolve(Math.round(total));
          },
        );
      },
    );
  });

  return Promise.all([stepsPromise, minsPromise]).then(([steps, exerciseMins]) => ({
    steps,
    exerciseMins,
  }));
}
