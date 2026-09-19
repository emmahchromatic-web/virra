// mobile/src/store/auth.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearUserScopedCaches } from '@/lib/localCaches';
import { cancelAllNotifications } from '@/lib/notifications';
import { useNotificationsStore } from '@/store/notifications';
import { useSessionStore } from '@/store/sessionStore';
import { useSubscriptionStore } from '@/store/subscription';
import { useProfileStore } from '@/store/profile';
import { useCycleStore } from '@/store/cycle';
import { useNutritionDay } from '@/store/nutritionDay';
import { useRecipesStore } from '@/store/recipes';
import { useRecentFoods } from '@/store/recentFoods';

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

    // Clearing STORAGE is not clearing the app. Both persisted stores keep
    // their contents in memory, and nothing reloads between sign-out and the
    // next sign-in, so the previous account's data stays on screen even though
    // its keys are gone.
    //
    // Card 225 failed build 14 exactly here: the notifications store guards
    // `hydrate()` behind a `hydrated` flag that was still true, so it never
    // re-read the emptied key and rendered the old inbox from memory. The
    // session store has the same shape, and its `clearCache` had never been
    // called from anywhere.
    //
    // This runs BEFORE the storage sweep, not after. `clearCache` resets a
    // zustand `persist` store, so the reset itself writes the emptied state
    // straight back to `virra:sessions:v1`. Sweeping afterwards removes the key
    // it just recreated; doing it the other way round leaves a user-scoped key
    // rebuilt at the moment of sign-out, which is the shape of the bug this is
    // fixing.
    // Card 298 hardening. The tier is in memory too. Without this, a free
    // account signing in after a Pro one (same phone, app never closed) saw
    // everything unlocked until the next foreground re-check. `unknown` makes
    // the app layout ask RevenueCat again for whoever signs in next, and
    // RevenueCat itself is dropped to an anonymous customer. The internal
    // preview pin and the Show Pro features switch are device-level and stay.
    try {
      const sub = useSubscriptionStore.getState();
      if (!sub.devOverride) sub.setStatus('unknown');
      // Imported here, not at the top: the billing SDK is native-only, and a
      // static import would drag it into every screen test that touches auth.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logOutRevenueCat } = require('@/lib/revenuecat') as typeof import('@/lib/revenuecat');
      await logOutRevenueCat();
    } catch {
      // Never block sign-out on the billing SDK.
    }

    // J2 reads added five more persisted stores with exactly the same shape as
    // the session store -- contents held in memory, nothing reloading between
    // sign-out and the next sign-in. They are reset here alongside it, and
    // BEFORE the storage sweep below, for the reason spelled out above: a
    // `persist` reset writes the emptied state straight back to its key, so
    // the sweep has to come afterwards to remove what the reset just
    // recreated.
    //
    // `recipes` is the one that leaks PERMANENTLY without this, not just until
    // the next refresh: `refreshFavourites` keeps the old cache whenever a
    // non-empty list comes back empty (its suspected-failure guard), and
    // account B's genuine empty favourites list is indistinguishable from that
    // -- so A's favourites would survive every subsequent refresh B triggers.
    //
    // Each reset is guarded on its own: one store refusing to reset must not
    // skip the others (they are the difference between accounts on a shared
    // device), and must not leave someone signed in either.
    const resets: (() => void | Promise<void>)[] = [
      () => useNotificationsStore.getState().reset(),
      () => useSessionStore.getState().clearCache(),
      () => useProfileStore.getState().clear(),
      () => useCycleStore.getState().clear(),
      () => useNutritionDay.getState().clear(),
      () => useRecipesStore.getState().clear(),
      () => useRecentFoods.getState().clear(),
    ];
    for (const reset of resets) {
      try {
        await reset();
      } catch {
        // Same rule as the notification cancel above: a store that will not
        // reset must not leave someone signed in.
      }
    }

    // Drop this user's cached data so the next account on this device starts
    // clean rather than briefly seeing the previous user's schedule/readiness.
    await clearUserScopedCaches();
    set({ session: null, user: null });
  },
}));
