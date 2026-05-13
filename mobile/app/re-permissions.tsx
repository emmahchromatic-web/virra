import React, { useState } from 'react';
import { View, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';
import { PERMISSIONS, requestPermission, markPermissionsGranted } from '@/lib/permissionsConfig';

export default function RePermissionsScreen() {
  const [permIndex, setPermIndex] = useState(0);
  const [loading, setLoading]     = useState(false);

  const current = PERMISSIONS[permIndex];

  async function finish() {
    await markPermissionsGranted();
    router.replace('/(app)/(tabs)');
  }

  function advance() {
    if (permIndex < PERMISSIONS.length - 1) {
      setPermIndex(permIndex + 1);
    } else {
      finish();
    }
  }

  async function handleContinue() {
    setLoading(true);
    await requestPermission(current.id);
    setLoading(false);
    advance();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <View style={styles.progressWrapper}>
          <OnboardingProgressBar currentStep={permIndex + 1} totalSteps={PERMISSIONS.length} />
        </View>
        <View style={styles.headerSide} />
      </View>
      <View style={styles.container}>
        <View style={styles.content}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.kicker}>
            WELCOME BACK · {current.label}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          { flexDirection: 'row', alignItems: 'center',
                     paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  headerSide:      { width: 32, height: 32 },
  progressWrapper: { flex: 1 },
  container:       { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  content:         { flex: 1, justifyContent: 'center', gap: spacing.lg },
  kicker:          { letterSpacing: 2 },
  headline:        { lineHeight: 32 },
  body:            { lineHeight: 22 },
  whyCard:         { gap: spacing.sm },
  whyLabel:        { letterSpacing: 1 },
  whyText:         { lineHeight: 20 },
  footer:          { gap: spacing.md, paddingBottom: spacing.xl },
  skip:            { alignItems: 'center', paddingVertical: spacing.sm },
  counter:         { textAlign: 'center', letterSpacing: 1 },
});
