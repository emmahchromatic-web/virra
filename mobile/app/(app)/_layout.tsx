import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { getEntitlementInfo } from '@/lib/revenuecat';
import { importNewWorkouts } from '@/lib/healthKitImport';
import { scheduleDailyReminders, scheduleWeeklyPlanReminder, loadNotificationPreferences, cancelTrialReminders, scheduleTrialReminders } from '@/lib/notifications';
import { colors } from '@/constants/theme';

function nextMondayISO(): string {
  const now    = new Date();
  const dow    = now.getDay();
  const offset = dow === 0 ? 1 : 8 - dow;
  const d      = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.toLocaleDateString('en-CA');
}

async function maybeShowWeekAhead(): Promise<void> {
  const now  = new Date();
  const dow  = now.getDay();  // 0 = Sunday
  const hour = now.getHours();

  // Only prompt from Sunday 18:00 onwards (Mon–Sat counts as "past Sunday")
  if (dow === 0 && hour < 18) return;

  const prefs = await loadNotificationPreferences();
  if (!prefs.weeklyPlan) return;

  const key     = `virra:week_ahead_${nextMondayISO()}`;
  const already = await AsyncStorage.getItem(key);
  if (already) return;

  await AsyncStorage.setItem(key, '1');
  router.push('/(app)/week-ahead' as any);
}

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
    getEntitlementInfo().then((info) => {
      if (info.isActive && info.isTrial) {
        setStatus('trial', info.trialEnd ?? undefined);
        if (info.trialEnd) scheduleTrialReminders(info.trialEnd);
      } else if (info.isActive) {
        setStatus('active');
      } else {
        setStatus('expired');
        router.replace('/(auth)/paywall');
      }
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
    scheduleDailyReminders(session.user.id);
    scheduleWeeklyPlanReminder();
    maybeShowWeekAhead();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        scheduleDailyReminders(session.user.id);
        scheduleWeeklyPlanReminder();
        maybeShowWeekAhead();
      }
      appState.current = next;
    });

    // Navigate to week-ahead when tapping the weekly planning notification
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'week-ahead') router.push('/(app)/week-ahead' as any);
    });

    return () => { sub.remove(); notifSub.remove(); };
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
      <Stack.Screen name="subscription"    options={{ presentation: 'card'  }} />
      <Stack.Screen name="breaks"          options={{ presentation: 'card'  }} />
      <Stack.Screen name="week-ahead"      options={{ presentation: 'card'  }} />
      <Stack.Screen name="settings"        options={{ presentation: 'card'  }} />
    </Stack>
  );
}
