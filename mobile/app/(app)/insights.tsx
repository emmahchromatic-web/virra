import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { computeInsightMetrics, currentPeriodKeys, formatPaceMmSs, type InsightMetrics } from '@/lib/insightMetrics';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

const PHASE_COLOR: Record<string, string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={tile.wrap}>
      <VirraText variant="display" size={28} color={colors.breath}>{value}</VirraText>
      <VirraText variant="mono" size={8} color={colors.muted} style={tile.label}>{label}</VirraText>
      {sub && <VirraText variant="mono" size={8} color={colors.pulse} style={tile.sub}>{sub}</VirraText>}
    </View>
  );
}

const tile = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.sm },
  label: { letterSpacing: 1.5, textAlign: 'center' },
  sub:   { letterSpacing: 1 },
});

function NarrativeCard({ title, narrative, loading }: {
  title: string; narrative: string | null; loading: boolean;
}) {
  return (
    <VirraCard style={narrative_s.card}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={narrative_s.label}>{title}</VirraText>
      {loading ? (
        <VirraText variant="mono" size={10} color={colors.muted}>GENERATING…</VirraText>
      ) : narrative ? (
        <VirraText variant="serif" size={16} color={colors.breath} style={narrative_s.body}>
          {narrative}
        </VirraText>
      ) : (
        <VirraText variant="body" size={13} color={colors.muted} style={{ lineHeight: 20 }}>
          Generating your first insight…
        </VirraText>
      )}
    </VirraCard>
  );
}

const narrative_s = StyleSheet.create({
  card:  { gap: spacing.sm },
  label: { letterSpacing: 1.5 },
  body:  { lineHeight: 26, fontStyle: 'italic' },
});

export default function InsightsScreen() {
  const { session }   = useAuthStore();
  const { cycleInfo } = useCycleStore();

  const [metrics,          setMetrics]          = useState<InsightMetrics | null>(null);
  const [weeklyNarrative,  setWeeklyNarrative]  = useState<string | null>(null);
  const [monthlyNarrative, setMonthlyNarrative] = useState<string | null>(null);
  const [loadingMetrics,   setLoadingMetrics]   = useState(true);
  const [loadingWeekly,    setLoadingWeekly]    = useState(false);
  const [loadingMonthly,   setLoadingMonthly]   = useState(false);
  const [refreshing,       setRefreshing]       = useState(false);

  const load = useCallback(async (force = false) => {
    if (!session) return;
    setLoadingMetrics(true);

    let m: InsightMetrics;
    try {
      m = await computeInsightMetrics(session.user.id);
    } catch {
      setLoadingMetrics(false);
      return;
    }

    setMetrics(m);
    setLoadingMetrics(false);

    const signupDate      = session.user.created_at ? new Date(session.user.created_at) : new Date();
    const daysSinceSignup = Math.floor((Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24));

    const { weekKey, monthKey } = currentPeriodKeys();

    if (force) {
      await supabase
        .from('insight_cache')
        .delete()
        .eq('user_id', session.user.id)
        .in('period_key', [weekKey, monthKey]);
    }

    setLoadingWeekly(true);
    setLoadingMonthly(true);

    const callEdge = async (periodType: 'weekly' | 'monthly', periodKey: string) => {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: {
          period_type:  periodType,
          period_key:   periodKey,
          metrics: {
            streakDays:         m.streakDays,
            weeklyKm:           m.weeklyKm,
            monthlyKm:          m.monthlyKm,
            totalKm:            m.totalKm,
            consistencyPct:     m.consistencyPct,
            phasePaces:         m.phasePaces,
            activitiesThisWeek: m.activitiesThisWeek,
          },
          phase:             cycleInfo?.phase,
          day_of_cycle:      cycleInfo?.dayOfCycle,
          days_since_signup: daysSinceSignup,
        },
      });
      if (error) return null;
      return (data as any)?.narrative as string ?? null;
    };

    const weeklyPromise  = callEdge('weekly',  weekKey).then(setWeeklyNarrative).finally(() => setLoadingWeekly(false));
    const monthlyPromise = callEdge('monthly', monthKey).then(setMonthlyNarrative).finally(() => setLoadingMonthly(false));
    await Promise.all([weeklyPromise, monthlyPromise]);
  }, [session, cycleInfo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.muted}>INSIGHTS</VirraText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.pulse} />
        }
      >
        {/* Metric grid */}
        <VirraCard style={styles.metricsCard}>
          <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>YOUR NUMBERS</VirraText>
          <View style={styles.metricsGrid}>
            <MetricTile label="DAY STREAK"  value={loadingMetrics ? '—' : String(metrics?.streakDays ?? 0)} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS WEEK"   value={loadingMetrics ? '—' : `${metrics?.weeklyKm ?? 0} km`} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS MONTH"  value={loadingMetrics ? '—' : `${metrics?.monthlyKm ?? 0} km`} />
          </View>
          <View style={styles.metricDividerH} />
          <View style={styles.metricsGrid}>
            <MetricTile
              label="CONSISTENCY"
              value={loadingMetrics ? '—' : `${metrics?.consistencyPct ?? 0}%`}
              sub="LAST 28 DAYS"
            />
            <View style={styles.metricDividerV} />
            <MetricTile label="ALL TIME"    value={loadingMetrics ? '—' : `${metrics?.totalKm ?? 0} km`} />
            <View style={styles.metricDividerV} />
            <MetricTile
              label="ACTIVITIES"
              value={loadingMetrics ? '—' : String(metrics?.activitiesThisWeek ?? 0)}
              sub="THIS WEEK"
            />
          </View>
        </VirraCard>

        {/* Phase-pace breakdown */}
        {metrics && metrics.phasePaces.length > 0 && (
          <VirraCard style={styles.paceCard}>
            <VirraText variant="mono" size={9} color={colors.pulse} style={styles.sectionLabel}>
              PACE BY PHASE
            </VirraText>
            {[...metrics.phasePaces]
              .sort((a, b) => a.avgPaceSecPerKm - b.avgPaceSecPerKm)
              .map((pp) => (
                <View key={pp.phase} style={styles.paceRow}>
                  <View style={[styles.phaseDot, { backgroundColor: PHASE_COLOR[pp.phase] ?? colors.muted }]} />
                  <VirraText variant="body" size={13} color={colors.breath} style={styles.pacePhaseLabel}>
                    {pp.phase.charAt(0).toUpperCase() + pp.phase.slice(1)}
                  </VirraText>
                  <VirraText variant="display" size={16} color={PHASE_COLOR[pp.phase] ?? colors.breath}>
                    {formatPaceMmSs(pp.avgPaceSecPerKm)}
                  </VirraText>
                  <VirraText variant="mono" size={8} color={colors.muted} style={styles.paceCount}>
                    {pp.activityCount} runs
                  </VirraText>
                </View>
              ))}
          </VirraCard>
        )}

        {/* Narratives */}
        <NarrativeCard title="THIS WEEK"  narrative={weeklyNarrative}  loading={loadingWeekly}  />
        <NarrativeCard title="THIS MONTH" narrative={monthlyNarrative} loading={loadingMonthly} />

        <VirraText variant="mono" size={8} color="rgba(244,237,224,0.2)" style={styles.pullHint}>
          PULL TO REFRESH INSIGHTS
        </VirraText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.mile },
  header:         { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  backBtn:        { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  sectionLabel:   { letterSpacing: 1.5, marginBottom: spacing.xs },
  metricsCard:    { gap: spacing.md },
  metricsGrid:    { flexDirection: 'row', alignItems: 'center' },
  metricDividerV: { width: 1, height: 44, backgroundColor: colors.border },
  metricDividerH: { height: 1, backgroundColor: colors.border },
  paceCard:       { gap: spacing.sm },
  paceRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  phaseDot:       { width: 8, height: 8, borderRadius: 4 },
  pacePhaseLabel: { flex: 1 },
  paceCount:      { minWidth: 44, textAlign: 'right' },
  pullHint:       { textAlign: 'center', letterSpacing: 2, marginTop: spacing.md },
});
