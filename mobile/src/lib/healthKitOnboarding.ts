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
    const AppleHealthKit = require('react-native-health').default;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return new Promise((resolve) => {
      AppleHealthKit.getSamples(
        { type: 'Running', startDate: ninetyDaysAgo.toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const withDistance = results.filter(r => r.distance > 0);
          const avgPace = withDistance.length
            ? withDistance.reduce((s, r) => s + (r.duration / 60) / (r.distance / 1000), 0)
              / withDistance.length * 60
            : null;
          const eightWeeksAgo = Date.now() - 56 * 24 * 60 * 60 * 1000;
          const recentRuns = results.filter(r => new Date(r.startDate).getTime() > eightWeeksAgo);
          const totalKm = recentRuns.reduce((s, r) => s + (r.distance ?? 0) / 1000, 0);
          const weeklyKm = recentRuns.length ? totalKm / 8 : null;
          const nearFiveK = results.filter(r => r.distance >= 4800 && r.distance <= 5200);
          const best5k = nearFiveK.length ? Math.min(...nearFiveK.map(r => r.duration)) : null;
          resolve({
            avgPaceSeconds: avgPace ? Math.round(avgPace) : null,
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
    best5kSeconds: null,
    best10kSeconds: null,
    bestHalfSeconds: null,
    bestMarathonSeconds: null,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default;
    return new Promise((resolve) => {
      AppleHealthKit.getSamples(
        { type: 'Running', startDate: new Date(0).toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const best = (min: number, max: number) => {
            const m = results.filter(r => r.distance >= min && r.distance <= max);
            return m.length ? Math.min(...m.map(r => r.duration)) : null;
          };
          resolve({
            best5kSeconds:       best(4800, 5200),
            best10kSeconds:      best(9800, 10200),
            bestHalfSeconds:     best(21000, 21200),
            bestMarathonSeconds: best(42100, 42300),
          });
        }
      );
    });
  } catch {
    return empty;
  }
}

export async function fetchHKCycleData(): Promise<HKCycleData> {
  const empty: HKCycleData = { lastPeriodStart: null, estimatedCycleLength: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleHealthKit = require('react-native-health').default;
    return new Promise((resolve) => {
      AppleHealthKit.getMenstrualFlowSamples(
        { startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), ascending: false },
        (err: Error | null, results: any[]) => {
          if (err || !results?.length) return resolve(empty);
          const startDates = results
            .filter((r) => r.value === 1)
            .map((r) => new Date(r.startDate))
            .sort((a, b) => b.getTime() - a.getTime());
          resolve({
            lastPeriodStart:      startDates[0] ?? null,
            estimatedCycleLength: estimateCycleLength(startDates),
          });
        }
      );
    });
  } catch {
    return empty;
  }
}
