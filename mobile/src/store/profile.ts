import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface ProfileState {
  firstName:   string;
  lastName:    string;
  avatarUrl:   string | null;
  stepsTarget: number;
  isLoaded:    boolean;
  load:        (userId: string) => Promise<void>;
  save:        (userId: string, patch: { firstName?: string; lastName?: string; avatarUrl?: string | null; stepsTarget?: number }) => Promise<void>;
  setLocal:    (patch: { firstName?: string; lastName?: string; avatarUrl?: string | null; stepsTarget?: number }) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  firstName:   '',
  lastName:    '',
  avatarUrl:   null,
  stepsTarget: 8000,
  isLoaded:    false,

  load: async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url, steps_target')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({
        firstName:   data.first_name   ?? '',
        lastName:    data.last_name    ?? '',
        avatarUrl:   data.avatar_url   ?? null,
        stepsTarget: data.steps_target ?? 8000,
        isLoaded:    true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  save: async (userId, patch) => {
    const update: Record<string, string | number | null> = {};
    if (patch.firstName   !== undefined) update.first_name   = patch.firstName;
    if (patch.lastName    !== undefined) update.last_name    = patch.lastName;
    if (patch.avatarUrl   !== undefined) update.avatar_url   = patch.avatarUrl;
    if (patch.stepsTarget !== undefined) update.steps_target = patch.stepsTarget;

    const { error } = await supabase
      .from('user_profiles')
      .update(update)
      .eq('id', userId);

    if (error) throw new Error(error.message);

    set((s) => ({
      firstName:   patch.firstName   ?? s.firstName,
      lastName:    patch.lastName    ?? s.lastName,
      avatarUrl:   patch.avatarUrl   !== undefined ? patch.avatarUrl : s.avatarUrl,
      stepsTarget: patch.stepsTarget ?? s.stepsTarget,
    }));
  },

  setLocal: (patch) => set((s) => ({
    firstName:   patch.firstName   ?? s.firstName,
    lastName:    patch.lastName    ?? s.lastName,
    avatarUrl:   patch.avatarUrl   !== undefined ? patch.avatarUrl : s.avatarUrl,
    stepsTarget: patch.stepsTarget ?? s.stepsTarget,
  })),
}));
