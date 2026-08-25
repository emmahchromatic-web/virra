import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { appAlert } from '@/components/ui/VirraAlert';

const MAX_LENGTH = 500;

export default function InjuriesScreen() {
  const { setStep } = useOnboarding();
  const { session } = useAuthStore();
  useFocusEffect(React.useCallback(() => { setStep(8); }, [setStep]));

  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);

  async function finish(withHistory: boolean) {
    // Same guard as the body-metrics step: with no session the update is
    // impossible, and silently dropping the user at the paywall loses what
    // they just typed.
    if (!session) {
      appAlert(
        'You are not signed in',
        'We could not save your details because your session has expired. Sign in again and we will pick up from here.',
        [{ text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') }],
      );
      return;
    }
    const trimmed = text.trim();
    if (withHistory && trimmed) {
      setSaving(true);
      const { error } = await supabase
        .from('user_profiles')
        .update({ injury_history: trimmed })
        .eq('id', session.user.id);
      setSaving(false);
      if (error) { appAlert('Something went wrong', error.message); return; }
    }
    router.replace('/(auth)/paywall');
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Anything we should know about?
      </VirraText>
      <VirraText variant="body" size={15} color="rgba(244,237,224,0.6)" style={styles.sub}>
        Old injuries, niggles, or anything you work around. This is context for
        you and anyone coaching you, and it is not used to change your plan.
        Leave it blank if there is nothing.
      </VirraText>

      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
          INJURY HISTORY
        </VirraText>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
          placeholder="e.g. Left achilles, on and off since March. Right knee after a fall in 2024."
          placeholderTextColor="rgba(244,237,224,0.35)"
          multiline
          textAlignVertical="top"
          accessibilityLabel="Injury history"
        />
        <VirraText variant="mono" size={10} color={colors.muted} style={{ alignSelf: 'flex-end' }}>
          {`${text.length}/${MAX_LENGTH}`}
        </VirraText>
      </View>

      <VirraButton label="CONTINUE" onPress={() => finish(true)} loading={saving} style={styles.cta} />
      <Pressable style={styles.skip} onPress={() => finish(false)} hitSlop={8}>
        <VirraText variant="mono" size={12} color={colors.muted}>NOTHING TO ADD</VirraText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1 },
  container:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:      { lineHeight: 34 },
  sub:        { lineHeight: 22, marginTop: -spacing.md },
  section:    { gap: spacing.sm },
  fieldLabel: { letterSpacing: 2 },
  input: {
    backgroundColor: colors.mist,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    minHeight:       140,
    color:           colors.breath,
    fontSize:        15,
  },
  cta:  { marginTop: spacing.sm },
  skip: { alignSelf: 'center', paddingVertical: spacing.sm },
});
