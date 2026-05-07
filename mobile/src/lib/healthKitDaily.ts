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

  const opts = { startDate: startOfToday(), endDate: endOfToday() };

  const stepsPromise = new Promise<number>((resolve) => {
    HK.getStepCount(opts, (err: unknown, res: { value?: number }) => {
      resolve(err || !res ? 0 : Math.round(res.value ?? 0));
    });
  });

  const minsPromise = new Promise<number>((resolve) => {
    HK.getAppleExerciseTime(opts, (err: unknown, res: { value?: number }) => {
      resolve(err || !res ? 0 : Math.round(res.value ?? 0));
    });
  });

  return Promise.all([stepsPromise, minsPromise]).then(([steps, exerciseMins]) => ({
    steps,
    exerciseMins,
  }));
}
