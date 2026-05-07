import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
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

    supabase
      .from('user_profiles')
      .select('id')
      .eq('id', initialSession.user.id)
      .maybeSingle()
      .then(({ data }) => {
        router.replace(data ? '/(app)' : '/(onboarding)/welcome');
      });
  }, [fontsLoaded, initialSession]);

  useEffect(() => {
    if (user?.id) configureRevenueCat(user.id);
  }, [user?.id]);

  // Hold render until we know where to route — prevents flash of wrong screen
  if (!fontsLoaded || initialSession === undefined) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
