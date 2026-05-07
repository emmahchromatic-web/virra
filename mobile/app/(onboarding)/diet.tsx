// mobile/app/(onboarding)/diet.tsx
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { useCycleStore } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

type DietaryPref = 'vegan' | 'vegetarian' | 'gluten-free' | 'dairy-free' | 'nut-free' | 'halal';

const DIET_OPTIONS: { value: DietaryPref; label: string }[] = [
  { value: 'vegan',       label: 'Vegan' },
  { value: 'vegetarian',  label: 'Vegetarian' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'dairy-free',  label: 'Dairy-free' },
  { value: 'nut-free',    label: 'Nut-free' },
  { value: 'halal',       label: 'Halal' },
];

export default function DietScreen() {
  const { setStep, data }   = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(6); }, []));

  const { session }         = useAuthStore();
  const { setPeriodStart }  = useCycleStore();
  const [selected, setSelected] = useState<Set<DietaryPref>>(new Set());
  const [saving, setSaving]     = useState(false);

  function toggle(pref: DietaryPref) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pref) ? next.delete(pref) : next.add(pref);
      return next;
    });
  }

  function parseFiveKToPaceSecPerKm(fiveKTime: string): number | null {
    const parts = fiveKTime.split(':');
    if (parts.length !== 2) return null;
    const mm = parseInt(parts[0], 10);
    const ss = parseInt(parts[1], 10);
    if (isNaN(mm) || isNaN(ss)) return null;
    return Math.round((mm * 60 + ss) / 5);
  }

  async function handleContinue() {
    if (!session) return;
    setSaving(true);
    const userId = session.user.id;
    const today  = new Date().toISOString().split('T')[0];

    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id:                  userId,
      fitness_level:       data.fitnessLevel,
      running_goal:        data.runningGoal,
      dietary_prefs:       Array.from(selected),
      onboarding_complete: true,
    });

    if (profileError) {
      Alert.alert('Something went wrong', profileError.message);
      setSaving(false);
      return;
    }

    if (data.fitnessLevel) {
      const { error } = await supabase.from('fitness_assessments').insert({
        user_id:                    userId,
        assessed_on:                today,
        stated_level:               data.fitnessLevel,
        actual_pace_seconds_per_km: parseFiveKToPaceSecPerKm(data.fiveKTime),
        trigger_description:        'onboarding',
      });
      if (error) console.error('[diet] fitness_assessments insert failed:', error);
    }

    if (data.periodStart) {
      const { error } = await supabase.from('cycle_logs').insert({
        user_id:            userId,
        period_start:       data.periodStart.toISOString().split('T')[0],
        cycle_length_days:  data.cycleLength,
      });
      if (error) console.error('[diet] cycle_logs insert failed:', error);
    }

    if (data.periodStart) {
      setPeriodStart(data.periodStart);
    }

    setSaving(false);
    router.replace('/(auth)/paywall');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Any dietary preferences?
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        Shapes your nutrition guidance. Select all that apply — none is fine too.
      </VirraText>

      <View style={styles.chipGrid}>
        {DIET_OPTIONS.map((opt) => {
          const active = selected.has(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggle(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <VirraText
                variant="mono"
                size={12}
                color={active ? colors.mile : 'rgba(244,237,224,0.7)'}
              >
                {opt.label}
              </VirraText>
            </Pressable>
          );
        })}
      </View>

      <VirraButton label="CONTINUE" onPress={handleContinue} loading={saving} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1 },
  container:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:      { lineHeight: 34 },
  sub:        { lineHeight: 22, marginTop: -spacing.md },
  chipGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip:       { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  chipActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  cta:        { marginTop: spacing.sm },
});
