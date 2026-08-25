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
  WorkoutActivityType,
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
  /**
   * HealthKit's own sample UUID, stored as activities.hk_uuid.
   *
   * Safe to change format across this migration: the import upserts on
   * (user_id, started_at), not on hk_uuid, so a workout that was already
   * imported under the old identity updates in place rather than duplicating.
   */
  uuid:         string | null;
  sourceId:     string | null;
  /** Seconds, matching the old library. */
  duration:     number;
  start:        string;
  end:          string;
  /**
   * PascalCase name matching what react-native-health used to return, e.g.
   * 'Running', 'Hiking', 'TraditionalStrengthTraining'. The new library gives a
   * camelCase enum member instead, so it is capitalised here rather than in the
   * import mapping, which keeps that mapping and its tests untouched.
   *
   * Two names the old library produced have no enum member and can no longer be
   * detected from the activity type alone: 'TrailRunning' and
   * 'OpenWaterSwimming'. They are not HKWorkoutActivityType values. Open water
   * is recovered from swimming metadata below; a trail run now imports as a
   * plain run, which is a real if minor loss. Card 216.
   */
  activityName: string;
  /**
   * METRES. Zero when the workout carries no distance.
   *
   * Deliberately not the old library's unit, which was miles: every consumer
   * immediately multiplied by 1609.344 or 1.60934 to get somewhere useful, the
   * database column is distance_meters, and HealthKit's own base unit is
   * metres. Normalised here so nothing downstream has to guess.
   */
  distance:     number;
  energyBurned: number;
  metadata:     Record<string, unknown>;
}

/** Capitalise a camelCase enum member into the old library's PascalCase name. */
function pascal(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
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
        totalDistance?: { quantity?: number; unit?: string };
        totalEnergyBurned?: { quantity?: number };
        startDate: Date;
        endDate: Date;
        workoutActivityType?: unknown;
        metadata?: Record<string, unknown>;
      };

      const raw = s.workoutActivityType;
      // The enum is numeric at runtime, so reverse-map it back to its name.
      const memberName =
        typeof raw === 'number'
          ? (WorkoutActivityType as unknown as Record<number, string>)[raw] ?? ''
          : String(raw ?? '');

      let activityName = pascal(memberName);

      // Open-water swims are plain 'swimming' plus a metadata marker. Recover
      // the distinction the old library reported as 'OpenWaterSwimming'.
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      if (activityName === 'Swimming' && String(meta.HKSwimmingLocationType ?? '') === '2') {
        activityName = 'OpenWaterSwimming';
      }

      const src = (s as { sourceRevision?: { source?: { bundleIdentifier?: string } } }).sourceRevision;

      // Normalise whatever unit HealthKit hands back to metres.
      const distRaw  = s.totalDistance?.quantity ?? 0;
      const distUnit = (s.totalDistance as { unit?: string } | undefined)?.unit ?? 'm';
      const distance =
        distUnit === 'km' ? distRaw * 1000
        : distUnit === 'mi' ? distRaw * 1609.344
        : distRaw;

      return {
        uuid:         (s as { uuid?: string }).uuid ?? null,
        sourceId:     src?.source?.bundleIdentifier ?? null,
        duration:     s.duration?.quantity ?? 0,
        start:        iso(s.startDate),
        end:          iso(s.endDate),
        activityName,
        distance,
        energyBurned: s.totalEnergyBurned?.quantity ?? 0,
        metadata:     meta,
      };
    });

    return { workouts, anchor: (res as { newAnchor?: string })?.newAnchor ?? null };
  } catch (e) {
    console.warn('[healthKitBridge] workout query failed:', e);
    return { workouts: [], anchor: null };
  }
}

/**
 * Write a workout back to Health. Returns whether it landed.
 *
 * Never throws, and every caller invokes it fire-and-forget: the activity is
 * already in our own database by this point, and a HealthKit refusal must not
 * cost the user their run.
 */
export async function hkSaveWorkout(opts: {
  activityType:    number;
  start:           Date;
  end:             Date;
  distanceMeters?: number;
  metadata?:       Record<string, string | number | boolean>;
}): Promise<boolean> {
  try {
    const quantities = opts.distanceMeters && opts.distanceMeters > 0
      ? [{
          quantityType: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
          unit:         'm',
          quantity:     opts.distanceMeters,
          startDate:    opts.start,
          endDate:      opts.end,
        }]
      : [];

    await saveWorkoutSample(
      opts.activityType as never,
      quantities as never,
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

/** Re-exported so call sites name activity types without importing the library. */
export { WorkoutActivityType as HKWorkoutActivityType };

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
