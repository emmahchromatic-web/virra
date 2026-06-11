import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { HormonalSubPicker } from '@/components/cycle/HormonalSubPicker';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string; redsLink?: boolean }[] = [
  { value: 'natural',             label: 'Regular cycle',           sub: 'I can roughly predict it'              },
  { value: 'hormonal',            label: 'Hormonal contraception',  sub: 'Pill, IUD, implant, patch'             },
  { value: 'irregular',           label: 'Irregular cycle',         sub: 'Unpredictable or recently changed', redsLink: true },
  { value: 'pregnant_postpartum', label: 'Pregnant or postpartum',  sub: 'In the last 12 months'                },
  { value: 'perimenopause',       label: 'Perimenopause',           sub: 'Cycles changing or stopping'          },
  { value: 'menopause',           label: 'Menopause',               sub: 'No period for 12+ months'             },
  { value: 'prefer_not_to_say',   label: 'Prefer not to say',       sub: 'Set this up later'                    },
];

const STEADY_NOTE: Partial<Record<CycleProfile, string>> = {
  perimenopause:     'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:         'Your targets are based on training load. Symptom logging is available throughout.',
  prefer_not_to_say: 'Your targets are based on training load. You can update this at any time.',
};

const REDS_URL = 'https://virra.app/advice/reds'; // TODO: update to real article slug before launch

export default function CycleSettingsScreen() {
  const { session } = useAuthStore();
  const store = useCycleStore();

  const [selectedProfile,   setSelectedProfile]   = useState<CycleProfile>(store.cycleProfile);
  const [periodStart,       setPeriodStartLocal]   = useState<Date>(store.periodStart ?? new Date(Date.now() - 28 * MS_PER_DAY));
  const [cycleLength,       setCycleLengthLocal]   = useState(store.cycleLength);
  const [contraceptionType, setContraceptionType]  = useState<ContraceptionType | null>(store.contraceptionType);
  const [hasPlaceboWeek,    setHasPlaceboWeek]     = useState<boolean | null>(store.hasPlaceboWeek);
  const [currentPackStart,  setCurrentPackStart]   = useState<Date | null>(store.currentPackStart);
  const [saving,            setSaving]             = useState(false);

  const showDatePickers = selectedProfile === 'natural' || selectedProfile === 'irregular';

  function shiftDate(days: number) {
    setPeriodStartLocal((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  function handleCopperIUDEscape() {
    setSelectedProfile('natural');
    setContraceptionType(null);
    setHasPlaceboWeek(null);
    setCurrentPackStart(null);
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          cycle_profile:      selectedProfile,
          contraception_type: selectedProfile === 'hormonal' ? (contraceptionType ?? null) : null,
          has_placebo_week:   selectedProfile === 'hormonal' ? (hasPlaceboWeek ?? null) : null,
          current_pack_start: selectedProfile === 'hormonal' && hasPlaceboWeek && currentPackStart
            ? currentPackStart.toISOString().split('T')[0]
            : null,
        })
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

      // Update Zustand store
      store.setCycleProfile(selectedProfile);
      if (showDatePickers) {
        store.setPeriodStart(periodStart);
        store.setCycleLength(cycleLength);
        try {
          const { logPeriodStartToHealth } = await import('@/modules/menstrual-health');
          await logPeriodStartToHealth(periodStart.toISOString().split('T')[0]);
        } catch { /* permission not granted */ }
      }
      // setCycleProfile must run first — setHormonalSubData guards on s.cycleProfile === 'hormonal'
      if (selectedProfile === 'hormonal' && contraceptionType) {
        store.setHormonalSubData({ contraceptionType, hasPlaceboWeek, currentPackStart });
      }

      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Cycle</VirraText>
        <View style={s.headerBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.container}>
        <View style={s.section}>
          <VirraText variant="mono" size={10} color={colors.muted} style={s.sectionLabel}>
            CYCLE PROFILE
          </VirraText>

          {CYCLE_PROFILES.map((opt) => {
            const active = selectedProfile === opt.value;
            return (
              <React.Fragment key={opt.value}>
                <Pressable
                  onPress={() => setSelectedProfile(opt.value)}
                  style={[s.profileOption, active && s.profileOptionActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                    {opt.label}
                  </VirraText>
                  <View style={s.subRow}>
                    <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                      {opt.sub}
                    </VirraText>
                    {opt.redsLink && (
                      <Pressable onPress={(e) => { e.stopPropagation(); Linking.openURL(REDS_URL); }} hitSlop={8}>
                        <VirraText variant="body" size={12} color={colors.dawn} style={s.redsLink}>
                          {' '}· Learn about RED-S
                        </VirraText>
                      </Pressable>
                    )}
                  </View>
                </Pressable>

                {active && opt.value === 'hormonal' && (
                  <HormonalSubPicker
                    contraceptionType={contraceptionType}
                    hasPlaceboWeek={hasPlaceboWeek}
                    currentPackStart={currentPackStart}
                    onCopperIUDEscape={handleCopperIUDEscape}
                    onChange={({ contraceptionType: ct, hasPlaceboWeek: hpw, currentPackStart: cps }) => {
                      setContraceptionType(ct);
                      setHasPlaceboWeek(hpw);
                      setCurrentPackStart(cps);
                    }}
                  />
                )}

                {active && opt.value === 'pregnant_postpartum' && (
                  <View style={s.disclaimerCard}>
                    <VirraText variant="bodyMedium" size={13} color={colors.dawn} style={s.disclaimerTitle}>
                      Pregnancy and postpartum aren't a fitness question — they're a healing one.
                    </VirraText>
                    <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={s.disclaimerBody}>
                      Before we build you a training plan, get cleared to exercise by your midwife, GP, or a women's health physio.
                    </VirraText>
                    <VirraText variant="body" size={11} color="rgba(244,237,224,0.3)" style={s.disclaimerConfirm}>
                      Saving confirms you've had that conversation.
                    </VirraText>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>

        {showDatePickers && (
          <>
            <View style={s.section}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={s.sectionLabel}>
                {selectedProfile === 'irregular' ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?' : 'LAST PERIOD START'}
              </VirraText>
              <View style={s.datePicker}>
                <Pressable onPress={() => shiftDate(-1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
                </Pressable>
                <VirraText variant="bodyMedium" size={16} color={colors.breath} style={s.dateText}>
                  {formatDate(periodStart)}
                </VirraText>
                <Pressable onPress={() => shiftDate(1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
                </Pressable>
              </View>
            </View>

            <View style={s.section}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={s.sectionLabel}>
                AVERAGE CYCLE LENGTH
              </VirraText>
              <View style={s.stepper}>
                <Pressable onPress={() => setCycleLengthLocal((n) => Math.max(21, n - 1))} style={s.stepBtn} hitSlop={12}>
                  <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
                </Pressable>
                <View style={s.stepCenter}>
                  <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                  <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
                </View>
                <Pressable onPress={() => setCycleLengthLocal((n) => Math.min(40, n + 1))} style={s.stepBtn} hitSlop={12}>
                  <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
                </Pressable>
              </View>
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={s.stepHint}>
                Range: 21–40 days
              </VirraText>
            </View>
          </>
        )}

        {!showDatePickers && selectedProfile !== 'hormonal' && STEADY_NOTE[selectedProfile] && (
          <View style={s.note}>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={s.noteText}>
              {STEADY_NOTE[selectedProfile]}
            </VirraText>
          </View>
        )}

        <VirraButton label="SAVE" onPress={handleSave} loading={saving} style={s.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.mile },
  header:            { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:         { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:            { flex: 1 },
  container:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section:           { gap: spacing.sm },
  sectionLabel:      { letterSpacing: 2, marginBottom: spacing.xs },
  profileOption:     { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  subRow:            { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  redsLink:          { textDecorationLine: 'underline' },
  datePicker:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:           { width: 36, alignItems: 'center' },
  dateText:          { flex: 1, textAlign: 'center' },
  stepper:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:           { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:        { alignItems: 'center', gap: 2 },
  stepHint:          { textAlign: 'center' },
  note:              { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:          { lineHeight: 22 },
  disclaimerCard:    { padding: spacing.md, backgroundColor: 'rgba(255,107,61,0.07)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,61,0.22)', gap: spacing.sm },
  disclaimerTitle:   { lineHeight: 20 },
  disclaimerBody:    { lineHeight: 20 },
  disclaimerConfirm: { fontStyle: 'italic' },
  cta:               { marginTop: spacing.sm },
});
