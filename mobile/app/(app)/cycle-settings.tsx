import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore, type CycleProfile } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string }[] = [
  { value: 'natural',       label: 'Regular cycle',           sub: 'I can roughly predict it'           },
  { value: 'hormonal',      label: 'Hormonal contraception',  sub: 'Pill, IUD, implant or patch'        },
  { value: 'irregular',     label: 'Irregular cycle',         sub: 'Unpredictable or recently changed'  },
  { value: 'perimenopause', label: 'Perimenopause',           sub: 'Cycles changing or stopping'        },
  { value: 'menopause',     label: 'Menopause',               sub: 'No period for 12+ months'           },
];

const NON_NATURAL_NOTE: Partial<Record<CycleProfile, string>> = {
  hormonal:      'Your targets are based on training load — the same science, without cycle phase modulation.',
  perimenopause: 'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:     'Your targets are based on training load. Symptom logging is available throughout.',
};

export default function CycleSettingsScreen() {
  const { session } = useAuthStore();
  const {
    cycleProfile: storeProfile,
    periodStart:  storePeriodStart,
    cycleLength:  storeCycleLength,
    setCycleProfile,
    setPeriodStart,
    setCycleLength,
  } = useCycleStore();

  const [selectedProfile, setSelectedProfile] = useState<CycleProfile>(storeProfile);
  const [periodStart, setPeriodStartLocal]     = useState<Date>(
    storePeriodStart ?? new Date(Date.now() - 28 * MS_PER_DAY),
  );
  const [cycleLength, setCycleLengthLocal] = useState(storeCycleLength);
  const [saving, setSaving]                = useState(false);

  const showDatePickers = selectedProfile === 'natural' || selectedProfile === 'irregular';

  function shiftDate(days: number) {
    setPeriodStartLocal((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ cycle_profile: selectedProfile })
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      if (showDatePickers) {
        const periodStr = periodStart.toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('cycle_logs')
          .select('id')
          .eq('user_id', session.user.id)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('cycle_logs')
            .update({ period_start: periodStr, cycle_length_days: cycleLength })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cycle_logs')
            .insert({ user_id: session.user.id, period_start: periodStr, cycle_length_days: cycleLength });
        }
      }

      setCycleProfile(selectedProfile);
      if (showDatePickers) {
        setPeriodStart(periodStart);
        setCycleLength(cycleLength);
        // Write period start back to Apple Health (best-effort, silent)
        try {
          const { logPeriodStartToHealth } = await import('@/modules/menstrual-health');
          await logPeriodStartToHealth(periodStart.toISOString().split('T')[0]);
        } catch { /* permission not granted or unavailable */ }
      }

      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Cycle</VirraText>
        <View style={{ width: 18 }} />
      </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
          CYCLE PROFILE
        </VirraText>
        {CYCLE_PROFILES.map((opt) => {
          const active = selectedProfile === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setSelectedProfile(opt.value)}
              style={[styles.profileOption, active && styles.profileOptionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                {opt.label}
              </VirraText>
              <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                {opt.sub}
              </VirraText>
            </Pressable>
          );
        })}
      </View>

      {showDatePickers && (
        <>
          <View style={styles.section}>
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.sectionLabel}>
              {selectedProfile === 'irregular'
                ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?'
                : 'LAST PERIOD START'}
            </VirraText>
            <View style={styles.datePicker}>
              <Pressable onPress={() => shiftDate(-1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
              </Pressable>
              <VirraText variant="bodyMedium" size={16} color={colors.breath} style={styles.dateText}>
                {formatDate(periodStart)}
              </VirraText>
              <Pressable onPress={() => shiftDate(1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.sectionLabel}>
              AVERAGE CYCLE LENGTH
            </VirraText>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setCycleLengthLocal((n) => Math.max(21, n - 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
              </Pressable>
              <View style={styles.stepCenter}>
                <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
              </View>
              <Pressable
                onPress={() => setCycleLengthLocal((n) => Math.min(40, n + 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
              </Pressable>
            </View>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.stepHint}>
              Range: 21–40 days
            </VirraText>
          </View>
        </>
      )}

      {!showDatePickers && NON_NATURAL_NOTE[selectedProfile] && (
        <View style={styles.note}>
          <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={styles.noteText}>
            {NON_NATURAL_NOTE[selectedProfile]}
          </VirraText>
        </View>
      )}

      <VirraButton label="SAVE" onPress={handleSave} loading={saving} style={styles.cta} />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:                { flex: 1, backgroundColor: colors.mile },
  scroll:              { flex: 1 },
  container:           { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  header:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 52 },
  backBtn:             { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  section:             { gap: spacing.sm },
  sectionLabel:        { letterSpacing: 2, marginBottom: spacing.xs },
  profileOption:       { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  datePicker:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:             { width: 36, alignItems: 'center' },
  dateText:            { flex: 1, textAlign: 'center' },
  stepper:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:             { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:          { alignItems: 'center', gap: 2 },
  stepHint:            { textAlign: 'center' },
  note:                { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:            { lineHeight: 22 },
  cta:                 { marginTop: spacing.sm },
});
