import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { useDateRangeSessions } from '@/hooks/useDateRangeSessions';
import { computeInsightMetrics, formatPaceMmSs, type InsightMetrics } from '@/lib/insightMetrics';
import { summariseRunStructure, summariseStrengthStructure } from '@/lib/workoutStructure';
import { modulateRunStructure } from '@/lib/cycleModulation';
import { getCycleInfo } from '@/lib/cycleEngine';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { AddEventModal } from '@/components/ui/AddEventModal';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Shimmer } from '@/components/ui/Shimmer';

const PHASE_COLOR: Record<string, string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

function MetricTile({
  label, value, unit, sub,
}: { label: string; value: string; unit?: string; sub?: string }) {
  // Always render the sub slot; empty tiles use a non-breaking space so every
  // tile in a row has the same baseline height and the row aligns cleanly.
  return (
    <View style={tile.wrap}>
      <View style={tile.valueRow}>
        <VirraText variant="display" size={28} color={colors.breath}>{value}</VirraText>
        {unit && (
          <VirraText variant="display" size={14} color={colors.muted} style={tile.unit}>
            {unit}
          </VirraText>
        )}
      </View>
      <VirraText variant="mono" size={10} color={colors.muted} style={tile.label}>{label}</VirraText>
      <VirraText variant="mono" size={10} color={colors.pulse} style={tile.sub}>{sub ?? ' '}</VirraText>
    </View>
  );
}

const tile = StyleSheet.create({
  wrap:     { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.sm },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  unit:     { marginLeft: 2 },
  label:    { letterSpacing: 1.5, textAlign: 'center' },
  sub:      { letterSpacing: 1 },
});

export default function InsightsScreen() {
  const { session }   = useAuthStore();
  const { cycleInfo, periodStart, cycleLength, cycleProfile, hasPlaceboWeek, cycleMode, currentPackStart } = useCycleStore();

  const [metrics,          setMetrics]          = useState<InsightMetrics | null>(null);
  const [overallText,      setOverallText]      = useState<string | null>(null);
  const [trainingText,     setTrainingText]     = useState<string | null>(null);
  const [nutritionText,    setNutritionText]    = useState<string | null>(null);
  const [generatedAt,      setGeneratedAt]      = useState<string | null>(null);
  const [upcomingEvents,   setUpcomingEvents]   = useState<any[]>([]);
  const [loadingMetrics,   setLoadingMetrics]   = useState(true);
  const [loadingNarrative, setLoadingNarrative] = useState(true);
  const [showAddEvent,     setShowAddEvent]     = useState(false);

  const today    = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const future14 = useMemo(() => new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA'), []);

  const { byDate } = useDateRangeSessions(today, future14);
  const upcomingSessions = useMemo(() => {
    const out: any[] = [];
    for (const date of Object.keys(byDate).sort()) {
      for (const s of byDate[date]) {
        if (s.status === 'moved') continue;
        out.push(s);
      }
    }
    return out;
  }, [byDate]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadingMetrics(true);
    setLoadingNarrative(true);

    const [metricsResult, cacheResult, eventsResult] = await Promise.all([
      computeInsightMetrics(session.user.id).catch(() => null),

      supabase
        .from('insights_cache')
        .select('training_text, nutrition_text, overall_text, generated_at, expires_at')
        .eq('user_id', session.user.id)
        .eq('insight_type', 'weekly')
        .maybeSingle(),

      supabase
        .from('user_events')
        .select('id, name, event_date')
        .eq('user_id', session.user.id)
        .gte('event_date', today)
        .lte('event_date', future14)
        .order('event_date'),
    ]);

    if (metricsResult) setMetrics(metricsResult);
    setUpcomingEvents(eventsResult.data ?? []);
    setLoadingMetrics(false);

    const cached = cacheResult.data;
    if (cached && new Date(cached.expires_at) > new Date()) {
      setOverallText(cached.overall_text ?? null);
      setTrainingText(cached.training_text ?? null);
      setNutritionText(cached.nutrition_text ?? null);
      setGeneratedAt(cached.generated_at);
      setLoadingNarrative(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: {
          insight_type:  'weekly',
          phase:         cycleInfo?.phase,
          day_of_cycle:  cycleInfo?.dayOfCycle,
        },
      });
      if (!error && data) {
        setOverallText(data.overall_text   ?? null);
        setTrainingText(data.training_text  ?? null);
        setNutritionText(data.nutrition_text ?? null);
        setGeneratedAt(data.generated_at ?? new Date().toISOString());
      }
    } catch {
      // Retain stale content if present
    } finally {
      setLoadingNarrative(false);
    }
  }, [session, cycleInfo, today, future14]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const phaseColor = cycleInfo ? PHASE_COLOR[cycleInfo.phase] : colors.pulse;

  function summaryFor(s: any): string | null {
    if (s._type !== 'session') return null;
    if (s.modality === 'run' && s.run_structure) {
      const date = new Date(`${s.scheduled_date}T00:00:00`);
      const effectiveStart = cycleMode === 'pack' ? currentPackStart : periodStart;
      const phaseForDate = effectiveStart
        ? getCycleInfo(effectiveStart, cycleLength ?? 28, date).phase
        : null;
      const modulated = modulateRunStructure(s.run_structure, phaseForDate, cycleProfile ?? 'natural', hasPlaceboWeek).adjusted;
      return summariseRunStructure(modulated);
    }
    if (s.modality === 'strength' && s.strength_structure) {
      return summariseStrengthStructure(s.strength_structure);
    }
    return null;
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diffMs  = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Insights</VirraText>
        <View style={{ width: 18 }} />
      </View>
      {cycleInfo && (
        <View style={styles.phaseRow}>
          <VirraText variant="mono" size={10} color={phaseColor}>
            {cycleInfo.phase.toUpperCase()} · DAY {cycleInfo.dayOfCycle}
          </VirraText>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* THIS WEEK: Haiku narrative */}
        <VirraCard style={styles.narrativeCard}>
          <SectionLabel style={styles.sectionLabel}>THIS WEEK</SectionLabel>
          {loadingNarrative && !overallText ? (
            <Shimmer height={20} lines={3} />
          ) : overallText ? (
            <VirraText variant="serif" size={16} color={colors.breath} style={styles.narrativeBody}>
              {overallText}
            </VirraText>
          ) : (
            <VirraText variant="body" size={13} color={colors.muted} style={{ lineHeight: 20 }}>
              {trainingText ?? 'Log activities to unlock your personal insight.'}
            </VirraText>
          )}
        </VirraCard>

        {/* Metric grid */}
        <VirraCard style={styles.metricsCard}>
          <SectionLabel style={styles.sectionLabel}>YOUR NUMBERS</SectionLabel>
          <View style={styles.metricsGrid}>
            <MetricTile label="DAY STREAK"  value={loadingMetrics ? '—' : String(metrics?.streakDays ?? 0)} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS WEEK"   value={loadingMetrics ? '—' : String(metrics?.weeklyKm ?? 0)}  unit={loadingMetrics ? undefined : 'km'} />
            <View style={styles.metricDividerV} />
            <MetricTile label="THIS MONTH"  value={loadingMetrics ? '—' : String(metrics?.monthlyKm ?? 0)} unit={loadingMetrics ? undefined : 'km'} />
          </View>
          <View style={styles.metricDividerH} />
          <View style={styles.metricsGrid}>
            <MetricTile
              label="ADHERENCE"
              value={loadingMetrics ? '—' : metrics?.trainingAdherencePct != null ? String(metrics.trainingAdherencePct) : '—'}
              unit={!loadingMetrics && metrics?.trainingAdherencePct != null ? '%' : undefined}
              sub="LAST 28 DAYS"
            />
            <View style={styles.metricDividerV} />
            <MetricTile label="ALL TIME"    value={loadingMetrics ? '—' : String(metrics?.totalKm ?? 0)}  unit={loadingMetrics ? undefined : 'km'} />
            <View style={styles.metricDividerV} />
            <MetricTile
              label="NUTRITION"
              value={loadingMetrics ? '—' : metrics?.nutritionCompliancePct != null ? String(metrics.nutritionCompliancePct) : '—'}
              unit={!loadingMetrics && metrics?.nutritionCompliancePct != null ? '%' : undefined}
              sub="COMPLIANCE"
            />
          </View>
          {metrics?.droppedByModality && (
            <VirraText
              variant="mono"
              size={11}
              color={colors.muted}
              style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xs }}
            >
              {Object.entries(metrics.droppedByModality)
                .map(([mod, count]) => `${count} ${mod}`)
                .join(' · ')}{' dropped'}
            </VirraText>
          )}
        </VirraCard>

        {/* Training narrative */}
        {loadingNarrative && !trainingText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>TRAINING</SectionLabel>
            <Shimmer height={18} lines={2} />
          </VirraCard>
        ) : trainingText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>TRAINING</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {trainingText}
            </VirraText>
          </VirraCard>
        ) : null}

        {/* Nutrition narrative */}
        {loadingNarrative && !nutritionText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>NUTRITION</SectionLabel>
            <Shimmer height={18} lines={2} />
          </VirraCard>
        ) : nutritionText ? (
          <VirraCard style={{ gap: spacing.xs }}>
            <SectionLabel color={phaseColor} style={styles.sectionLabel}>NUTRITION</SectionLabel>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={{ lineHeight: 22 }}>
              {nutritionText}
            </VirraText>
          </VirraCard>
        ) : null}

        {/* Fuelling alignment */}
        {metrics?.fuellingAlignment && (() => {
          const { daysOverTarget, daysUnderTarget, daysOnTarget } = metrics.fuellingAlignment!;
          const total = daysOverTarget + daysUnderTarget + daysOnTarget;
          if (total === 0) return null;
          let text: string;
          if (daysUnderTarget >= 3 && daysUnderTarget >= daysOverTarget) {
            text = `You've fuelled below your planned sessions ${daysUnderTarget} day${daysUnderTarget !== 1 ? 's' : ''} this week.`;
          } else if (daysOverTarget >= 3) {
            text = `You've eaten above your rest-day targets ${daysOverTarget} day${daysOverTarget !== 1 ? 's' : ''} this week.`;
          } else {
            text = 'Fuelling well-aligned with your training this week.';
          }
          return (
            <VirraCard style={{ gap: spacing.xs }}>
              <SectionLabel color={phaseColor} style={styles.sectionLabel}>FUELLING</SectionLabel>
              <VirraText variant="body" size={13} color="rgba(244,237,224,0.8)" style={{ lineHeight: 20 }}>
                {text}
              </VirraText>
            </VirraCard>
          );
        })()}

        {/* Phase-pace breakdown */}
        {metrics && metrics.phasePaces.length > 0 && (
          <VirraCard style={styles.paceCard}>
            <SectionLabel style={styles.sectionLabel}>PACE BY PHASE</SectionLabel>
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
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.paceCount}>
                    {pp.activityCount} runs
                  </VirraText>
                </View>
              ))}
          </VirraCard>
        )}

        {/* Recovery: symptom trend */}
        {metrics?.symptomTrend && (
          <VirraCard style={{ gap: spacing.sm }}>
            <SectionLabel style={styles.sectionLabel}>RECOVERY</SectionLabel>
            {(['energy','mood','sleep'] as const).map((key) => {
              const label     = key === 'sleep' ? 'SLEEP' : key.toUpperCase();
              const value     = metrics.symptomTrend![key];
              const pct       = Math.min(value / 10, 1);
              const barColor  = value >= 7 ? colors.pulse : value >= 4 ? colors.dawn : colors.heat;
              return (
                <View key={key} style={styles.symptomRow}>
                  <VirraText variant="mono" size={11} color={colors.muted} style={styles.symptomLabel} numberOfLines={1}>{label}</VirraText>
                  <View style={styles.symptomBar}>
                    <View style={[styles.symptomFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
                  </View>
                  <VirraText variant="mono" size={10} color={barColor} numberOfLines={1} style={styles.symptomValue}>{value}</VirraText>
                </View>
              );
            })}
            <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: 2 }}>7-DAY AVERAGE · 1–10 SCALE</VirraText>
          </VirraCard>
        )}

        {/* Upcoming: sessions + events */}
        <VirraCard style={{ gap: spacing.sm }}>
          <View style={styles.upcomingHeader}>
            <SectionLabel style={styles.sectionLabel}>UPCOMING 14 DAYS</SectionLabel>
            <Pressable
              onPress={() => setShowAddEvent(true)}
              style={styles.addEventBtn}
              accessibilityRole="button"
              accessibilityLabel="Add event"
            >
              <SymbolView name="plus" size={14} tintColor={colors.pulse} />
            </Pressable>
          </View>
          {upcomingSessions.length === 0 && upcomingEvents.length === 0 ? (
            <VirraText variant="mono" size={11} color={colors.muted}>No sessions or events planned.</VirraText>
          ) : (
            [...upcomingSessions.map((s: any) => ({ ...s, _type: 'session' as const })),
             ...upcomingEvents.map((e: any) => ({ ...e, _type: 'event' as const, scheduled_date: e.event_date }))]
              .sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1))
              .map((item, i) => (
                <View key={i} style={styles.upcomingItem}>
                  <View style={styles.upcomingRow}>
                    <SymbolView
                      name={item._type === 'event' ? 'calendar.badge.clock' : 'figure.run'}
                      size={12}
                      tintColor={item._type === 'event' ? colors.dawn : colors.pulse}
                    />
                    <VirraText variant="mono" size={11} color={colors.muted} style={{ minWidth: 52 }}>
                      {item.scheduled_date.slice(5)}
                    </VirraText>
                    <VirraText variant="body" size={13} color={colors.breath} style={{ flex: 1 }}>
                      {item._type === 'event'
                        ? item.name
                        : `${item.session_label.charAt(0).toUpperCase() + item.session_label.slice(1)} ${item.modality}`
                      }
                    </VirraText>
                  </View>
                  {(() => {
                    const summary = summaryFor(item);
                    return summary ? (
                      <VirraText variant="mono" size={10} color={colors.muted} style={styles.upcomingSummary}>
                        {summary}
                      </VirraText>
                    ) : null;
                  })()}
                </View>
              ))
          )}
        </VirraCard>

        {/* Footer */}
        {generatedAt && (
          <VirraText variant="mono" size={10} color="rgba(244,237,224,0.2)" style={styles.footer}>
            UPDATED {relativeTime(generatedAt).toUpperCase()}
          </VirraText>
        )}

      </ScrollView>

      {session && (
        <AddEventModal
          visible={showAddEvent}
          userId={session.user.id}
          onClose={() => setShowAddEvent(false)}
          onSaved={() => { setShowAddEvent(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  backBtn:         { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  phaseRow:        { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  scroll:          { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  sectionLabel:    { letterSpacing: 1.5, marginBottom: spacing.xs },
  narrativeCard:   { gap: spacing.sm },
  narrativeBody:   { lineHeight: 26, fontStyle: 'italic' },
  metricsCard:     { gap: spacing.md },
  metricsGrid:     { flexDirection: 'row', alignItems: 'center' },
  metricDividerV:  { width: 1, height: 44, backgroundColor: colors.border },
  metricDividerH:  { height: 1, backgroundColor: colors.border },
  paceCard:        { gap: spacing.sm },
  paceRow:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  phaseDot:        { width: 8, height: 8, borderRadius: 4 },
  pacePhaseLabel:  { flex: 1 },
  paceCount:       { minWidth: 44, textAlign: 'right' },
  symptomRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Fixed-width label column so every bar starts at the same x; keeps the
  // three bars equal in length. Wide enough for the longest mono label
  // ("ENERGY") at size 11 with letterSpacing 1.
  symptomLabel:    { width: 56, letterSpacing: 1 },
  symptomBar:      { flex: 1, flexShrink: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  symptomFill:     { height: '100%', borderRadius: 2 },
  // Right-aligned fixed column so single- and double-digit values both sit
  // flush right. marginLeft adds breathing room between the bar end and the
  // numeric value.
  symptomValue:    { width: 22, marginLeft: spacing.xs, textAlign: 'right' },
  upcomingHeader:  { flexDirection: 'row', alignItems: 'center' },
  addEventBtn:     { marginLeft: 'auto', padding: spacing.xs },
  upcomingItem:    { gap: 2, paddingVertical: 4 },
  upcomingRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 0 },
  upcomingSummary: { paddingLeft: 76, paddingBottom: 2 },
  footer:          { textAlign: 'center', letterSpacing: 2 },
});
