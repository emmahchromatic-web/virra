import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { getActiveEntitlement } from '@/lib/revenuecat';
import { AppTabBar } from '@/components/layout/AppTabBar';
import { colors } from '@/constants/theme';

export default function AppLayout() {
  const { session, isLoading } = useAuthStore();
  const { setStatus }          = useSubscriptionStore();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/(auth)');
    }
  }, [session, isLoading]);

  useEffect(() => {
    if (!session) return;
    getActiveEntitlement().then((active) => {
      setStatus(active ? 'active' : 'expired');
      if (!active) router.replace('/(auth)/paywall');
    });
  }, [session]);

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown:  false,
        contentStyle: { backgroundColor: colors.mile },
      }}
    >
      <Tabs.Screen name="index"    />
      <Tabs.Screen name="training" />
      <Tabs.Screen name="nutrition"/>
      <Tabs.Screen name="library"  />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
