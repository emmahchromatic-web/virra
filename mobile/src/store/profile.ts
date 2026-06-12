import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type WorkoutPreference = 'gym_full' | 'home_dumbbells' | 'home_bodyweight';

export interface ProfilePatch {
  firstName?:                       string;
  lastName?:                        string;
  avatarUrl?:                       string | null;
  stepsTarget?:                     number;
  workoutPreference?:               WorkoutPreference;
  trackWeight?:                     boolean;
  weightBaselineKg?:                number | null;
  weightExplainerDismissedAt?:      string | null;
  weightSteadyBaselineKg?:          number | null;
  weightSteadyBaselineComputedAt?:  string | null;
}

interface ProfileState {
  firstName:                       string;
  lastName:                        string;
  avatarUrl:                       string | null;
  stepsTarget:                     number;
  workoutPreference:               WorkoutPreference;
  haikuDisclosureAcknowledgedAt:   string | null;
  trackWeight:                     boolean;
  weightBaselineKg:                number | null;
  weightExplainerDismissedAt:      string | null;
  weightSteadyBaselineKg:          number | null;
  weightSteadyBaselineComputedAt:  string | null;
  // Incremented after a HK weight import finishes so chart screens re-fetch.
  weightDataVersion:               number;
  isLoaded:                        boolean;
  load:                            (userId: string) => Promise<void>;
  save:                            (userId: string, patch: ProfilePatch) => Promise<void>;
  setLocal:                        (patch: ProfilePatch) => void;
  bumpWeightDataVersion:           () => void;
  acknowledgeHaikuDisclosure:      (userId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  firstName:                     '',
  lastName:                      '',
  avatarUrl:                     null,
  stepsTarget:                   8000,
  workoutPreference:             'gym_full',
  haikuDisclosureAcknowledgedAt: null,
  trackWeight:                    false,
  weightBaselineKg:               null,
  weightExplainerDismissedAt:     null,
  weightSteadyBaselineKg:         null,
  weightSteadyBaselineComputedAt: null,
  weightDataVersion:              0,
  isLoaded:                       false,

  load: async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url, steps_target, workout_preference, haiku_disclosure_acknowledged_at, track_weight, weight_baseline_kg, weight_explainer_dismissed_at, weight_steady_baseline_kg, weight_steady_baseline_computed_at')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({
        firstName:                      data.first_name   ?? '',
        lastName:                       data.last_name    ?? '',
        avatarUrl:                      data.avatar_url   ?? null,
        stepsTarget:                    data.steps_target ?? 8000,
        workoutPreference:              (data.workout_preference as WorkoutPreference) ?? 'gym_full',
        haikuDisclosureAcknowledgedAt:  data.haiku_disclosure_acknowledged_at ?? null,
        trackWeight:                    data.track_weight ?? false,
        weightBaselineKg:               data.weight_baseline_kg ?? null,
        weightExplainerDismissedAt:     data.weight_explainer_dismissed_at ?? null,
        weightSteadyBaselineKg:         data.weight_steady_baseline_kg ?? null,
        weightSteadyBaselineComputedAt: data.weight_steady_baseline_computed_at ?? null,
        isLoaded:                       true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  save: async (userId, patch) => {
    const update: Record<string, string | number | boolean | null> = {};
    if (patch.firstName                  !== undefined) update.first_name                    = patch.firstName;
    if (patch.lastName                   !== undefined) update.last_name                     = patch.lastName;
    if (patch.avatarUrl                  !== undefined) update.avatar_url                    = patch.avatarUrl;
    if (patch.stepsTarget                !== undefined) update.steps_target                  = patch.stepsTarget;
    if (patch.workoutPreference          !== undefined) update.workout_preference             = patch.workoutPreference;
    if (patch.trackWeight                !== undefined) update.track_weight                  = patch.trackWeight;
    if (patch.weightBaselineKg               !== undefined) update.weight_baseline_kg                = patch.weightBaselineKg;
    if (patch.weightExplainerDismissedAt     !== undefined) update.weight_explainer_dismissed_at     = patch.weightExplainerDismissedAt;
    if (patch.weightSteadyBaselineKg         !== undefined) update.weight_steady_baseline_kg         = patch.weightSteadyBaselineKg;
    if (patch.weightSteadyBaselineComputedAt !== undefined) update.weight_steady_baseline_computed_at = patch.weightSteadyBaselineComputedAt;

    const { error } = await supabase
      .from('user_profiles')
      .update(update)
      .eq('id', userId);

    if (error) throw new Error(error.message);

    set((s) => ({
      firstName:                      patch.firstName                      ?? s.firstName,
      lastName:                       patch.lastName                       ?? s.lastName,
      avatarUrl:                      patch.avatarUrl                      !== undefined ? patch.avatarUrl                      : s.avatarUrl,
      stepsTarget:                    patch.stepsTarget                    ?? s.stepsTarget,
      workoutPreference:              patch.workoutPreference               ?? s.workoutPreference,
      trackWeight:                    patch.trackWeight                    ?? s.trackWeight,
      weightBaselineKg:               patch.weightBaselineKg               !== undefined ? patch.weightBaselineKg               : s.weightBaselineKg,
      weightExplainerDismissedAt:     patch.weightExplainerDismissedAt     !== undefined ? patch.weightExplainerDismissedAt     : s.weightExplainerDismissedAt,
      weightSteadyBaselineKg:         patch.weightSteadyBaselineKg         !== undefined ? patch.weightSteadyBaselineKg         : s.weightSteadyBaselineKg,
      weightSteadyBaselineComputedAt: patch.weightSteadyBaselineComputedAt !== undefined ? patch.weightSteadyBaselineComputedAt : s.weightSteadyBaselineComputedAt,
    }));
  },

  setLocal: (patch) => set((s) => ({
    firstName:                      patch.firstName                      ?? s.firstName,
    lastName:                       patch.lastName                       ?? s.lastName,
    avatarUrl:                      patch.avatarUrl                      !== undefined ? patch.avatarUrl                      : s.avatarUrl,
    stepsTarget:                    patch.stepsTarget                    ?? s.stepsTarget,
    workoutPreference:              patch.workoutPreference               ?? s.workoutPreference,
    trackWeight:                    patch.trackWeight                    ?? s.trackWeight,
    weightBaselineKg:               patch.weightBaselineKg               !== undefined ? patch.weightBaselineKg               : s.weightBaselineKg,
    weightExplainerDismissedAt:     patch.weightExplainerDismissedAt     !== undefined ? patch.weightExplainerDismissedAt     : s.weightExplainerDismissedAt,
    weightSteadyBaselineKg:         patch.weightSteadyBaselineKg         !== undefined ? patch.weightSteadyBaselineKg         : s.weightSteadyBaselineKg,
    weightSteadyBaselineComputedAt: patch.weightSteadyBaselineComputedAt !== undefined ? patch.weightSteadyBaselineComputedAt : s.weightSteadyBaselineComputedAt,
  })),

  bumpWeightDataVersion: () => set((s) => ({ weightDataVersion: s.weightDataVersion + 1 })),

  acknowledgeHaikuDisclosure: async (userId) => {
    const now = new Date().toISOString();
    // Optimistic — the screen reveals immediately; if persistence fails the next
    // session-load will simply prompt again, which is the right fallback.
    set({ haikuDisclosureAcknowledgedAt: now });
    const { error } = await supabase
      .from('user_profiles')
      .update({ haiku_disclosure_acknowledged_at: now })
      .eq('id', userId);
    if (error) {
      console.warn('[profile] failed to persist haiku disclosure ack:', error.message);
    }
  },
}));
