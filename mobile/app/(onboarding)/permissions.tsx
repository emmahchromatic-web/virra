// mobile/app/(onboarding)/permissions.tsx
import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding } from '@/context/OnboardingContext';

const PERMISSIONS = [
  {
    id:       'health',
    label:    'HEALTH + ACTIVITY',
    headline: 'Your health data, working for you.',
    body:     "Virra reads your workout history to pre-fill your fitness baseline — and pulls cycle data if you've logged it in Apple Health.",
    why:      'Your data never leaves your device. Virra never uploads or sells health information.',
    optional: false,
  },
  {
    id:       'location',
    label:    'GPS + LOCATION',
    headline: 'Track every run, automatically.',
    body:     'Virra uses GPS to map routes, measure pace in real time, and log splits — all without touching your phone mid-run.',
    why:      "Without this, Virra can't track runs live. Your Watch data still syncs automatically.",
    optional: false,
  },
  {
    id:       'notifications',
    label:    'REMINDERS + ALERTS',
    headline: 'Stay on track without checking the app.',
    body:     'Virra sends smart reminders that cancel themselves as soon as the action is done.',
    why:      "Training reminders cancel when your workout is logged. Nutrition reminders cancel when you've logged a meal.",
    optional: false,
  },
  {
    id:       'camera',
    label:    'BARCODE SCANNER',
    headline: 'Log food in seconds.',
    body:     'Scan any barcode to log food instantly — no typing, no searching.',
    why:      'You can always add this later in Settings. It only affects barcode scanning.',
    optional: true,
  },
] as const;

async function requestPermission(id: string): Promise<void> {
  switch (id) {
    case 'health': {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NativeModules } = require('react-native');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Constants } = require('react-native-health');
        const HK = NativeModules.AppleHealthKit;
        if (!HK?.initHealthKit) return;
        await new Promise<void>((resolve) => {
          HK.initHealthKit(
            {
              permissions: {
                read: [
                  Constants.Permissions.HeartRate,
                  Constants.Permissions.ActiveEnergyBurned,
                  Constants.Permissions.DistanceWalkingRunning,
                  Constants.Permissions.Steps,
                  Constants.Permissions.Workout,
                ],
                write: [Constants.Permissions.Workout],
              },
            },
            () => resolve()
          );
        });
      } catch { /* HK unavailable */ }
      break;
    }
    case 'location':
      await Location.requestForegroundPermissionsAsync();
      break;
    case 'notifications':
      await Notifications.requestPermissionsAsync();
      break;
    case 'camera':
      await Camera.requestCameraPermissionsAsync();
      break;
  }
}

export default function PermissionsScreen() {
  const { setStep } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(3); }, [setStep]));

  const [permIndex, setPermIndex] = useState(0);
  const [loading, setLoading]     = useState(false);

  const current = PERMISSIONS[permIndex];

  function advance() {
    if (permIndex < PERMISSIONS.length - 1) {
      setPermIndex(permIndex + 1);
    } else {
      router.push('/(onboarding)/fitness');
    }
  }

  async function handleContinue() {
    setLoading(true);
    await requestPermission(current.id);
    setLoading(false);
    advance();
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.label}>
          {current.label}
        </VirraText>
        <VirraText variant="display" size={26} color={colors.breath} style={styles.headline}>
          {current.headline}
        </VirraText>
        <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.body}>
          {current.body}
        </VirraText>
        <VirraCard style={styles.whyCard}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.whyLabel}>
            WHY THIS MATTERS
          </VirraText>
          <VirraText variant="body" size={13} color="rgba(244,237,224,0.7)" style={styles.whyText}>
            {current.why}
          </VirraText>
        </VirraCard>
      </View>
      <View style={styles.footer}>
        <VirraButton label="CONTINUE" onPress={handleContinue} loading={loading} />
        {current.optional && (
          <Pressable onPress={advance} style={styles.skip}>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.4)">
              Skip for now
            </VirraText>
          </Pressable>
        )}
        <VirraText variant="mono" size={10} color="rgba(244,237,224,0.25)" style={styles.counter}>
          {permIndex + 1} of {PERMISSIONS.length}
        </VirraText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  content:   { flex: 1, justifyContent: 'center', gap: spacing.lg },
  label:     { letterSpacing: 2 },
  headline:  { lineHeight: 32 },
  body:      { lineHeight: 22 },
  whyCard:   { gap: spacing.sm },
  whyLabel:  { letterSpacing: 1 },
  whyText:   { lineHeight: 20 },
  footer:    { gap: spacing.md, paddingBottom: spacing.xl },
  skip:      { alignItems: 'center', paddingVertical: spacing.sm },
  counter:   { textAlign: 'center', letterSpacing: 1 },
});
