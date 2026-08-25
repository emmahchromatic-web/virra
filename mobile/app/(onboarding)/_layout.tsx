import React from 'react';
import { View, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { Slot, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';

function OnboardingLayout() {
  const { currentStep } = useOnboarding();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
          disabled={currentStep <= 1}
        >
          {currentStep > 1 && (
            <SymbolView name="chevron.left" size={20} tintColor={colors.breath} />
          )}
        </Pressable>
        <View style={styles.progressWrapper}>
          <OnboardingProgressBar currentStep={currentStep} totalSteps={8} />
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
  backBtn:         { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  progressWrapper: { flex: 1 },
});
