import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { WeightSteadyChart, type WeightReading } from '@/components/ui/WeightSteadyChart';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { classifySteady, STEADY_BAND, type BandPosition } from '@/lib/weightBand';

const REASONING: Record<BandPosition, string> = {
  in_band: 'Day-to-day weight bounces from water, food timing, and hydration. Yours is moving inside the noise band; exactly what a healthy line looks like.',
  above:   'A touch above your steady line. This happens: sodium, alcohol, GI fullness, a harder week of training. Watch what happens over the next few days.',
  below:   'A touch below your steady line. If training has been heavy, check fuelling: every 1g of glycogen stores 3g of water, so a single hard session can show as a 1+ kg dip.',
};

function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)} kg`;
}

function statusLabel(pos: BandPosition): string {
  return pos === 'in_band' ? 'STEADY' : pos === 'above' ? 'ABOVE LINE' : 'BELOW LINE';
}

function pillColor(pos: BandPosition): string {
  return pos === 'in_band' ? colors.pulse : colors.dawn;
}

export default function WeightScreen() {
  const { session }    = useAuthStore();
  const trackWeight       = useProfileStore((s) => s.trackWeight);
  const steadyBaseline    = useProfileStore((s) => s.weightSteadyBaselineKg);
  const weightDataVersion = useProfileStore((s) => s.weightDataVersion);

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

  const latest      = readings.length ? readings[readings.length - 1] : null;
  const latestKg    = latest?.weight_kg ?? null;
  const calibrating = steadyBaseline === null;
  const delta       = !calibrating && latestKg !== null
    ? Math.round((latestKg - steadyBaseline) * 10) / 10
    : null;
  const position    = delta !== null ? classifySteady(delta) : null;

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
                  TODAY
                </VirraText>
                {position && (
                  <View style={[styles.pill, { borderColor: pillColor(position) }]}>
                    <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel(position)}</VirraText>
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
                    FROM YOUR STEADY BASELINE
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
              <WeightSteadyChart baselineKg={steadyBaseline} readings={readings} />
            </VirraCard>

            {position && (
              <VirraCard>
                <SectionLabel style={styles.kicker}>WHAT TO EXPECT</SectionLabel>
                <VirraText variant="body" size={14} color={colors.breath} style={{ marginTop: spacing.xs }}>
                  {REASONING[position]}
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
                    <VirraText variant="body" size={13} color={colors.breath}>• Your steady line is the median of your last 30 days of readings.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• Daily fluctuation of ±{STEADY_BAND.upper.toFixed(1)} kg is normal noise.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• Beyond the band? Look at the last few days, not just one.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• We don't track streaks, goal weight, or progress towards a target.</VirraText>
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
