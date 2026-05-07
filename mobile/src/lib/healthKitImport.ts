import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCycleInfo } from './cycleEngine';
import { cancelTrainingReminderToday } from './notifications';

const ANCHOR_KEY = 'hk_workout_anchor_v1';

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

interface ImportContext {
  userId:      string;
  periodStart: Date | null;
  cycleLength: number;
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

  const anchor   = await AsyncStorage.getItem(ANCHOR_KEY);
  const startDate = anchor
    ? new Date(0).toISOString()           // anchor handles the window
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); // first run: 1 year back

  return new Promise((resolve) => {
    HK.getAnchoredWorkouts(
      { startDate, anchor: anchor ?? undefined, ascending: true },
      async (err: any, result: { anchor: string; data: any[] }) => {
        if (err || !result?.data?.length) return resolve(0);

        const workouts = result.data.filter(
          (w) => w.duration > 0 && (w.distance >= 0)
        );

        let imported = 0;

        for (const w of workouts) {
          const startedAt    = new Date(w.start);
          const activityType = mapActivityType(w.activityName ?? '');
          const distanceM    = activityType === 'run' || activityType === 'swim'
            ? Math.round((w.distance ?? 0) * 1609.344) // miles → metres
            : null;

          // Determine cycle phase at the time of the workout
          const phaseAtTime = ctx.periodStart
            ? getCycleInfo(ctx.periodStart, ctx.cycleLength, startedAt).phase
            : null;

          const hkUuid = w.id ?? w.sourceId
            ? `${w.sourceId}::${w.start}`
            : null;

          const { data: activityRow, error: actErr } = await supabase
            .from('activities')
            .upsert(
              {
                user_id:          ctx.userId,
                activity_type:    activityType,
                started_at:       startedAt.toISOString(),
                duration_seconds: Math.round(w.duration ?? 0),
                distance_meters:  distanceM,
                phase_at_time:    phaseAtTime,
                hk_uuid:          hkUuid,
              },
              { onConflict: 'user_id,started_at', ignoreDuplicates: true }
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
        if (result.anchor) {
          await AsyncStorage.setItem(ANCHOR_KEY, result.anchor);
        }

        resolve(imported);
      }
    );
  });
}

export async function resetImportAnchor(): Promise<void> {
  await AsyncStorage.removeItem(ANCHOR_KEY);
}
