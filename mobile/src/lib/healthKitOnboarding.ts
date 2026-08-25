import { hkWorkouts, hkAvailable } from './healthKitBridge';

// 'returning' is self-reported only (comeback runners: postpartum, injury, time
// off). deriveFitnessLevel never infers it from HealthKit pace.
export type FitnessLevel = 'beginner' | 'recreational' | 'intermediate' | 'advanced' | 'returning';
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
    if (!hkAvailable()) return empty;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    {
      {
        {
          const { workouts } = await hkWorkouts({ start: ninetyDaysAgo });
          const runs = workouts.filter(
            (r) => r.activityName === 'Running' && r.distance > 0 && r.duration > 0
          );
          if (!runs.length) return empty;
          // Distances are metres from the bridge (card 216), not miles.
          // Pace: duration (seconds) / distance (km)
          const avgPace = runs.reduce((s, r) => s + r.duration / (r.distance / 1000), 0) / runs.length;
          // Weekly km over last 8 weeks
          const eightWeeksAgo = Date.now() - 56 * 24 * 60 * 60 * 1000;
          const recentRuns = runs.filter((r) => new Date(r.start).getTime() > eightWeeksAgo);
          const totalKm = recentRuns.reduce((s, r) => s + r.distance / 1000, 0);
          const weeklyKm = recentRuns.length ? totalKm / 8 : null;
          // Best 5K: runs within 5K distance range (4.7-5.3 km)
          const nearFiveK = runs.filter((r) => r.distance >= 4700 && r.distance <= 5300);
          const best5k = nearFiveK.length ? Math.min(...nearFiveK.map((r) => r.duration)) : null;
          return ({
            avgPaceSeconds: Math.round(avgPace),
            weeklyKm:       weeklyKm ? Math.round(weeklyKm * 10) / 10 : null,
            best5kSeconds:  best5k ? Math.round(best5k) : null,
          });
        }
      }
    }
  } catch {
    return empty;
  }
}

export async function fetchHKGoalData(): Promise<HKGoalData> {
  const empty: HKGoalData = {
    best5kSeconds: null, best10kSeconds: null, bestHalfSeconds: null, bestMarathonSeconds: null,
  };
  try {
    if (!hkAvailable()) return empty;
    {
      {
        {
          const { workouts } = await hkWorkouts({ start: new Date(0) });
          const runs = workouts.filter(
            (r) => r.activityName === 'Running' && r.distance > 0
          );
          // Distance ranges in METRES, converted from the previous mile bounds
          // with the same generous GPS tolerance. Card 216.
          const best = (minM: number, maxM: number) => {
            const m = runs.filter((r) => r.distance >= minM && r.distance <= maxM);
            return m.length ? Math.min(...m.map((r) => r.duration)) : null;
          };
          return ({
            best5kSeconds:       best(4700,  5300),
            best10kSeconds:      best(9300,  10650),
            bestHalfSeconds:     best(20100, 22050),
            bestMarathonSeconds: best(40250, 44250),
          });
        }
      }
    }
  } catch {
    return empty;
  }
}

export async function fetchHKCycleData(): Promise<HKCycleData> {
  try {
    const { getRecentPeriodStarts } = await import('@/modules/menstrual-health');
    const isoStrings = await getRecentPeriodStarts();
    if (!isoStrings.length) return { lastPeriodStart: null, estimatedCycleLength: null };
    const dates = isoStrings.map((s: string) => new Date(s));
    const lastPeriodStart      = dates[dates.length - 1];
    const estimatedCycleLength = estimateCycleLength(dates);
    return { lastPeriodStart, estimatedCycleLength };
  } catch {
    return { lastPeriodStart: null, estimatedCycleLength: null };
  }
}
