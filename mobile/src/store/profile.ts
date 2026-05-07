import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface ProfileState {
  firstName:  string;
  lastName:   string;
  avatarUrl:  string | null;
  isLoaded:   boolean;
  load:       (userId: string) => Promise<void>;
  save:       (userId: string, patch: { firstName?: string; lastName?: string; avatarUrl?: string }) => Promise<void>;
  setLocal:   (patch: { firstName?: string; lastName?: string; avatarUrl?: string | null }) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  firstName: '',
  lastName:  '',
  avatarUrl: null,
  isLoaded:  false,

  load: async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({
        firstName: data.first_name ?? '',
        lastName:  data.last_name  ?? '',
        avatarUrl: data.avatar_url ?? null,
        isLoaded:  true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  save: async (userId, patch) => {
    const update: Record<string, string | null> = {};
    if (patch.firstName !== undefined) update.first_name = patch.firstName;
    if (patch.lastName  !== undefined) update.last_name  = patch.lastName;
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;

    await supabase
      .from('user_profiles')
      .update(update)
      .eq('id', userId);

    set({
      firstName: patch.firstName ?? get().firstName,
      lastName:  patch.lastName  ?? get().lastName,
      avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : get().avatarUrl,
    });
  },

  setLocal: (patch) => set((s) => ({
    firstName: patch.firstName ?? s.firstName,
    lastName:  patch.lastName  ?? s.lastName,
    avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : s.avatarUrl,
  })),
}));
