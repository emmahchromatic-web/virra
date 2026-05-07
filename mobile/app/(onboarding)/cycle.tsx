// mobile/app/(onboarding)/cycle.tsx
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { useOnboarding } from '@/context/OnboardingContext';
import { fetchHKCycleData } from '@/lib/healthKitOnboarding';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;

function defaultPeriodStart() {
  return new Date(Date.now() - DEFAULT_CYCLE * MS_PER_DAY);
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CycleScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(6); }, [setStep]));

  const [periodStart, setPeriodStart] = useState<Date>(defaultPeriodStart);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE);
  const [hkBadges, setHkBadges]       = useState<Set<string>>(new Set());

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

  function handleContinue() {
    setData({ periodStart, cycleLength });
    router.push('/(onboarding)/diet');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        When did your last period start?
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        This activates your cycle phase engine right away.
      </VirraText>

      {/* Period start */}
      <View style={styles.section}>
        <View style={styles.fieldRow}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
            LAST PERIOD START
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

      {/* Cycle length */}
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
          <Pressable
            onPress={() => setCycleLength((n) => Math.max(21, n - 1))}
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
            onPress={() => setCycleLength((n) => Math.min(40, n + 1))}
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

      <VirraButton label="CONTINUE" onPress={handleContinue} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:      { flex: 1 },
  container:   { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:       { lineHeight: 34 },
  sub:         { lineHeight: 22, marginTop: -spacing.md },
  section:     { gap: spacing.sm },
  fieldRow:    { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:  { letterSpacing: 2 },
  datePicker:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:     { width: 36, alignItems: 'center' },
  dateText:    { flex: 1, textAlign: 'center' },
  stepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:  { alignItems: 'center', gap: 2 },
  stepHint:    { textAlign: 'center' },
  cta:         { marginTop: spacing.sm },
});
