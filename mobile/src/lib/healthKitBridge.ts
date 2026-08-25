// mobile/src/lib/healthKitBridge.ts
//
// The single place that talks to @kingstinct/react-native-healthkit.
//
// Card 216. The app previously called react-native-health directly from nine
// files via NativeModules.AppleHealthKit, so swapping libraries would have
// meant rewriting nine modules and their tests against a new API. Everything
// now goes through this adapter instead, which deliberately returns the shapes
// the old library returned: `value` rather than `quantity`, ISO strings rather
// than Date objects. That keeps the parsing and aggregation logic above it, and
// the tests that cover it, completely untouched by the migration.
//
// It also means the next library change is one file, not nine.
//
// Everything here is best-effort and never throws. Callers are all in paths
// where HealthKit is a bonus (no paired Watch, permission denied, nothing
// synced yet), and a rejected promise would strand a user mid-run-save or
// blank the dashboard. Failure returns empty, and the caller carries on.

import {
  isHealthDataAvailable,
  requestAuthorization,
  queryQuantitySamples,
  queryCategorySamples,
  queryStatisticsForQuantity,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamplesWithAnchor,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';

/** Old-library sample shape: value plus ISO strings. */
export interface HKSample {
  value:     number;
  startDate: string;
  endDate:   string;
}

/** Sleep and other category samples carry a string state rather than a number. */
export interface HKCategorySample {
  value:     string;
  startDate: string;
  endDate:   string;
}

export interface HKWorkout {
  /** Seconds, matching the old library. */
  duration:     number;
  start:        string;
  end:          string;
  activityType: string;
}

const iso = (d: Date | string | undefined): string =>
  d instanceof Date ? d.toISOString() : String(d ?? '');

/** Fetch all samples in a window, oldest first unless told otherwise. */
export async function hkQuantitySamples(
  identifier: string,
  opts: { start: Date; end?: Date; unit?: string; ascending?: boolean },
): Promise<HKSample[]> {
  try {
    const samples = await queryQuantitySamples(identifier as never, {
      filter:    { date: { startDate: opts.start, endDate: opts.end } },
      // 0 means "all"; these windows are bounded by date, not by count.
      limit:     0,
      ascending: opts.ascending ?? true,
      ...(opts.unit ? { unit: opts.unit } : {}),
    } as never);

    return (samples ?? []).map((s) => ({
      value:     (s as { quantity: number }).quantity,
      startDate: iso((s as { startDate: Date }).startDate),
      endDate:   iso((s as { endDate: Date }).endDate),
    }));
  } catch (e) {
    console.warn(`[healthKitBridge] quantity query failed for ${identifier}:`, e);
    return [];
  }
}

/** Category samples (sleep analysis). Value is normalised to the old library's uppercase strings. */
export async function hkCategorySamples(
  identifier: string,
  opts: { start: Date; end?: Date },
): Promise<HKCategorySample[]> {
  try {
    const samples = await queryCategorySamples(identifier as never, {
      filter:    { date: { startDate: opts.start, endDate: opts.end } },
      limit:     0,
      ascending: true,
    } as never);

    return (samples ?? []).map((s) => ({
      value:     String((s as { value: unknown }).value ?? '').toUpperCase(),
      startDate: iso((s as { startDate: Date }).startDate),
      endDate:   iso((s as { endDate: Date }).endDate),
    }));
  } catch (e) {
    console.warn(`[healthKitBridge] category query failed for ${identifier}:`, e);
    return [];
  }
}

/**
 * Summed total for a quantity over a window. Replaces the old getStepCount and
 * getAppleExerciseTime, and is the fallback for activity summaries: the new
 * library has no equivalent of getActivitySummary, since HKActivitySummaryType
 * is exposed for authorization only.
 */
export async function hkSum(
  identifier: string,
  opts: { start: Date; end?: Date; unit?: string },
): Promise<number> {
  try {
    const res = await queryStatisticsForQuantity(
      identifier as never,
      ['cumulativeSum'] as never,
      {
        filter: { date: { startDate: opts.start, endDate: opts.end } },
        ...(opts.unit ? { unit: opts.unit } : {}),
      } as never,
    );
    const sum = (res as { sumQuantity?: { quantity?: number } })?.sumQuantity?.quantity;
    return typeof sum === 'number' && Number.isFinite(sum) ? sum : 0;
  } catch (e) {
    console.warn(`[healthKitBridge] statistics query failed for ${identifier}:`, e);
    return 0;
  }
}

/**
 * Workouts in a window, with the anchor for incremental sync. `duration` is
 * flattened from the new library's Quantity object back to plain seconds.
 */
export async function hkWorkouts(
  opts: { start: Date; end?: Date; anchor?: string; ascending?: boolean },
): Promise<{ workouts: HKWorkout[]; anchor: string | null }> {
  try {
    const res = await queryWorkoutSamplesWithAnchor({
      filter: { date: { startDate: opts.start, endDate: opts.end } },
      limit:  0,
      ...(opts.anchor ? { anchor: opts.anchor } : {}),
    } as never);

    const workouts = ((res as { samples?: unknown[] })?.samples ?? []).map((w) => {
      const s = w as {
        duration?: { quantity?: number };
        startDate: Date;
        endDate: Date;
        workoutActivityType?: unknown;
      };
      return {
        duration:     s.duration?.quantity ?? 0,
        start:        iso(s.startDate),
        end:          iso(s.endDate),
        activityType: String(s.workoutActivityType ?? ''),
      };
    });

    return { workouts, anchor: (res as { newAnchor?: string })?.newAnchor ?? null };
  } catch (e) {
    console.warn('[healthKitBridge] workout query failed:', e);
    return { workouts: [], anchor: null };
  }
}

/** Write a workout back to Health. Returns whether it landed. */
export async function hkSaveWorkout(opts: {
  activityType: number;
  start:        Date;
  end:          Date;
  metadata?:    Record<string, string | number | boolean>;
}): Promise<boolean> {
  try {
    await saveWorkoutSample(
      opts.activityType as never,
      [] as never,
      opts.start,
      opts.end as never,
      undefined,
      opts.metadata as never,
    );
    return true;
  } catch (e) {
    console.warn('[healthKitBridge] saveWorkout failed:', e);
    return false;
  }
}

/**
 * Per-day sums for a quantity across a window.
 *
 * This is what replaces getActivitySummary's per-day activeEnergyBurned. The
 * new library has no activity-summary query at all, but a daily statistics
 * collection is a more direct answer to the question anyway: it sums the
 * underlying samples rather than reading Apple's ring aggregate, so it works
 * without a paired Watch.
 */
export async function hkDailySums(
  identifier: string,
  opts: { start: Date; end?: Date; unit?: string },
): Promise<number[]> {
  try {
    const res = await queryStatisticsCollectionForQuantity(
      identifier as never,
      ['cumulativeSum'] as never,
      opts.start,
      { day: 1 } as never,
      {
        filter: { date: { startDate: opts.start, endDate: opts.end } },
        ...(opts.unit ? { unit: opts.unit } : {}),
      } as never,
    );
    return (res ?? [])
      .map((r) => (r as { sumQuantity?: { quantity?: number } })?.sumQuantity?.quantity ?? 0)
      .filter((v) => Number.isFinite(v) && v > 0);
  } catch (e) {
    console.warn(`[healthKitBridge] daily statistics failed for ${identifier}:`, e);
    return [];
  }
}

/** Whether HealthKit exists on this device at all. False on simulator-less platforms. */
export function hkAvailable(): boolean {
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Ask for read and write access. Returns false rather than throwing on denial. */
export async function hkRequestAuthorization(
  read:  readonly string[],
  write: readonly string[] = [],
): Promise<boolean> {
  try {
    return await requestAuthorization({ toRead: read, toWrite: write } as never);
  } catch (e) {
    console.warn('[healthKitBridge] authorization failed:', e);
    return false;
  }
}
