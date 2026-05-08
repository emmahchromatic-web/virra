import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { getActiveEntitlement } from '@/lib/revenuecat';
import { importNewWorkouts } from '@/lib/healthKitImport';
import { scheduleDailyReminders, cancelTrialReminders } from '@/lib/notifications';
import { colors } from '@/constants/theme';

export default function AppLayout() {
  const { session, isLoading } = useAuthStore();
  const { setStatus, isActive, status: subStatus, trialEnd } = useSubscriptionStore();
  const { loadFromSupabase, periodStart, cycleLength } = useCycleStore();
  const { load: loadProfile } = useProfileStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isLoading && !session) router.replace('/(auth)');
  }, [session, isLoading]);

  useEffect(() => {
    if (!session || isActive) return;
    getActiveEntitlement().then((active) => {
      setStatus(active ? 'active' : 'expired');
      if (!active) router.replace('/(auth)/paywall');
    });
  }, [session, isActive]);

  useEffect(() => {
    if (session?.user.id) loadFromSupabase(session.user.id);
  }, [session?.user.id]);

  useEffect(() => {
    if (session?.user.id) loadProfile(session.user.id);
  }, [session?.user.id]);

  // Cancel trial reminders once subscription is active
  useEffect(() => {
    if (subStatus === 'active') cancelTrialReminders();
  }, [subStatus]);

  // Run HealthKit import on foreground — fires on mount and every app resume
  useEffect(() => {
    if (!session?.user.id) return;

    function runImport() {
      importNewWorkouts({
        userId:      session!.user.id,
        periodStart: periodStart ?? null,
        cycleLength: cycleLength ?? 28,
      });
    }

    runImport();
    scheduleDailyReminders();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        scheduleDailyReminders();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [session?.user.id, periodStart, cycleLength]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="checkin"         options={{ presentation: 'modal' }} />
      <Stack.Screen name="library/[slug]"  options={{ presentation: 'card'  }} />
      <Stack.Screen name="plan/[id]"       options={{ presentation: 'card'  }} />
      <Stack.Screen name="run"             options={{ presentation: 'modal' }} />
      <Stack.Screen name="timeline"        options={{ presentation: 'card'  }} />
      <Stack.Screen name="insights"        options={{ presentation: 'card'  }} />
      <Stack.Screen name="food-search"      options={{ presentation: 'modal' }} />
      <Stack.Screen name="manual-activity" options={{ presentation: 'modal' }} />
      <Stack.Screen name="cycle-settings"  options={{ presentation: 'card'  }} />
    </Stack>
  );
}
