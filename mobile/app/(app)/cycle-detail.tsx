import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore } from '@/store/profile';
import { PHASE_META } from '@/lib/phaseMeta';
import { resetCycleToToday } from '@/lib/resetCycle';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { CycleMonthCalendar } from '@/components/ui/CycleMonthCalendar';
import { CycleWeightChart, type WeightReading } from '@/components/ui/CycleWeightChart';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
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
  const trackWeight      = useProfileStore((s) => s.trackWeight);
  const weightBaselineKg = useProfileStore((s) => s.weightBaselineKg);
  const [resetting, setResetting] = useState(false);
  const [readings, setReadings]   = useState<WeightReading[]>([]);
  const [addOpen,  setAddOpen]    = useState(false);

  useEffect(() => {
    if (!session || !trackWeight) { setReadings([]); return; }
    let cancelled = false;
    (async () => {
      const cutoff = new Date(Date.now() - 90 * 86400000).toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('body_weights')
        .select('recorded_on, weight_kg')
        .eq('user_id', session.user.id)
        .gte('recorded_on', cutoff)
        .order('recorded_on', { ascending: true });
      if (!cancelled) setReadings((data ?? []) as WeightReading[]);
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, trackWeight, addOpen]);

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
                CYCLE CALENDAR
              </VirraText>
              <CycleMonthCalendar periodStart={periodStart!} cycleLength={cycleLength} />
            </VirraCard>

            {trackWeight && periodStart && (
              <VirraCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
                    WEIGHT · KG FROM BASELINE
                  </VirraText>
                  <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityRole="button">
                    <VirraText variant="mono" size={10} color={colors.pulse}>+ ADD WEIGHT</VirraText>
                  </Pressable>
                </View>
                <CycleWeightChart
                  baselineKg={weightBaselineKg}
                  readings={readings}
                  periodStart={periodStart}
                  cycleLength={cycleLength}
                />
              </VirraCard>
            )}

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
      {session && (
        <AddWeightModal
          visible={addOpen}
          userId={session.user.id}
          onClose={() => setAddOpen(false)}
        />
      )}
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
