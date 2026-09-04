// mobile/app/(onboarding)/permissions.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { useOnboarding } from '@/context/OnboardingContext';
import { PERMISSIONS, requestPermission, markPermissionsGranted } from '@/lib/permissionsConfig';

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
      markPermissionsGranted();
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
    <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
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
        <VirraText variant="mono" size={10} color="rgba(244,237,224,0.25)" style={styles.counter}>
          {permIndex + 1} of {PERMISSIONS.length}
        </VirraText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1 },
  container: { flexGrow: 1, padding: spacing.lg, justifyContent: 'space-between' },
  content:   { flex: 1, justifyContent: 'center', gap: spacing.lg },
  label:     { letterSpacing: 2 },
  headline:  { lineHeight: 32 },
  body:      { lineHeight: 22 },
  whyCard:   { gap: spacing.sm },
  whyLabel:  { letterSpacing: 1 },
  whyText:   { lineHeight: 20 },
  footer:    { gap: spacing.md, paddingBottom: spacing.xl },
  counter:   { textAlign: 'center', letterSpacing: 1 },
});
