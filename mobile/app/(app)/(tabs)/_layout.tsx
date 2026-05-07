import React from 'react';
import { Tabs } from 'expo-router';
import { AppTabBar } from '@/components/layout/AppTabBar';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle:  { backgroundColor: colors.mile },
      }}
    >
      <Tabs.Screen name="index"     />
      <Tabs.Screen name="training"  />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="library"   />
      <Tabs.Screen name="profile"   options={{ href: null }} />
    </Tabs>
  );
}
