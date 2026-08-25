// mobile/src/store/auth.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearUserScopedCaches } from '@/lib/localCaches';
import { cancelAllNotifications } from '@/lib/notifications';

interface AuthState {
  session:    Session | null;
  user:       User | null;
  isLoading:  boolean;
  setSession: (session: Session | null) => void;
  signOut:    () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session:    null,
  user:       null,
  isLoading:  true,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),
  signOut: async () => {
    // Sign out on THIS device. supabase-js only clears its persisted token when
    // the server revoke request succeeds (or returns 401/403/404); a network
    // error, timeout or 5xx makes it skip the local cleanup and leave the token
    // in AsyncStorage: so the next launch reads it back and silently signs the
    // user in again. Attempt the (local-scope) revoke, then sweep any residual
    // Supabase auth token ourselves so sign-out can't be undone by a flaky
    // network.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // The storage sweep below is what actually guarantees sign-out.
    }
    try {
      const keys = await AsyncStorage.getAllKeys();
      const authKeys = keys.filter((k) => k.startsWith('sb-') && k.includes('-auth-token'));
      if (authKeys.length) await AsyncStorage.multiRemove(authKeys);
    } catch {
      // Best effort: the in-memory clear below still logs the user out for
      // this session even if storage can't be touched.
    }
    // Cancel the notifications themselves BEFORE dropping the markers that
    // record them. clearUserScopedCaches wipes the notif_* keys, which are only
    // this app's record of what it scheduled: iOS keeps the actual reminders,
    // and would deliver the previous account's to whoever signs in next. Card
    // 225. Order matters, since once the markers are gone nothing can identify
    // the leftovers.
    try {
      await cancelAllNotifications();
    } catch {
      // Notification cleanup must never block sign-out. Leaving a stale
      // reminder behind is a bug; leaving someone signed in when they asked
      // not to be is a much worse one.
    }

    // Drop this user's cached data so the next account on this device starts
    // clean rather than briefly seeing the previous user's schedule/readiness.
    await clearUserScopedCaches();
    set({ session: null, user: null });
  },
}));
