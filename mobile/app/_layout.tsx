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

  // Step 1: load session, independent of fonts
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialSession(session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { setSession(session); }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Step 2: route once fonts AND session are both ready (Stack is mounted by then)
  useEffect(() => {
    if (!fontsLoaded || initialSession === undefined) return;

    if (!initialSession) {
      router.replace('/(auth)');
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', initialSession.user.id)
        .maybeSingle();

      if (!data) {
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
