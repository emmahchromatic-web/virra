export type FitnessLevel = 'beginner' | 'recreational' | 'intermediate' | 'advanced';
export type WeeklyMileageBracket = '<5' | '5-15' | '15-30' | '30+';

// ---- Pure derivation (unit-tested) ----

export function deriveFitnessLevel(avgPaceSeconds: number | null): FitnessLevel | null {
  if (avgPaceSeconds === null) return null;
  if (avgPaceSeconds < 300) return 'advanced';
  if (avgPaceSeconds < 390) return 'intermediate';
  if (avgPaceSeconds < 480) return 'recreational';
  return 'beginner';
}

export function deriveWeeklyMileageBracket(weeklyKm: number | null): WeeklyMileageBracket | null {
  if (weeklyKm === null) return null;
  if (weeklyKm < 5)  return '<5';
  if (weeklyKm < 15) return '5-15';
  if (weeklyKm < 30) return '15-30';
  return '30+';
}

export function estimateCycleLength(periodStartDates: Date[]): number | null {
  if (periodStartDates.length < 2) return null;
  const sorted = [...periodStartDates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round(
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    );
    intervals.push(days);
  }
  const avg = Math.round(intervals.reduce((s, n) => s + n, 0) / intervals.length);
  return Math.min(40, Math.max(21, avg));
}

// ---- HK IO wrappers (device-only, not unit-tested) ----

export interface HKFitnessData {
  avgPaceSeconds: number | null;
  weeklyKm:       number | null;
  best5kSeconds:  number | null;
}

export interface HKGoalData {
  best5kSeconds:       number | null;
  best10kSeconds:      number | null;
  bestHalfSeconds:     number | null;
  bestMarathonSeconds: number | null;
}

export interface HKCycleData {
  lastPeriodStart:      Date | null;
  estimatedCycleLength: number | null;
}

export async function fetchHKFitnessData(): Promise<HKFitnessData> {
  const empty: HKFitnessData = { avgPaceSeconds: null, weeklyKm: null, best5kSeconds: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health');
    if (!AppleHealthKit?.getAnchoredWorkouts) return empty;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return new Promise((resolve) => {
      AppleHealthKit.getAnchoredWorkouts(
        { startDate: ninetyDaysAgo.toISOString(), ascending: false },
        (err: any, results: { anchor: string; data: any[] }) => {
          if (err || !results?.data?.length) return resolve(empty);
          const runs = results.data.filter(
            (r) => r.activityName === AppleHealthKit.Constants.Activities.Running && r.distance > 0 && r.duration > 0
          );
          if (!runs.length) return resolve(empty);
          // Pace: duration (seconds) / distance (miles → km)
          const avgPace = runs.reduce((s, r) => s + r.duration / (r.distance * 1.60934), 0) / runs.length;
          // Weekly km over last 8 weeks
          const eightWeeksAgo = Date.now() - 56 * 24 * 60 * 60 * 1000;
          const recentRuns = runs.filter((r) => new Date(r.start).getTime() > eightWeeksAgo);
          const totalKm = recentRuns.reduce((s, r) => s + r.distance * 1.60934, 0);
          const weeklyKm = recentRuns.length ? totalKm / 8 : null;
          // Best 5K: runs within 5K distance range (2.9–3.3 miles)
          const nearFiveK = runs.filter((r) => r.distance >= 2.9 && r.distance <= 3.3);
          const best5k = nearFiveK.length ? Math.min(...nearFiveK.map((r) => r.duration)) : null;
          resolve({
            avgPaceSeconds: Math.round(avgPace),
            weeklyKm:       weeklyKm ? Math.round(weeklyKm * 10) / 10 : null,
            best5kSeconds:  best5k ? Math.round(best5k) : null,
          });
        }
      );
    });
  } catch {
    return empty;
  }
}

export async function fetchHKGoalData(): Promise<HKGoalData> {
  const empty: HKGoalData = {
    best5kSeconds: null, best10kSeconds: null, bestHalfSeconds: null, bestMarathonSeconds: null,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health');
    if (!AppleHealthKit?.getAnchoredWorkouts) return empty;
    return new Promise((resolve) => {
      AppleHealthKit.getAnchoredWorkouts(
        { startDate: new Date(0).toISOString(), ascending: false },
        (err: any, results: { anchor: string; data: any[] }) => {
          if (err || !results?.data?.length) return resolve(empty);
          const runs = results.data.filter(
            (r) => r.activityName === AppleHealthKit.Constants.Activities.Running && r.distance > 0
          );
          // Distance ranges in miles (with generous GPS tolerance)
          const best = (minMi: number, maxMi: number) => {
            const m = runs.filter((r) => r.distance >= minMi && r.distance <= maxMi);
            return m.length ? Math.min(...m.map((r) => r.duration)) : null;
          };
          resolve({
            best5kSeconds:       best(2.9, 3.3),
            best10kSeconds:      best(5.8, 6.6),
            bestHalfSeconds:     best(12.5, 13.7),
            bestMarathonSeconds: best(25.0, 27.5),
          });
        }
      );
    });
  } catch {
    return empty;
  }
}

// react-native-health v1.19 does not expose menstrual flow data.
// Cycle pre-fill from HealthKit is not available — users enter this manually.
export async function fetchHKCycleData(): Promise<HKCycleData> {
  return { lastPeriodStart: null, estimatedCycleLength: null };
}
