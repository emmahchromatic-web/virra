import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { SectionLabel } from '@/components/ui/SectionLabel';

type MetricKey = 'energy' | 'mood' | 'sleep_quality';
type Period    = 7 | 30;

interface DayLog {
  recorded_on:   string;
  energy:        number | null;
  mood:          number | null;
  sleep_quality: number | null;
}

const METRICS: { key: MetricKey; label: string; icon: SFSymbol }[] = [
  { key: 'energy',        label: 'Energy', icon: 'bolt.fill'         },
  { key: 'mood',          label: 'Mood',   icon: 'face.smiling.fill' },
  { key: 'sleep_quality', label: 'Sleep',  icon: 'moon.fill'         },
];

function scoreColor(v: number): string {
  if (v >= 7) return colors.pulse;
  if (v >= 4) return colors.dawn;
  return colors.heat;
}

function isoToDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CheckinTrendsScreen() {
  const { session }              = useAuthStore();
  const [metric, setMetric]      = useState<MetricKey>('energy');
  const [period, setPeriod]      = useState<Period>(7);
  const [logs, setLogs]          = useState<DayLog[]>([]);
  const [loading, setLoading]    = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('symptom_logs')
        .select('recorded_on, energy, mood, sleep_quality')
        .eq('user_id', session.user.id)
        .gte('recorded_on', cutoff)
        .order('recorded_on', { ascending: true });
      if (!cancelled) {
        setLogs((data ?? []) as DayLog[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  const logMap = new Map(logs.map((l) => [l.recorded_on, l]));

  const days: string[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toLocaleDateString('en-CA'));
  }

  const values = days.map((d) => {
    const row = logMap.get(d);
    return row ? (row[metric] ?? null) : null;
  });

  const recorded = values.filter((v): v is number => v !== null);
  const avg   = recorded.length
    ? Math.round((recorded.reduce((a, b) => a + b, 0) / recorded.length) * 10) / 10
    : null;
  const best  = recorded.length ? Math.max(...recorded) : null;
  const worst = recorded.length ? Math.min(...recorded) : null;
  const bestDate  = best  !== null ? days.find((d) => logMap.get(d)?.[metric] === best)  ?? null : null;
  const worstDate = worst !== null ? days.find((d) => logMap.get(d)?.[metric] === worst) ?? null : null;

  const CHART_H = 72;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Check-in Trends</VirraText>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Metric tabs */}
        <View style={s.tabRow}>
          {METRICS.map((m) => (
            <Pressable
              key={m.key}
              style={[s.tab, metric === m.key && s.tabActive]}
              onPress={() => setMetric(m.key)}
              accessibilityRole="button"
              accessibilityLabel={m.label}
            >
              <SymbolView name={m.icon} size={14} tintColor={metric === m.key ? colors.pulse : colors.muted} />
              <VirraText variant="mono" size={10} color={metric === m.key ? colors.pulse : colors.muted} style={s.tabLabel}>
                {m.label.toUpperCase()}
              </VirraText>
            </Pressable>
          ))}
        </View>

        {/* Chart + period toggle */}
        <VirraCard>
          <View style={s.periodRow}>
            <SectionLabel style={s.cardLabel}>{METRICS.find((m) => m.key === metric)!.label.toUpperCase()}</SectionLabel>
            <View style={s.periodToggle}>
              {([7, 30] as Period[]).map((p) => (
                <Pressable
                  key={p}
                  style={[s.periodBtn, period === p && s.periodBtnActive]}
                  onPress={() => setPeriod(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p} days`}
                >
                  <VirraText variant="mono" size={9} color={period === p ? colors.pulse : colors.muted} style={{ letterSpacing: 1 }}>
                    {p}D
                  </VirraText>
                </Pressable>
              ))}
            </View>
          </View>

          {loading ? (
            <VirraText variant="mono" size={11} color={colors.muted}>Loading…</VirraText>
          ) : recorded.length === 0 ? (
            <VirraText variant="mono" size={11} color={colors.muted}>No check-ins in this period.</VirraText>
          ) : (
            <>
              <View style={[s.chart, { height: CHART_H }]}>
                {values.map((v, i) => {
                  const filled = v !== null;
                  return (
                    <View key={days[i]} style={s.barWrap}>
                      <View
                        style={[
                          s.bar,
                          {
                            height:          filled ? (v / 10) * CHART_H : 3,
                            backgroundColor: filled ? scoreColor(v) : colors.border,
                            opacity:         filled ? 1 : 0.35,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <View style={s.xAxis}>
                <VirraText variant="mono" size={9} color={colors.muted}>{isoToDisplay(days[0])}</VirraText>
                <VirraText variant="mono" size={9} color={colors.muted}>{isoToDisplay(days[days.length - 1])}</VirraText>
              </View>
            </>
          )}
        </VirraCard>

        {/* Stats */}
        {recorded.length > 0 && (
          <VirraCard>
            <SectionLabel style={s.cardLabel}>STATS</SectionLabel>
            <View style={s.statsRow}>
              <StatTile label="AVG"    value={avg   !== null ? String(avg)   : '—'} color={avg   !== null ? scoreColor(avg)   : colors.muted} />
              <View style={s.statDiv} />
              <StatTile label="BEST"   value={best  !== null ? String(best)  : '—'} sub={bestDate  ? isoToDisplay(bestDate)  : undefined} color={best  !== null ? scoreColor(best)  : colors.muted} />
              <View style={s.statDiv} />
              <StatTile label="LOWEST" value={worst !== null ? String(worst) : '—'} sub={worstDate ? isoToDisplay(worstDate) : undefined} color={worst !== null ? scoreColor(worst) : colors.muted} />
            </View>
            <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm }}>
              LOGGED {recorded.length}/{period} DAYS · 1–10 SCALE
            </VirraText>
          </VirraCard>
        )}

        {/* Quick link back to the check-in form */}
        <Pressable
          style={s.editBtn}
          onPress={() => router.push('/(app)/checkin')}
          accessibilityRole="button"
          accessibilityLabel="Update today's check-in"
        >
          <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1 }}>UPDATE TODAY'S CHECK-IN</VirraText>
          <SymbolView name="chevron.right" size={12} tintColor={colors.pulse} />
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={s.stat}>
      <VirraText variant="display" size={30} color={color}>{value}</VirraText>
      <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1, marginTop: 1 }}>{label}</VirraText>
      {sub && <VirraText variant="mono" size={9} color={colors.muted} style={{ marginTop: 1 }}>{sub}</VirraText>}
    </View>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:   { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  tabRow:      { flexDirection: 'row', gap: spacing.sm },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.control, backgroundColor: colors.mist },
  tabActive:   { borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.08)' },
  tabLabel:    { letterSpacing: 1 },

  periodRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  periodToggle: { flexDirection: 'row', gap: spacing.xs },
  periodBtn:    { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.control },
  periodBtnActive: { borderColor: colors.pulse },
  cardLabel:    { letterSpacing: 1.5 },

  chart:   { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: spacing.xs },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:     { width: '80%', borderRadius: 2 },
  xAxis:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },

  statsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xs },
  stat:     { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  statDiv:  { width: 1, height: 48, backgroundColor: colors.border },

  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
});
