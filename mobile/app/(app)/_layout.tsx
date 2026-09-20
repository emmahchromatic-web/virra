import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { useNotificationsStore } from '@/store/notifications';
import { getEntitlementInfo } from '@/lib/revenuecat';
import { isProStatus } from '@/lib/pro';
import { recomputeSeasonForUser } from '@/lib/seasonEngine';
import { importNewWorkouts } from '@/lib/healthKitImport';
import { importNewWeightSamples } from '@/lib/healthKitWeight';
import { scheduleDailyReminders, scheduleWeeklyPlanReminder, loadNotificationPreferences, cancelTrialReminders, scheduleTrialReminders } from '@/lib/notifications';
import { colors } from '@/constants/theme';
import { startNetworkListener, useNetworkStore } from '@/store/network';
import { syncPending } from '@/lib/syncPending';
import { SyncPill } from '@/components/SyncPill';
// Registers the outbox handlers — must run before any drain(). (updateFoodEntry
// was missing here from its own task, silently orphaning that kind: a queued
// edit would never find a registered handler and drain() would just halt on
// it forever, per its "no handler registered yet" branch. Fixed alongside
// wiring in saveMealCombo since both are the same class of bug.)
import '@/lib/outbox/handlers/completeWorkout';
import '@/lib/outbox/handlers/checkIn';
import '@/lib/outbox/handlers/deleteFoodEntry';
import '@/lib/outbox/handlers/updateFoodEntry';
import '@/lib/outbox/handlers/saveMealCombo';
import '@/lib/outbox/handlers/toggleFavourite';
import '@/lib/outbox/handlers/logFoodEntries';
import '@/lib/outbox/handlers/dropSession';
import '@/lib/outbox/handlers/moveSession';

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

  // Card 298. The week ahead plans around a plan she does not have on the
  // free tier; pushing her at a locked screen on a Sunday evening is a nag.
  if (!isProStatus(useSubscriptionStore.getState().status, useSubscriptionStore.getState().isActive)) return;

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
  const { loadFromSupabase, periodStart, cycleLength, periodDays } = useCycleStore();
  const { load: loadProfile, trackWeight } = useProfileStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isLoading && !session) router.replace('/(auth)');
  }, [session, isLoading]);

  // Ask RevenueCat where she stands and mirror it into the store.
  const syncEntitlement = useCallback(() => {
    // Internal "Preview as" pin on the Subscription screen wins over everything.
    if (useSubscriptionStore.getState().devOverride) return;
    if (process.env.EXPO_PUBLIC_INTERNAL_BUILD === 'true') {
      setStatus('trial');
      return;
    }
    getEntitlementInfo().then((info) => {
      if (info.isActive && info.isTrial) {
        setStatus('trial', info.trialEnd ?? undefined);
        if (info.trialEnd) scheduleTrialReminders(info.trialEnd);
      } else if (info.isActive) {
        setStatus('active');
      } else {
        // Card 298. No entitlement no longer means no app. She goes in on
        // the free tier and meets Virra Pro where it prescribes something:
        // the locked tiles and ProScreen do the gating from here.
        setStatus(info.everSubscribed ? 'expired' : 'free');
      }
    });
  }, [setStatus]);

  useEffect(() => {
    if (!session || isActive) return;
    syncEntitlement();
    // subStatus: clearing the preview pin drops the status back to `unknown`
    // without touching isActive, and that has to trigger a fresh ask.
  }, [session, isActive, subStatus === 'unknown', syncEntitlement]);

  // The downgrade. A trial cancelled in Apple's settings stays active until
  // day 14 and lapses on day 15, and iOS keeps the app in memory for days:
  // checking only when "not active" meant a lapsed trial stayed Pro until the
  // process happened to be killed. Re-ask every time she comes back.
  useEffect(() => {
    if (!session) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncEntitlement();
    });
    return () => sub.remove();
  }, [session, syncEntitlement]);

  // The upgrade. Races are free to add but the season they make is Pro, so a
  // free user can hold two races and no season. Build it the moment she has
  // Pro. Idempotent: returns early when an active season already exists.
  useEffect(() => {
    if (!session?.user.id || !isActive) return;
    recomputeSeasonForUser(
      session.user.id,
      new Date().toLocaleDateString('en-CA'),
      useCycleStore.getState().cycleProfile,
    ).catch(() => { /* next launch tries again */ });
  }, [session?.user.id, isActive]);

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

  // Run HealthKit import on foreground; fires on mount and every app resume
  useEffect(() => {
    if (!session?.user.id) return;

    function runImport() {
      importNewWorkouts({
        userId:      session!.user.id,
        periodStart: periodStart ?? null,
        cycleLength: cycleLength ?? 28,
        periodDays,
      });
      if (trackWeight) {
        importNewWeightSamples({
          userId:      session!.user.id,
          periodStart: periodStart ?? null,
          cycleLength: cycleLength ?? 28,
          periodDays,
        });
      }
    }

    async function reconcilePresented() {
      try {
        const presented = await Notifications.getPresentedNotificationsAsync();
        const add = useNotificationsStore.getState().add;
        for (const n of presented) {
          const c = n.request.content;
          add({
            id:    n.request.identifier,
            title: typeof c.title === 'string' ? c.title : '',
            body:  typeof c.body  === 'string' ? c.body  : '',
            data:  (c.data as Record<string, unknown> | null) ?? null,
          });
        }
      } catch {
        // getPresentedNotificationsAsync is iOS-only and best-effort; ignore failures.
      }
    }

    useNotificationsStore.getState().hydrate().then(reconcilePresented);
    useSubscriptionStore.getState().hydrateProFeatures();

    runImport();
    syncPending(session.user.id);
    scheduleDailyReminders(session.user.id);
    scheduleWeeklyPlanReminder();
    maybeShowWeekAhead();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        syncPending(session.user.id);
        scheduleDailyReminders(session.user.id);
        scheduleWeeklyPlanReminder();
        maybeShowWeekAhead();
        reconcilePresented();
      }
      appState.current = next;
    });

    const stopNetworkListener = startNetworkListener();
    const unsubscribeNet = useNetworkStore.subscribe((s, prev) => {
      if (s.isOnline && !prev.isOnline) syncPending(session.user.id);
    });

    // Capture every delivered notification into the inbox
    const receiveSub = Notifications.addNotificationReceivedListener((event) => {
      const c = event.request.content;
      useNotificationsStore.getState().add({
        id:    event.request.identifier,
        title: typeof c.title === 'string' ? c.title : '',
        body:  typeof c.body  === 'string' ? c.body  : '',
        data:  (c.data as Record<string, unknown> | null) ?? null,
      });
    });

    // Navigate to week-ahead when tapping the weekly planning notification
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'week-ahead') router.push('/(app)/week-ahead' as any);
    });

    return () => {
      sub.remove();
      notifSub.remove();
      receiveSub.remove();
      stopNetworkListener();
      unsubscribeNet();
    };
  }, [session?.user.id, periodStart, cycleLength, periodDays, trackWeight]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mile } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="checkin"         options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan/[id]"       options={{ presentation: 'card'  }} />
        <Stack.Screen name="plans/browse"    options={{ presentation: 'card'  }} />
        <Stack.Screen name="mobility"        options={{ presentation: 'card'  }} />
        <Stack.Screen name="run"             options={{ presentation: 'modal' }} />
        <Stack.Screen name="timeline"        options={{ presentation: 'card'  }} />
        <Stack.Screen name="insights"        options={{ presentation: 'card'  }} />
        <Stack.Screen name="food-search"      options={{ presentation: 'modal' }} />
        <Stack.Screen name="manual-activity" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cycle-settings"  options={{ presentation: 'card'  }} />
        <Stack.Screen name="weight"          options={{ presentation: 'card'  }} />
        <Stack.Screen name="subscription"    options={{ presentation: 'card'  }} />
        <Stack.Screen name="breaks"          options={{ presentation: 'card'  }} />
        <Stack.Screen name="week-ahead"      options={{ presentation: 'card'  }} />
        <Stack.Screen name="week-move"       options={{ presentation: 'card'  }} />
        <Stack.Screen name="settings"        options={{ presentation: 'card'  }} />
        <Stack.Screen name="notifications"   options={{ presentation: 'card'  }} />
        <Stack.Screen name="achievements"    options={{ presentation: 'card'  }} />
        <Stack.Screen name="recipe/[slug]"   options={{ presentation: 'card'  }} />
        <Stack.Screen name="activity/[id]"   options={{ presentation: 'card'  }} />
      </Stack>
      <SyncPill />
    </>
  );
}
