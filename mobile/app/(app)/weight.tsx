import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { useCycleStore } from '@/store/cycle';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { WeightSteadyChart, type WeightReading } from '@/components/ui/WeightSteadyChart';
import { CycleWeightChart } from '@/components/ui/CycleWeightChart';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { classifyReading, classifySteady, STEADY_BAND, type BandPosition } from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

const REASONING: Record<BandPosition, string> = {
  in_band: 'Day-to-day weight bounces from water, food timing, and hydration. Yours is moving inside the noise band; exactly what a healthy line looks like.',
  above:   'A touch above your steady line. This happens: sodium, alcohol, GI fullness, a harder week of training. Watch what happens over the next few days.',
  below:   'A touch below your steady line. If training has been heavy, check fuelling: every 1g of glycogen stores 3g of water, so a single hard session can show as a 1+ kg dip.',
};

const CYCLE_REASONING: Record<BandPosition, string> = {
  in_band: 'You are inside the range your body typically sits in at this point in your cycle. Nothing to act on.',
  above:   'Above the range that is typical for this phase. Sodium, alcohol, a hard session, or GI fullness will all do this. Look again in a few days.',
  below:   'Below the range that is typical for this phase. If training has been heavy, check fuelling: every 1g of glycogen stores 3g of water, so one hard session can read as a 1+ kg dip.',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'MENSTRUAL', follicular: 'FOLLICULAR', ovulatory: 'OVULATORY', luteal: 'LUTEAL',
};

function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)} kg`;
}

function statusLabel(pos: BandPosition, cycleMode: boolean): string {
  if (cycleMode) {
    return pos === 'in_band' ? 'IN BAND' : pos === 'above' ? 'ABOVE BAND' : 'BELOW BAND';
  }
  return pos === 'in_band' ? 'STEADY' : pos === 'above' ? 'ABOVE LINE' : 'BELOW LINE';
}

function pillColor(pos: BandPosition): string {
  return pos === 'in_band' ? colors.pulse : colors.dawn;
}

export default function WeightScreen() {
  const { session }    = useAuthStore();
  const trackWeight       = useProfileStore((s) => s.trackWeight);
  const steadyBaseline    = useProfileStore((s) => s.weightSteadyBaselineKg);
  const cycleBaseline     = useProfileStore((s) => s.weightBaselineKg);
  const cyclePhaseBands   = useProfileStore((s) => s.weightPhaseBands);
  const weightDataVersion = useProfileStore((s) => s.weightDataVersion);
  const cycleProfile      = useCycleStore((s) => s.cycleProfile);
  const cycleInfo         = useCycleStore((s) => s.cycleInfo);
  const periodStart       = useCycleStore((s) => s.periodStart);
  const cycleLength       = useCycleStore((s) => s.cycleLength);

  const [readings, setReadings] = useState<WeightReading[]>([]);
  const [addOpen,  setAddOpen]  = useState(false);
  const [howOpen,  setHowOpen]  = useState(false);

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
  }, [session?.user.id, trackWeight, addOpen, weightDataVersion]);

  // Mirror WeightGlanceCard: a cycling user's weight is read against the
  // phase-shaped expected band, not a flat steady line. This screen used to be
  // steady-only, so cycle users sat on CALIBRATING forever — the steady
  // baseline is not the one their profile computes.
  // Cycle mode needs a logged period start to place readings in the cycle; with
  // no period start we fall back to the steady view rather than showing nothing.
  const isCycleMode = (cycleProfile === 'natural' || cycleProfile === 'irregular') && periodStart !== null;
  const phase       = cycleInfo?.phase ?? 'follicular';

  const baseline    = isCycleMode ? cycleBaseline : steadyBaseline;
  const latest      = readings.length ? readings[readings.length - 1] : null;
  const latestKg    = latest?.weight_kg ?? null;
  const calibrating = baseline === null;
  const delta       = !calibrating && latestKg !== null
    ? Math.round((latestKg - baseline) * 10) / 10
    : null;
  const position    = delta !== null
    ? (isCycleMode ? classifyReading(delta, phase, cyclePhaseBands) : classifySteady(delta))
    : null;

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
        <VirraText variant="display" size={24} color={colors.pulse}>Your Weight</VirraText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!trackWeight ? (
          <VirraCard>
            <VirraText variant="body" size={14} color={colors.breath}>
              Weight tracking is off. Turn it on in Profile → Body Metrics.
            </VirraText>
          </VirraCard>
        ) : (
          <>
            <VirraCard>
              <View style={styles.row}>
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
                  {isCycleMode ? `TODAY · ${PHASE_LABEL[phase]}` : 'TODAY'}
                </VirraText>
                {position && (
                  <View style={[styles.pill, { borderColor: pillColor(position) }]}>
                    <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel(position, isCycleMode)}</VirraText>
                  </View>
                )}
                {!position && (
                  <View style={[styles.pill, { borderColor: colors.muted }]}>
                    <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
                  </View>
                )}
              </View>
              <VirraText variant="display" size={32} color={colors.breath}>
                {latestKg !== null ? `${latestKg.toFixed(1)} kg` : '—'}
              </VirraText>
              {delta !== null && (
                <>
                  <VirraText variant="display" size={28} color={colors.pulse}>{formatDelta(delta)}</VirraText>
                  <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                    {isCycleMode ? 'FROM YOUR FOLLICULAR BASELINE' : 'FROM YOUR STEADY BASELINE'}
                  </VirraText>
                </>
              )}
            </VirraCard>

            <VirraCard>
              <View style={[styles.row, { marginBottom: spacing.xs }]}>
                <SectionLabel style={styles.kicker}>WEIGHT · KG FROM BASELINE</SectionLabel>
                <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityRole="button">
                  <VirraText variant="mono" size={10} color={colors.pulse}>+ ADD WEIGHT</VirraText>
                </Pressable>
              </View>
              {isCycleMode ? (
                <CycleWeightChart
                  baselineKg={cycleBaseline}
                  readings={readings}
                  periodStart={periodStart!}
                  cycleLength={cycleLength}
                  bands={cyclePhaseBands}
                />
              ) : (
                <WeightSteadyChart baselineKg={steadyBaseline} readings={readings} />
              )}
            </VirraCard>

            {position && (
              <VirraCard>
                <SectionLabel style={styles.kicker}>WHAT TO EXPECT</SectionLabel>
                <VirraText variant="body" size={14} color={colors.breath} style={{ marginTop: spacing.xs }}>
                  {isCycleMode ? CYCLE_REASONING[position] : REASONING[position]}
                </VirraText>
              </VirraCard>
            )}

            <Pressable onPress={() => setHowOpen((v) => !v)} accessibilityRole="button">
              <VirraCard>
                <View style={styles.row}>
                  <SectionLabel style={styles.kicker}>HOW THIS WORKS</SectionLabel>
                  <SymbolView name={howOpen ? 'chevron.up' : 'chevron.down'} size={14} tintColor={colors.muted} />
                </View>
                {howOpen && (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    {isCycleMode ? (
                      <>
                        <VirraText variant="body" size={13} color={colors.breath}>• Your baseline is the median of your follicular-phase readings, the steadiest point in your cycle.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• The band is learned from your own past cycles: the range your weight actually sits in at each phase, not a generic average. Any luteal lift you see is water, not fat.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• Outside the band? Look at the last few days, not just one.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• We don't track streaks, goal weight, or progress towards a target.</VirraText>
                      </>
                    ) : (
                      <>
                        <VirraText variant="body" size={13} color={colors.breath}>• Your steady line is the median of your last 30 days of readings.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• Daily fluctuation of ±{STEADY_BAND.upper.toFixed(1)} kg is normal noise.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• Beyond the band? Look at the last few days, not just one.</VirraText>
                        <VirraText variant="body" size={13} color={colors.breath}>• We don't track streaks, goal weight, or progress towards a target.</VirraText>
                      </>
                    )}
                  </View>
                )}
              </VirraCard>
            </Pressable>
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

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:   { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker:    { letterSpacing: 1.5 },
  pill:      { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
});
