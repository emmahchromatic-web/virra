import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCycleInfo } from './cycleEngine';
import { cancelTrainingReminderToday } from './notifications';
import { useSessionStore } from '@/store/sessionStore';

const ANCHOR_KEY        = 'hk_workout_anchor_v1';
const REIMPORT_FLAG_KEY = 'hk_reimport_subtype_v1';
// BACKFILL_FLAG_KEY removed in Phase Ja T19; the one-shot full-year
// backfill it gated is now driven by sessionStore.reconcileFromActivities().

type ActivityType = 'run' | 'swim' | 'strength' | 'yoga' | 'other';

function mapActivityType(name: string): ActivityType {
  if (name === 'Running' || name === 'TrailRunning') return 'run';
  if (name === 'Swimming' || name === 'OpenWaterSwimming') return 'swim';
  if (
    name.includes('Strength') ||
    name === 'CrossTraining' ||
    name === 'HighIntensityIntervalTraining' ||
    name === 'Pilates'
  ) return 'strength';
  if (name === 'Yoga') return 'yoga';
  return 'other';
}

/**
 * Canonical lowercase sub-type from a HealthKit activity name.
 * Returns null when the broad activity_type already conveys the specifics
 * (e.g. a plain "Running" → activity_type 'run', no sub_type needed).
 */
function mapSubType(name: string): string | null {
  if (!name) return null;
  switch (name) {
    case 'TrailRunning':                return 'trail_run';
    case 'OpenWaterSwimming':           return 'open_water_swim';
    case 'Hiking':                      return 'hike';
    case 'Walking':                     return 'walk';
    case 'Cycling':                     return 'cycle';
    case 'HandCycling':                 return 'handcycle';
    case 'Rowing':                      return 'row';
    case 'Elliptical':                  return 'elliptical';
    case 'StairClimbing':
    case 'Stairs':
    case 'StepTraining':
    case 'StairStepper':                return 'stairs';
    case 'CardioDance':
    case 'SocialDance':                 return 'dance';
    case 'Boxing':
    case 'Kickboxing':
    case 'MartialArts':                 return 'martial';
    case 'Climbing':
    case 'TraditionalClimbing':         return 'climb';
    case 'CrossCountrySkiing':
    case 'DownhillSkiing':
    case 'Snowboarding':
    case 'SnowSports':                  return 'ski';
    case 'SkatingSports':               return 'skate';
    case 'PaddleSports':
    case 'Paddling':                    return 'paddle';
    case 'SurfingSports':               return 'surf';
    case 'Tennis':                      return 'tennis';
    case 'Golf':                        return 'golf';
    case 'Pilates':                     return 'pilates';
    case 'HighIntensityIntervalTraining': return 'hiit';
    case 'CrossTraining':               return 'cross_train';
    case 'MixedCardio':                 return 'mixed_cardio';
    case 'FunctionalStrengthTraining':
    case 'TraditionalStrengthTraining': return null; // already labelled "Strength"
    default:                            return null;
  }
}

interface ImportContext {
  userId:      string;
  periodStart: Date | null;
  cycleLength: number;
}

// Runs every foreground import cycle. First call (per install) reconciles a full
// year as a one-time backfill; subsequent calls reconcile only the current week.
async function runReconcile(_userId: string): Promise<void> {
  try {
    await useSessionStore.getState().reconcileFromActivities();
  } catch (e) {
    console.warn('[healthKitImport] reconcile', e instanceof Error ? e.message : String(e));
  }
}

export async function importNewWorkouts(ctx: ImportContext): Promise<number> {
  const HK = NativeModules.AppleHealthKit;
  if (!HK?.getAnchoredWorkouts) return 0;

  let Constants: any;
  try {
    Constants = require('react-native-health').Constants;
  } catch {
    return 0;
  }

  // One-shot anchor reset so existing rows imported before the sub_type column
  // pick it up on next observer fire. Idempotent; only resets once per install.
  const reimportDone = await AsyncStorage.getItem(REIMPORT_FLAG_KEY);
  if (!reimportDone) {
    await AsyncStorage.removeItem(ANCHOR_KEY);
    await AsyncStorage.setItem(REIMPORT_FLAG_KEY, '1');
  }

  const anchor   = await AsyncStorage.getItem(ANCHOR_KEY);
  const startDate = anchor
    ? new Date(0).toISOString()           // anchor handles the window
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // first run: 1 year back

  return new Promise((resolve) => {
    HK.getAnchoredWorkouts(
      { startDate, anchor: anchor ?? undefined, ascending: true },
      async (err: any, result: { anchor: string; data: any[] }) => {
        if (err) return resolve(0);

        const workouts = (result?.data ?? []).filter(
          (w) => w.duration > 0 && (w.distance >= 0)
        );

        let imported = 0;

        for (const w of workouts) {
          const startedAt    = new Date(w.start);
          const hkName       = w.activityName ?? '';
          const activityType = mapActivityType(hkName);
          const subType      = mapSubType(hkName);
          // Distance is meaningful for any aerobic locomotion, not just run/swim
          const carriesDistance = activityType === 'run'
            || activityType === 'swim'
            || subType === 'hike'
            || subType === 'walk'
            || subType === 'cycle'
            || subType === 'handcycle';
          const distanceM = carriesDistance
            ? Math.round((w.distance ?? 0) * 1609.344) // miles → metres
            : null;

          // Determine cycle phase at the time of the workout
          const phaseAtTime = ctx.periodStart
            ? getCycleInfo(ctx.periodStart, ctx.cycleLength, startedAt).phase
            : null;

          const hkUuid = w.id ?? (w.sourceId ? `${w.sourceId}::${w.start}` : null);

          const { data: activityRow, error: actErr } = await supabase
            .from('activities')
            .upsert(
              {
                user_id:          ctx.userId,
                activity_type:    activityType,
                sub_type:         subType,
                started_at:       startedAt.toISOString(),
                duration_seconds: Math.round(w.duration ?? 0),
                distance_meters:  distanceM,
                phase_at_time:    phaseAtTime,
                hk_uuid:          hkUuid,
              },
              { onConflict: 'user_id,started_at', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (actErr) continue;

          // For runs, write pace into run_details
          if (activityType === 'run' && distanceM && distanceM > 0 && activityRow?.id) {
            const durationS  = w.duration ?? 0;
            const distanceKm = distanceM / 1000;
            const avgPace    = distanceKm > 0 ? Math.round(durationS / distanceKm) : null;

            await supabase
              .from('run_details')
              .upsert(
                {
                  activity_id:               activityRow.id,
                  avg_pace_seconds_per_km:   avgPace,
                  elevation_gain_meters:     w.metadata?.HKElevationAscended ?? null,
                },
                { onConflict: 'activity_id', ignoreDuplicates: false }
              );
          }

          imported++;

          // Cancel today's training reminder if this workout was today
          const workoutDate = startedAt.toISOString().split('T')[0];
          if (workoutDate === new Date().toISOString().split('T')[0]) {
            cancelTrainingReminderToday();
          }
        }

        // Advance anchor so next call only fetches new workouts
        if (result?.anchor) {
          await AsyncStorage.setItem(ANCHOR_KEY, result.anchor);
        }

        // Link imported (and any still-unlinked) activities to planned sessions.
        await runReconcile(ctx.userId);

        resolve(imported);
      }
    );
  });
}

export async function resetImportAnchor(): Promise<void> {
  await AsyncStorage.removeItem(ANCHOR_KEY);
}
