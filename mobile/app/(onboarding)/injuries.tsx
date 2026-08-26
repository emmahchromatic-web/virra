import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { appAlert } from '@/components/ui/VirraAlert';
import { INJURY_LEVELS, type InjuryLevel } from '@/lib/injuryLevels';

export default function InjuriesScreen() {
  const { setStep } = useOnboarding();
  const { session } = useAuthStore();
  useFocusEffect(React.useCallback(() => { setStep(8); }, [setStep]));

  const [level,  setLevel]  = useState<InjuryLevel | null>(null);
  const [saving, setSaving] = useState(false);

  async function finish() {
    if (!level) return;
    // Same guard as the body-metrics step: with no session the update is
    // impossible, and silently landing at the paywall discards the answer.
    if (!session) {
      appAlert(
        'You are not signed in',
        'We could not save your details because your session has expired. Sign in again and we will pick up from here.',
        [{ text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') }],
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({ injury_level: level })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) { appAlert('Something went wrong', error.message); return; }

    router.replace('/(auth)/paywall');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        How does your body handle running?
      </VirraText>

      {/* Health data being used to change someone's training warrants saying so
          before they answer, not in a settings screen they will never open. */}
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={styles.sub}>
        This shapes how quickly we build your training. It is not medical advice,
        and if something hurts, see someone qualified rather than us.
      </VirraText>

      <View style={styles.options}>
        {INJURY_LEVELS.map((opt) => {
          const active = level === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setLevel(opt.value)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={opt.label}
            >
              <VirraText variant="body" size={16} color={active ? colors.mile : colors.breath}>
                {opt.label}
              </VirraText>
              {opt.detail ? (
                <VirraText
                  variant="body"
                  size={13}
                  color={active ? 'rgba(10,10,15,0.7)' : colors.muted}
                  style={{ marginTop: 2, lineHeight: 18 }}
                >
                  {opt.detail}
                </VirraText>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <VirraButton
        label="CONTINUE"
        onPress={finish}
        loading={saving}
        disabled={!level}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title:     { lineHeight: 34 },
  sub:       { lineHeight: 20, marginTop: -spacing.sm },
  options:   { gap: spacing.sm },
  option: {
    backgroundColor: colors.mist,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.control,
    padding:         spacing.md,
  },
  optionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  cta:       { marginTop: spacing.sm },
});
