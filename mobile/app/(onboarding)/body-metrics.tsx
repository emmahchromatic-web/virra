import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 210;
const DEFAULT_DOB = new Date(new Date().getFullYear() - 30, 0, 1);

export default function BodyMetricsScreen() {
  const { setStep } = useOnboarding();
  const { session } = useAuthStore();
  useFocusEffect(React.useCallback(() => { setStep(8); }, [setStep]));

  const [dob, setDob]                 = useState<Date | null>(null);
  const [showPicker, setShowPicker]   = useState(false);
  const [heightCm, setHeightCm]       = useState(165);
  const [trackWeight, setTrackWeight] = useState(false);
  const [saving, setSaving]           = useState(false);

  function stepHeight(delta: number) {
    setHeightCm((h) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h + delta)));
  }

  function onPickDate(_event: unknown, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) setDob(selected);
  }

  async function finish(withMetrics: boolean) {
    // Same failure as the diet step: with no session the update is impossible.
    // This previously dropped the user at the paywall and silently discarded
    // whatever they had entered.
    if (!session) {
      Alert.alert(
        'You are not signed in',
        'We could not save your details because your session has expired. Sign in again and we will pick up from here.',
        [{ text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') }],
      );
      return;
    }
    if (withMetrics) {
      setSaving(true);
      const { error } = await supabase
        .from('user_profiles')
        .update({
          date_of_birth: dob ? dob.toISOString().split('T')[0] : null,
          height_cm:     heightCm,
          track_weight:  trackWeight,
        })
        .eq('id', session.user.id);
      setSaving(false);
      if (error) { Alert.alert('Something went wrong', error.message); return; }
    }
    router.replace('/(auth)/paywall');
  }

  const dobLabel = dob
    ? dob.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Select your date of birth';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Personalise your fuelling.
      </VirraText>
      <VirraText variant="body" size={15} color="rgba(244,237,224,0.6)" style={styles.sub}>
        A few basics let Virra tune your nutrition targets to you, not a generic average. This is optional. Skip to use standard targets.
      </VirraText>

      {/* Date of birth */}
      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
          DATE OF BIRTH
        </VirraText>
        <Pressable style={styles.field} onPress={() => setShowPicker((s) => !s)}>
          <VirraText variant="body" size={16} color={dob ? colors.breath : 'rgba(244,237,224,0.35)'}>
            {dobLabel}
          </VirraText>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={dob ?? DEFAULT_DOB}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={onPickDate}
            themeVariant="dark"
            style={styles.picker}
          />
        )}
      </View>

      {/* Height */}
      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
          HEIGHT (CM)
        </VirraText>
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => stepHeight(-1)} hitSlop={12}>
            <VirraText variant="display" size={28} color={colors.breath}>–</VirraText>
          </Pressable>
          <View style={styles.stepValue}>
            <VirraText variant="display" size={40} color={colors.pulse}>{heightCm}</VirraText>
            <VirraText variant="mono" size={11} color={colors.muted}>CM</VirraText>
          </View>
          <Pressable style={styles.stepBtn} onPress={() => stepHeight(1)} hitSlop={12}>
            <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
          </Pressable>
        </View>
      </View>

      {/* Weight tracking opt-in */}
      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
          WEIGHT
        </VirraText>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <VirraText variant="body" size={15} color={colors.breath}>
              Use my Apple Health weight
            </VirraText>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={{ marginTop: 2 }}>
              Sharpens your fuelling targets. You&apos;re in control: weight is never shown unless you turn this on.
            </VirraText>
          </View>
          <Switch
            value={trackWeight}
            onValueChange={setTrackWeight}
            trackColor={{ false: colors.border, true: `${colors.pulse}99` }}
            thumbColor={trackWeight ? colors.pulse : 'rgba(244,237,224,0.4)'}
            ios_backgroundColor={colors.border}
          />
        </View>
      </View>

      <VirraButton label="CONTINUE" onPress={() => finish(true)} loading={saving} style={styles.cta} />
      <Pressable style={styles.skip} onPress={() => finish(false)} hitSlop={8}>
        <VirraText variant="mono" size={12} color={colors.muted}>SKIP FOR NOW</VirraText>
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
  field:      { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  picker:     { alignSelf: 'center' },
  stepper:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  stepBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepValue:  { alignItems: 'center' },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.mist, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cta:        { marginTop: spacing.sm },
  skip:       { alignSelf: 'center', paddingVertical: spacing.sm },
});
