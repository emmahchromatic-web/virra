import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';

// Keep the native splash visible until fonts AND session are loaded.
// Errors are non-fatal — if the splash was never shown (hot reload) this no-ops.
SplashScreen.preventAutoHideAsync().catch(() => {});
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

const BOOT_T0 = Date.now();
function bootMark(label: string) {
  console.log(`[boot] +${Date.now() - BOOT_T0}ms ${label}`);
}

export default function RootLayout() {
  const { setSession, user } = useAuthStore();
  // undefined = not yet loaded; null = no session; Session = authenticated
  const [initialSession, setInitialSession] = useState<Session | null | undefined>(undefined);
  const [routed, setRouted] = useState(false);

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

  useEffect(() => { if (fontsLoaded) bootMark('fonts loaded'); }, [fontsLoaded]);

  // Step 1: load session, independent of fonts
  useEffect(() => {
    bootMark('getSession start');
    supabase.auth.getSession().then(({ data: { session } }) => {
      bootMark(`getSession resolved (session=${session ? 'yes' : 'no'})`);
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
      bootMark('routing → /(auth)');
      router.replace('/(auth)');
      setRouted(true);
      return;
    }

    (async () => {
      bootMark('user_profiles fetch start');
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', initialSession.user.id)
        .maybeSingle();
      bootMark(`user_profiles fetch done${error ? ` (error: ${error.message})` : ''}`);

      if (!data) {
        bootMark('routing → /(onboarding)/welcome');
        router.replace('/(onboarding)/welcome');
        setRouted(true);
        return;
      }
      const route = await getPostAuthRoute();
      bootMark(`routing → ${route}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(route as any);
      setRouted(true);
    })();
  }, [fontsLoaded, initialSession]);

  useEffect(() => {
    if (user?.id) configureRevenueCat(user.id);
  }, [user?.id]);

  // Hold the native splash until routing has actually fired. Hiding it
  // earlier reveals a blank dark frame while user_profiles is still being
  // fetched — which reads as "stuck on splash" to the user. We instead hide
  // it the moment the route is about to mount, so the splash → real UI
  // transition is atomic.
  useEffect(() => {
    if (routed) {
      bootMark('hiding native splash');
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [routed]);

  if (!routed) {
    return <View style={{ flex: 1, backgroundColor: colors.mile }} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="re-permissions" />
    </Stack>
  );
}
