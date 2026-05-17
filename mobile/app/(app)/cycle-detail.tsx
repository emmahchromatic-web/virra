import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { PHASE_META } from '@/lib/phaseMeta';
import { resetCycleToToday } from '@/lib/resetCycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { CycleMonthCalendar } from '@/components/ui/CycleMonthCalendar';
import type { CyclePhase } from '@/lib/cycleEngine';

const WEIGHT_REASONING: Record<CyclePhase, string> = {
  menstrual:  'Bleed days often show your lowest read of the cycle as water levels reset.',
  follicular: 'Follicular days are your steadiest baseline — energy rises and weight tends to hold.',
  ovulatory:  'A small lift around ovulation is normal. Hormones drive a brief water rise.',
  luteal:     'Expect a 1–2 kg lift before your period. This is water retention, not fat gain.',
};

const COACHING_CARD_WIDTH = 260;
const ACTION_HEIGHT       = 52;

export default function CycleDetailScreen() {
  const { session } = useAuthStore();
  const { cycleInfo, cycleProfile, periodStart, cycleLength } = useCycleStore();
  const [resetting, setResetting] = useState(false);

  const meta      = cycleInfo ? PHASE_META[cycleInfo.phase] : null;
  const isNatural = cycleProfile === 'natural' || cycleProfile === 'irregular';
  const showFull  = !!(cycleInfo && meta && isNatural && periodStart);

  function handleReset() {
    if (!session) return;
    Alert.alert(
      'Reset your cycle?',
      'This logs today as the start of a new period and your day count restarts from 1.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetCycleToToday(session.user.id);
            } catch (e: any) {
              Alert.alert('Could not reset cycle', e?.message ?? 'Please try again.');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Your Cycle</VirraText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!showFull ? (
          <>
            <VirraCard>
              <VirraText variant="body" size={14} color={colors.breath}>
                Your cycle profile is set to {labelForProfile(cycleProfile)}. Update it in
                Profile → Cycle settings if anything changes.
              </VirraText>
            </VirraCard>
            <View style={styles.actionRow}>
              <VirraButton
                label="UPDATE CYCLE"
                onPress={() => router.push('/(app)/cycle-settings')}
                style={[styles.actionBtn, { flex: 2 }]}
              />
              <View style={[styles.actionBtn, { flex: 1 }]}>
                <PeriodButton onPress={() => {}} disabled />
              </View>
            </View>
          </>
        ) : (
          <>
            <VirraCard>
              <View style={styles.phasePill}>
                <VirraText variant="mono" size={10} color={meta!.color}>
                  {meta!.label.toUpperCase()} PHASE
                </VirraText>
              </View>
              <CycleProgressBar
                dayOfCycle={cycleInfo!.dayOfCycle}
                cycleLength={cycleInfo!.cycleLength}
                phaseColor={meta!.color}
              />
              <View style={styles.statsRow}>
                <Stat value={cycleInfo!.dayOfCycle}          label="DAY"       color={meta!.color} />
                <View style={styles.statDivider} />
                <Stat value={cycleInfo!.daysUntilNextPeriod} label="DAYS LEFT" color={meta!.color} />
                <View style={styles.statDivider} />
                <Stat value={cycleInfo!.cycleLength}         label="DAY CYCLE" color={meta!.color} />
              </View>
            </VirraCard>

            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                THIS MONTH
              </VirraText>
              <CycleMonthCalendar periodStart={periodStart!} cycleLength={cycleLength} />
            </VirraCard>

            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                WEIGHT
              </VirraText>
              <VirraText variant="body" size={13} color={colors.muted} style={{ marginBottom: spacing.sm }}>
                How your weight moves through your cycle
              </VirraText>
              <VirraText variant="body" size={14} color={colors.breath}>
                Weight tracking is off. We're saving this surface for Virra's cycle-aware
                weight insight — coming soon. When it's on, you'll see your weight delta from
                baseline charted across the current cycle, with the same phase-band colouring
                as the calendar above.
              </VirraText>
            </VirraCard>

            <VirraCard>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                WHAT TO EXPECT
              </VirraText>
              <VirraText variant="body" size={14} color={colors.breath}>
                {WEIGHT_REASONING[cycleInfo!.phase]}
              </VirraText>
            </VirraCard>

            <View>
              <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
                THIS PHASE
              </VirraText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.coachingRow}
              >
                <CoachingCard title="Training"  body={meta!.training}  accent={meta!.color} />
                <CoachingCard title="Nutrition" body={meta!.nutrition} accent={meta!.color} />
                <CoachingCard title="Lifestyle" body={meta!.lifestyle} accent={meta!.color} />
              </ScrollView>
            </View>

            <View style={styles.actionRow}>
              <VirraButton
                label="UPDATE CYCLE"
                onPress={() => router.push('/(app)/cycle-settings')}
                style={[styles.actionBtn, { flex: 2 }]}
              />
              <View style={[styles.actionBtn, { flex: 1 }]}>
                <PeriodButton onPress={handleReset} loading={resetting} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <VirraText variant="display" size={32} color={color}>{String(value)}</VirraText>
      <VirraText variant="mono" size={11} color={colors.muted} style={styles.statLabel}>{label}</VirraText>
    </View>
  );
}

function CoachingCard({ title, body, accent }: { title: string; body: string; accent: string }) {
  return (
    <VirraCard style={styles.coachingCard}>
      <VirraText variant="mono" size={10} color={accent} style={styles.cardLabel}>
        {title.toUpperCase()}
      </VirraText>
      <VirraText variant="body" size={14} color={colors.breath}>{body}</VirraText>
    </VirraCard>
  );
}

function PeriodButton({ onPress, disabled, loading }: { onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        periodStyles.base,
        disabled && periodStyles.disabled,
        pressed && periodStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="I got my period"
    >
      <VirraText variant="mono" size={11} color={colors.mile} numberOfLines={2} style={{ textAlign: 'center' }}>
        {loading ? '…' : 'I GOT MY PERIOD'}
      </VirraText>
    </Pressable>
  );
}

function labelForProfile(p: string): string {
  switch (p) {
    case 'hormonal':      return 'Hormonal contraception';
    case 'perimenopause': return 'Perimenopause';
    case 'menopause':     return 'Menopause';
    case 'irregular':     return 'Irregular cycle';
    default:              return 'Regular cycle';
  }
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:    { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:      { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  phasePill:    { alignSelf: 'flex-start', marginBottom: spacing.sm },
  statsRow:     { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
  stat:         { flex: 1, alignItems: 'center' },
  statDivider:  { width: 1, height: 28, backgroundColor: colors.border },
  statLabel:    { letterSpacing: 1.5, marginTop: 2 },
  cardLabel:    { letterSpacing: 1.5, marginBottom: spacing.xs },
  sectionLabel: { letterSpacing: 1.5, marginBottom: spacing.xs, paddingHorizontal: spacing.xs },

  coachingRow:  { gap: spacing.sm, paddingRight: spacing.lg },
  coachingCard: { width: COACHING_CARD_WIDTH },

  actionRow:    { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, height: ACTION_HEIGHT },
  actionBtn:    { height: ACTION_HEIGHT },
});

const periodStyles = StyleSheet.create({
  base:     { flex: 1, backgroundColor: colors.heat, paddingHorizontal: spacing.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  pressed:  { opacity: 0.82 },
});
