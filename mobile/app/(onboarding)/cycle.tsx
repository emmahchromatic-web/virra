import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { HormonalSubPicker } from '@/components/cycle/HormonalSubPicker';
import { useOnboarding } from '@/context/OnboardingContext';
import { useAuthStore } from '@/store/auth';
import { completeOnboarding } from '@/lib/completeOnboarding';
import { fetchHKCycleData } from '@/lib/healthKitOnboarding';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';
import { appAlert } from '@/components/ui/VirraAlert';

const MS_PER_DAY    = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;

function defaultPeriodStart() {
  return new Date(Date.now() - DEFAULT_CYCLE * MS_PER_DAY);
}

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
  prefer_not_to_say: 'Your targets are based on training load. You can update this at any time in your profile.',
};

const REDS_URL = 'https://virra.app/advice/reds'; // TODO: update to real article slug before launch

export default function CycleScreen() {
  const { setStep, data, setData } = useOnboarding();
  const { session }                = useAuthStore();
  useFocusEffect(React.useCallback(() => { setStep(6); }, [setStep]));

  const [cycleProfile,      setCycleProfile]      = useState<CycleProfile>('natural');
  const [periodStart,       setPeriodStart]        = useState<Date>(defaultPeriodStart);
  const [cycleLength,       setCycleLength]        = useState(DEFAULT_CYCLE);
  const [contraceptionType, setContraceptionType]  = useState<ContraceptionType | null>(null);
  const [hasPlaceboWeek,    setHasPlaceboWeek]     = useState<boolean | null>(null);
  const [currentPackStart,  setCurrentPackStart]   = useState<Date | null>(null);
  const [hkBadges,          setHkBadges]           = useState<Set<string>>(new Set());
  const [saving,            setSaving]             = useState(false);

  const showDatePickers = cycleProfile === 'natural' || cycleProfile === 'irregular';

  useEffect(() => {
    fetchHKCycleData().then((hk) => {
      const badges = new Set<string>();
      if (hk.lastPeriodStart)      { setPeriodStart(hk.lastPeriodStart); badges.add('date'); }
      if (hk.estimatedCycleLength) { setCycleLength(hk.estimatedCycleLength); badges.add('length'); }
      setHkBadges(badges);
    });
  }, []);

  function shiftDate(days: number) {
    setPeriodStart((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  function handleCopperIUDEscape() {
    setCycleProfile('natural');
    setContraceptionType(null);
    setHasPlaceboWeek(null);
    setCurrentPackStart(null);
  }

  // Cycle is the last data-collection step, so it finalises onboarding (this
  // commit used to live on the now-removed dietary step). Build the merged data
  // explicitly rather than reading it back from context, which setData hasn't
  // committed yet within this handler.
  async function handleContinue() {
    const merged = {
      ...data,
      cycleProfile,
      periodStart:       showDatePickers ? periodStart : null,
      cycleLength:       showDatePickers ? cycleLength : DEFAULT_CYCLE,
      contraceptionType: cycleProfile === 'hormonal' ? contraceptionType : null,
      hasPlaceboWeek:    cycleProfile === 'hormonal' ? hasPlaceboWeek : null,
      currentPackStart:  cycleProfile === 'hormonal' && hasPlaceboWeek ? currentPackStart : null,
    };
    setData(merged);

    // No session means nothing can be written. Say so instead of leaving the
    // user pressing a button that silently does nothing.
    if (!session) {
      appAlert(
        'You are not signed in',
        'We could not save your profile because your session has expired. Sign in again and we will pick up from here.',
        [{ text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') }],
      );
      return;
    }

    setSaving(true);
    const { error, avatarFailed } = await completeOnboarding(session.user.id, merged);
    setSaving(false);
    if (error) {
      appAlert('Something went wrong', error);
      return;
    }
    // The photo is optional, so a failed upload must not block onboarding, but
    // it should not vanish silently either: the user picked it and would
    // otherwise find it missing later with no idea why. Card 224.
    if (avatarFailed) {
      appAlert(
        'Profile photo not saved',
        'Everything else is set up. You can add your photo again from Profile.',
      );
    }
    router.replace('/(onboarding)/body-metrics');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Tell us about your cycle
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        This personalises your training and nutrition targets.
      </VirraText>

      <View style={styles.section}>
        {CYCLE_PROFILES.map((opt) => {
          const active = cycleProfile === opt.value;
          return (
            <React.Fragment key={opt.value}>
              <Pressable
                onPress={() => setCycleProfile(opt.value)}
                style={[styles.profileOption, active && styles.profileOptionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                  {opt.label}
                </VirraText>
                <View style={styles.subRow}>
                  <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                    {opt.sub}
                  </VirraText>
                  {opt.redsLink && (
                    <Pressable onPress={(e) => { e.stopPropagation(); Linking.openURL(REDS_URL); }} hitSlop={8}>
                      <VirraText variant="body" size={12} color={colors.dawn} style={styles.redsLink}>
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
                <View style={styles.disclaimerCard}>
                  <VirraText variant="bodyMedium" size={13} color={colors.dawn} style={styles.disclaimerTitle}>
                    Pregnancy and postpartum aren't a fitness question; they're a healing one.
                  </VirraText>
                  <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={styles.disclaimerBody}>
                    Before we build you a training plan, get cleared to exercise by your midwife, GP, or a women's health physio.
                  </VirraText>
                  <VirraText variant="body" size={11} color="rgba(244,237,224,0.3)" style={styles.disclaimerConfirm}>
                    Continuing confirms you've had that conversation.
                  </VirraText>
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>

      {showDatePickers && (
        <>
          <View style={styles.section}>
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                {cycleProfile === 'irregular' ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?' : 'LAST PERIOD START'}
              </VirraText>
              {hkBadges.has('date') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
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
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                AVERAGE CYCLE LENGTH
              </VirraText>
              {hkBadges.has('length') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => setCycleLength((n) => Math.max(21, n - 1))} style={styles.stepBtn} hitSlop={12}>
                <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
              </Pressable>
              <View style={styles.stepCenter}>
                <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
              </View>
              <Pressable onPress={() => setCycleLength((n) => Math.min(40, n + 1))} style={styles.stepBtn} hitSlop={12}>
                <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
              </Pressable>
            </View>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.stepHint}>
              Range: 21–40 days
            </VirraText>
          </View>
        </>
      )}

      {!showDatePickers && cycleProfile !== 'hormonal' && STEADY_NOTE[cycleProfile] && (
        <View style={styles.note}>
          <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={styles.noteText}>
            {STEADY_NOTE[cycleProfile]}
          </VirraText>
        </View>
      )}

      <VirraButton label="CONTINUE" onPress={handleContinue} loading={saving} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:              { flex: 1 },
  container:           { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:               { lineHeight: 34 },
  sub:                 { lineHeight: 22, marginTop: -spacing.md },
  section:             { gap: spacing.sm },
  profileOption:       { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  subRow:              { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  redsLink:            { textDecorationLine: 'underline' },
  fieldRow:            { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:          { letterSpacing: 2 },
  datePicker:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:             { width: 36, alignItems: 'center' },
  dateText:            { flex: 1, textAlign: 'center' },
  stepper:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:             { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:          { alignItems: 'center', gap: 2 },
  stepHint:            { textAlign: 'center' },
  note:                { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:            { lineHeight: 22 },
  disclaimerCard:      { padding: spacing.md, backgroundColor: 'rgba(255,107,61,0.07)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,61,0.22)', gap: spacing.sm },
  disclaimerTitle:     { lineHeight: 20 },
  disclaimerBody:      { lineHeight: 20 },
  disclaimerConfirm:   { fontStyle: 'italic' },
  cta:                 { marginTop: spacing.sm },
});
