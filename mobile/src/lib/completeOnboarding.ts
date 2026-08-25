import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import type { OnboardingData } from '@/context/OnboardingContext';

function parseFiveKToPaceSecPerKm(fiveKTime: string): number | null {
  const parts = fiveKTime.split(':');
  if (parts.length !== 2) return null;
  const mm = parseInt(parts[0], 10);
  const ss = parseInt(parts[1], 10);
  if (isNaN(mm) || isNaN(ss)) return null;
  return Math.round((mm * 60 + ss) / 5);
}

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
