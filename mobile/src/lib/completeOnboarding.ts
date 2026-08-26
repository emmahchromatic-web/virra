import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import type { OnboardingData } from '@/context/OnboardingContext';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';

export function parseFiveKToPaceSecPerKm(fiveKTime: string): number | null {
  const parts = fiveKTime.split(':');
  if (parts.length !== 2) return null;
  const mm = parseInt(parts[0], 10);
  const ss = parseInt(parts[1], 10);
  if (isNaN(mm) || isNaN(ss)) return null;
  return Math.round((mm * 60 + ss) / 5);
}

/**
 * Fallback 5K-equivalent pace (s/km) for a runner who left the 5K time blank.
 * The field is optional ("Leave blank if you haven't raced") and only fitness
 * level and mileage gate Continue, so without this the profile keeps a null
 * baseline and every consumer falls back to its own `?? 360` — i.e. the runner
 * trains at 6:00/km whatever they told us.
 *
 * Derived by inverting `deriveFitnessLevel`'s own average-training-pace bands:
 * take the band's midpoint as average easy pace, divide by 1.18 for threshold,
 * then by 0.94 back to a 5K-equivalent, which is what this column means today.
 * `returning` is held one step more conservative than `recreational`.
 *
 * These are deliberately unambitious. A derived baseline is a starting point
 * the Fitness Update corrects from, and starting a shade slow is recoverable
 * in a way that starting fast is not.
 */
export const DERIVED_BASELINE_BY_LEVEL: Record<FitnessLevel, number> = {
  advanced:     240, // 4:00/km — a 20:00 5K
  intermediate: 275, // 4:35/km — a 22:55 5K
  recreational: 346, // 5:46/km — a 28:50 5K
  returning:    367, // 6:07/km — a 30:35 5K
  beginner:     406, // 6:46/km — a 33:50 5K
};

export type BaselineSource = 'stated' | 'derived';

/**
 * The baseline to persist at onboarding, and where it came from. A stated 5K
 * time always wins; the level-derived value is the fallback. Returns null only
 * when we have neither, which the Continue gate should make impossible.
 *
 * `source` is stored so calibration can treat a derived baseline as
 * low-confidence and converge on the truth faster than it would on a time the
 * runner actually gave us.
 */
export function seedBaselinePace(
  fiveKTime:    string,
  fitnessLevel: FitnessLevel | null,
): { secs: number; source: BaselineSource } | null {
  const stated = parseFiveKToPaceSecPerKm(fiveKTime);
  if (stated != null && stated > 0) return { secs: stated, source: 'stated' };
  if (fitnessLevel) return { secs: DERIVED_BASELINE_BY_LEVEL[fitnessLevel], source: 'derived' };
  return null;
}

/**
 * Weekly volume implied by the bracket the runner picked. Midpoints, except
 * `30+` which is open-ended and takes the bottom of the band plus a little.
 * Read by volumePlan and todaysSession, which have been defaulting to 30.
 */
export const WEEKLY_KM_BY_BRACKET: Record<WeeklyMileageBracket, number> = {
  '<5':    3,
  '5-15':  10,
  '15-30': 22,
  '30+':   35,
};

/**
 * Finalises onboarding: uploads the chosen avatar, writes the profile row
 * (marking onboarding_complete), records the initial fitness assessment and
 * cycle log, and hydrates the cycle store. Previously lived in the dietary
 * step's handleContinue: extracted so it can run from the last data-collection
 * step (cycle) now that the dietary step is gone.
 *
 * Pass the fully-merged onboarding data explicitly; do NOT rely on context
 * state set in the same handler, which hasn't committed yet.
 */
export async function completeOnboarding(
  userId: string,
  data: OnboardingData,
): Promise<{ error?: string; avatarFailed?: boolean }> {
  const today = new Date().toISOString().split('T')[0];

  // Upload avatar if one was chosen during onboarding.
  //
  // Card 224: a photo picked during onboarding did not appear on the profile
  // afterwards, and nothing told the user. Both failure paths here were silent:
  // an upload error only skipped setting the URL, and a thrown error only
  // reached the console. Now reported back so the caller can say so.
  //
  // It must never fail the onboarding itself. Losing a profile picture is
  // annoying; losing the whole sign-up because of one is much worse.
  let avatarUrl: string | undefined;
  let avatarFailed = false;
  if (data.localAvatarUri) {
    try {
      const path   = `${userId}/avatar.jpg`;
      const base64 = await FileSystem.readAsStringAsync(data.localAvatarUri, { encoding: 'base64' });
      const binary = atob(base64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        console.error('[onboarding] avatar upload rejected:', uploadError.message);
        avatarFailed = true;
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      }
    } catch (e) {
      console.error('[onboarding] avatar upload failed:', e);
      avatarFailed = true;
    }
  }

  // The two numbers every generated plan is built from. Until now both were
  // collected here and dropped: the 5K time only reached fitness_assessments,
  // and the mileage bracket reached nothing at all, so every consumer fell back
  // to `?? 360` (6:00/km) and `?? 30`. See card 227.
  const baseline = seedBaselinePace(data.fiveKTime, data.fitnessLevel);
  const weeklyKm = data.weeklyMileage ? WEEKLY_KM_BY_BRACKET[data.weeklyMileage] : null;

  // dietary_prefs is intentionally omitted; the dietary step was removed until
  // meal-planning ships. The column keeps its default '{}' so it can be
  // repopulated when that feature returns.
  const { error: profileError } = await supabase.from('user_profiles').upsert({
    id:                  userId,
    first_name:          data.firstName || null,
    last_name:           data.lastName  || null,
    ...(avatarUrl != null && { avatar_url: avatarUrl }),
    fitness_level:       data.fitnessLevel,
    running_goal:        data.runningGoal,
    ...(baseline != null && {
      baseline_pace_seconds_per_km: baseline.secs,
      baseline_source:              baseline.source,
    }),
    ...(weeklyKm != null && { weekly_mileage_km: weeklyKm }),
    cycle_profile:       data.cycleProfile,
    contraception_type:  data.contraceptionType ?? null,
    has_placebo_week:    data.hasPlaceboWeek    ?? null,
    current_pack_start:  data.currentPackStart
      ? data.currentPackStart.toISOString().split('T')[0]
      : null,
    onboarding_complete: true,
  });

  if (profileError) return { error: profileError.message };

  if (data.fitnessLevel) {
    const { error } = await supabase.from('fitness_assessments').insert({
      user_id:                    userId,
      assessed_on:                today,
      stated_level:               data.fitnessLevel,
      actual_pace_seconds_per_km: parseFiveKToPaceSecPerKm(data.fiveKTime),
      trigger_description:        'onboarding',
    });
    if (error) console.error('[onboarding] fitness_assessments insert failed:', error);
  }

  if (data.periodStart) {
    const { error } = await supabase.from('cycle_logs').insert({
      user_id:           userId,
      period_start:      data.periodStart.toISOString().split('T')[0],
      cycle_length_days: data.cycleLength,
    });
    if (error) console.error('[onboarding] cycle_logs insert failed:', error);
  }

  const { setCycleProfile, setPeriodStart, setHormonalSubData } = useCycleStore.getState();
  setCycleProfile(data.cycleProfile);
  if (data.periodStart) {
    setPeriodStart(data.periodStart);
  }
  // setCycleProfile must be called first; setHormonalSubData guards on
  // s.cycleProfile === 'hormonal'
  if (data.cycleProfile === 'hormonal' && data.contraceptionType) {
    setHormonalSubData({
      contraceptionType: data.contraceptionType,
      hasPlaceboWeek:    data.hasPlaceboWeek,
      currentPackStart:  data.currentPackStart,
    });
  }

  return { avatarFailed };
}
