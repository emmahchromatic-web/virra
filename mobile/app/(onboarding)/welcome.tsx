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
      <View style={styles.topSpacer} />
      <View style={styles.hero}>
        <View style={styles.heroContent}>
          <Image
            source={require('../../assets/Splash2.png')}
            style={styles.splash}
            resizeMode="contain"
          />
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
      </View>
      <View style={styles.bottomSpacer} />
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
  container:    { flex: 1, padding: spacing.lg },
  topSpacer:    { flex: 1 },
  bottomSpacer: { flex: 1.6 },
  hero:         { alignItems: 'center' },
  // Image + bullets share one column the width of the splash, so the bullets
  // left-align to the wordmark/tagline edge of the image.
  heroContent:  { width: 300, gap: spacing.xl },
  splash:       { width: 300, height: 130 },
  bullets:      { gap: spacing.sm },
  bullet:       { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletText:   { lineHeight: 20 },
  footer:       { paddingBottom: spacing.xl },
});
