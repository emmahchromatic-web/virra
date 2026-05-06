import React from 'react';
import { View, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { Slot, router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';

function OnboardingLayout() {
  const { currentStep } = useOnboarding();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {currentStep > 1 ? (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <VirraText variant="body" size={20} color={colors.breath}>←</VirraText>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressWrapper}>
          <OnboardingProgressBar currentStep={currentStep} totalSteps={6} />
        </View>
        <View style={styles.backBtn} />
      </View>
      <Slot />
    </SafeAreaView>
  );
}

export default function Layout() {
  return (
    <OnboardingProvider>
      <OnboardingLayout />
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  backBtn:         { width: 32 },
  progressWrapper: { flex: 1 },
});
