import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { initSentry } from '@/lib/sentry';
// Registers the background location TaskManager task — must be imported
// unconditionally at module scope so iOS can redeliver locations to it even
// before the run screen has mounted.
import '@/lib/backgroundLocationTask';

// Keep the native splash visible until fonts AND session are loaded.
// Errors are non-fatal: if the splash was never shown (hot reload) this no-ops.
SplashScreen.preventAutoHideAsync().catch(() => {});

// As early as possible so startup crashes are captured too.
initSentry();
import {
  BigShouldersDisplay_700Bold,
  BigShouldersDisplay_900Black,
} from '@expo-google-fonts/big-shoulders-display';
import {
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { configureRevenueCat } from '@/lib/revenuecat';
import { colors } from '@/constants/theme';
import { getPostAuthRoute } from '@/lib/permissionsConfig';
import { VirraAlertHost } from '@/components/ui/VirraAlert';
import { readPersistedSession } from '@/lib/persistedSession';

/** How long to wait for getSession before opening on what we already have. */
const SESSION_LOAD_TIMEOUT_MS = 4000;

export default function RootLayout() {
  const { setSession, user } = useAuthStore();
  // undefined = not yet loaded; null = no session; Session = authenticated
  const [initialSession, setInitialSession] = useState<Session | null | undefined>(undefined);

  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_900Black,
    Fraunces_400Regular_Italic,
    Fraunces_600SemiBold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // Step 1: load session, independent of fonts.
  //
  // Card 283. This used to be a bare .then() with no catch and no timeout, and
  // `ready` is gated on initialSession leaving undefined. So when getSession
  // rejected or hung, which it does when the stored JWT needs refreshing and
  // there is no network, initialSession stayed undefined forever: the splash
  // never hid and the app never opened. Emma reported exactly that.
  //
  // Three ways out now, and whichever arrives first wins: the real answer, the
  // rejection, or the timeout. The fallback is the session supabase-js already
  // persisted, NOT null, because null routes to the login screen and bouncing a
  // signed-in woman to a login form the moment she walks into a gym is worse
  // than the bug being fixed.
  useEffect(() => {
    let settled = false;

    async function settle(session: Session | null, viaFallback: boolean) {
      if (settled) return;
      settled = true;
      const resolved = session ?? (viaFallback ? await readPersistedSession() : null);
      setSession(resolved);
      setInitialSession(resolved);
    }

    // A hanging refresh must not be able to pin the splash indefinitely. Long
    // enough not to pre-empt a slow but working network, short enough that a
    // dead one does not read as a frozen app.
    const timer = setTimeout(() => { void settle(null, true); }, SESSION_LOAD_TIMEOUT_MS);

    supabase.auth.getSession()
      .then(({ data: { session } }) => settle(session ?? null, true))
      .catch(() => settle(null, true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { setSession(session); }
    );
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, []);

  // Step 2: route once fonts AND session are both ready (Stack is mounted by then)
  useEffect(() => {
    if (!fontsLoaded || initialSession === undefined) return;

    if (!initialSession) {
      router.replace('/(auth)');
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', initialSession.user.id)
        .maybeSingle();

      // "The query failed" and "this user has no profile" both arrive as a null
      // `data`, and they mean opposite things. Treating the first as the second
      // sent an offline user with a perfectly good account into onboarding,
      // which reads as her account having been deleted. Card 283.
      //
      // Only a SUCCESSFUL query that found nothing is evidence of no profile.
      // If we could not find out, trust the session we already hold and open the
      // app; the screens inside report their own failures honestly.
      if (!error && !data) {
        router.replace('/(onboarding)/welcome');
        return;
      }
      const route = await getPostAuthRoute();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(route as any);
    })();
  }, [fontsLoaded, initialSession]);

  useEffect(() => {
    if (user?.id) configureRevenueCat(user.id);
  }, [user?.id]);

  // Hide the native splash once both fonts and session are ready and routing
  // has fired. This is the atomic transition from splash → real UI; without it
  // the splash would either persist forever or hide too early and reveal a
  // white frame between splash and the first rendered screen.
  const ready = fontsLoaded && initialSession !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // While not ready, render a mile-coloured View instead of null so any frame
  // before the splash hides (or any hot-reload gap) is dark, not white.
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.mile }} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="re-permissions" />
      </Stack>
      {/* Host for appAlert(): themed replacement for Alert.alert. Sits above
          the navigator so alerts render over any screen. */}
      <VirraAlertHost />
    </>
  );
}
