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

  // Three resolution paths, in order of preference:
  //   1. getActivitySummary — Apple's intended ring API; real-device path
  //   2. getAppleExerciseTime samples — third-party AppleExerciseTime writers
  //   3. Sum today's workout durations — covers iOS Simulator (no paired Watch
  //      means iOS doesn't auto-compute AppleExerciseTime from workouts) and
  //      any environment where workouts exist but exercise-time samples don't
  const minsPromise = new Promise<number>((resolve) => {
    const sumTodayWorkouts = () => {
      if (!HK.getAnchoredWorkouts) { resolve(0); return; }
      HK.getAnchoredWorkouts(
        { startDate: startOfToday(), endDate: endOfToday(), ascending: false },
        (err: unknown, results: { data?: { duration?: number; start?: string }[] } | null) => {
          if (err || !results?.data?.length) { resolve(0); return; }
          const todayISO = startOfToday();
          const total = results.data.reduce((sum, w) => {
            // duration is seconds; convert to minutes
            const mins = (w.duration ?? 0) / 60;
            // Defensive: only count workouts whose start lands today (the
            // query is meant to filter this already, but belt + braces)
            if (w.start && w.start >= todayISO) return sum + mins;
            return sum;
          }, 0);
          resolve(Math.round(total));
        },
      );
    };

    HK.getActivitySummary(
      { startDate: startOfToday(), endDate: endOfToday() },
      (summaryErr: unknown, summaryRes: unknown) => {
        if (!summaryErr && Array.isArray(summaryRes) && summaryRes.length > 0) {
          const total = (summaryRes as { appleExerciseTime?: number }[]).reduce(
            (sum, day) => sum + (day.appleExerciseTime ?? 0),
            0,
          );
          if (total > 0) { resolve(Math.round(total)); return; }
        }

        HK.getAppleExerciseTime(
          { startDate: startOfToday(), endDate: endOfToday(), unit: 'minute', includeManuallyAdded: true },
          (err: unknown, res: unknown) => {
            if (!err && res) {
              let total = 0;
              if (Array.isArray(res)) {
                total = (res as { value?: number }[]).reduce(
                  (sum, sample) => sum + (sample.value ?? 0),
                  0,
                );
              } else {
                total = (res as { value?: number }).value ?? 0;
              }
              if (total > 0) { resolve(Math.round(total)); return; }
            }
            // Final fallback: sum today's workout durations
            sumTodayWorkouts();
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
