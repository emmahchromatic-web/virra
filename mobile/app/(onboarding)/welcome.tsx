import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';

export default function WelcomeScreen() {
  const { setStep } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(1); }, [setStep]));

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image source={require('../../assets/ViRRA.png')} style={styles.wordmark} />
        <VirraText variant="display" size={26} color={colors.breath} style={styles.headline}>
          Training that works with your cycle, not against it.
        </VirraText>
        <View style={styles.bullets}>
          {[
            'Cycle-adjusted training plans',
            'Phase-aware nutrition targets',
            'Seamless HealthKit sync',
          ].map((bullet) => (
            <View key={bullet} style={styles.bullet}>
              <VirraText variant="mono" size={10} color={colors.pulse}>—</VirraText>
              <VirraText variant="body" color="rgba(244,237,224,0.7)" style={styles.bulletText}>
                {bullet}
              </VirraText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <VirraButton
          label="GET STARTED"
          onPress={() => router.push('/(onboarding)/profile')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  hero:       { flex: 1, justifyContent: 'center', gap: spacing.lg },
  wordmark:   { width: 180, height: 72, resizeMode: 'contain' },
  headline:   { lineHeight: 32 },
  bullets:    { gap: spacing.sm, marginTop: spacing.sm },
  bullet:     { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1, lineHeight: 20 },
  footer:     { paddingBottom: spacing.xl },
});
