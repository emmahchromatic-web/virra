import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { InlineError } from '@/components/ui/InlineError';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { formatPace } from '@/lib/volumePlan';
import { formatDuration } from '@/lib/todaysSession';
import {
  ACTIVITY_ICON, ACTIVITY_NAME, SUB_TYPE_ICON, SUB_TYPE_LABEL, type ActivityType,
} from '@/components/ui/ActivityRow';
import { HR_BACKFILL_WINDOW_DAYS } from '@/lib/healthKitImport';

/**
 * One activity, in full.
 *
 * Card 259, and the reason card 044 could never pass: `hr_avg` and `hr_max` are
 * written by BOTH the HealthKit import and the in-app tracker, and were read by
 * nothing. There was no activity detail route anywhere in the app, and
 * ActivityRow rendered inside a plain View, so a run on the timeline could not
 * even be opened. Heart rate has been landing correctly in a table nobody could
 * see.
 *
 * Splits and a GPS trace only exist for runs Virra recorded itself, which is
 * how this screen tells an app-recorded run from an imported one without
 * storing a source column: the data's shape is the source.
 */

interface Detail {
  avg_pace_seconds_per_km: number | null;
  elevation_gain_meters:   number | null;
  hr_avg:                  number | null;
  hr_max:                  number | null;
  splits_json:             { km: number; sec: number }[] | null;
  gps_trace:               unknown | null;
}

interface ActivityDetail {
  id:               string;
  activity_type:    ActivityType;
  sub_type:         string | null;
  started_at:       string;
  duration_seconds: number;
  distance_meters:  number | null;
  phase_at_time:    string | null;
  run_details:      Detail[] | null;
}

const PHASE_COLOR: Record<string, string> = {
  menstrual:  colors.heat,
  follicular: colors.sage,
  ovulatory:  colors.pulse,
  luteal:     colors.peach,
};

/** The '—' placeholder was swept out of the app in card 216. Middle dot. */
const NO_VALUE = '·';

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={s.stat}>
      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
        {label}
      </VirraText>
      <View style={s.statValue}>
        <VirraText variant="display" size={22} color={colors.breath}>{value}</VirraText>
        {unit ? (
          <VirraText variant="mono" size={11} color={colors.muted} style={{ marginBottom: 3 }}>{unit}</VirraText>
        ) : null}
      </View>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!id || !session) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('activities')
        .select(
          'id, activity_type, sub_type, started_at, duration_seconds, distance_meters, phase_at_time, ' +
          'run_details(avg_pace_seconds_per_km, elevation_gain_meters, hr_avg, hr_max, splits_json, gps_trace)',
        )
        .eq('id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (err)   { setError(err.message); setLoading(false); return; }
      if (!data) { setError('This activity could not be found.'); setLoading(false); return; }
      setActivity(data as unknown as ActivityDetail);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, session]);

  // PostgREST returns a 1:1 embed as an array. Same shape the timeline and
  // insightMetrics already handle.
  const detail   = activity?.run_details?.[0] ?? null;
  const isRun    = activity?.activity_type === 'run';
  const splits   = detail?.splits_json ?? [];
  // No stored source column, and none needed: Virra writes splits and a GPS
  // trace, the HealthKit import writes neither.
  const appRecorded = splits.length > 0 || detail?.gps_trace != null;

  const startedAt = activity ? new Date(activity.started_at) : null;
  const icon: SFSymbol = activity
    ? ((activity.sub_type ? SUB_TYPE_ICON[activity.sub_type] : undefined) ?? ACTIVITY_ICON[activity.activity_type])
    : 'figure.run';
  const name = activity
    ? ((activity.sub_type ? SUB_TYPE_LABEL[activity.sub_type] : undefined) ?? ACTIVITY_NAME[activity.activity_type])
    : '';

  const distanceKm = activity?.distance_meters ? activity.distance_meters / 1000 : null;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={s.headerBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Activity</VirraText>
        <View style={s.headerBtn} />
      </View>

      {loading && (
        <View style={s.centred}><ActivityIndicator color={colors.pulse} /></View>
      )}

      {!loading && error && (
        <View style={{ padding: spacing.lg }}>
          <InlineError title="Could not open this activity" message={error} onDismiss={() => router.back()} />
        </View>
      )}

      {!loading && activity && (
        <ScrollView contentContainerStyle={s.scroll}>
          <VirraCard style={{ gap: spacing.sm }}>
            <View style={s.titleRow}>
              <View style={s.iconWrap}>
                <SymbolView name={icon} size={22} tintColor={colors.dawn} />
              </View>
              <View style={{ flex: 1 }}>
                <VirraText variant="display" size={20} color={colors.breath}>{name}</VirraText>
                <VirraText variant="mono" size={11} color={colors.muted}>
                  {startedAt!.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}
                  {startedAt!.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </VirraText>
              </View>
              {activity.phase_at_time ? (
                <View style={[s.pill, { borderColor: PHASE_COLOR[activity.phase_at_time] ?? colors.muted }]}>
                  <VirraText variant="mono" size={9} color={PHASE_COLOR[activity.phase_at_time] ?? colors.muted}>
                    {activity.phase_at_time.toUpperCase()}
                  </VirraText>
                </View>
              ) : null}
            </View>
          </VirraCard>

          <VirraCard style={{ gap: spacing.md, marginTop: spacing.md }}>
            <SectionLabel>THE NUMBERS</SectionLabel>
            <View style={s.statGrid}>
              <Stat
                label="DISTANCE"
                value={distanceKm != null ? (distanceKm >= 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(2)) : NO_VALUE}
                unit={distanceKm != null ? 'km' : undefined}
              />
              <Stat label="DURATION" value={formatDuration(activity.duration_seconds) || NO_VALUE} />
              {isRun && (
                <Stat
                  label="AVG PACE"
                  value={detail?.avg_pace_seconds_per_km != null ? formatPace(detail.avg_pace_seconds_per_km).replace('/km', '') : NO_VALUE}
                  unit={detail?.avg_pace_seconds_per_km != null ? '/km' : undefined}
                />
              )}
              {isRun && (
                <Stat
                  label="ELEVATION"
                  value={detail?.elevation_gain_meters != null ? String(Math.round(detail.elevation_gain_meters)) : NO_VALUE}
                  unit={detail?.elevation_gain_meters != null ? 'm' : undefined}
                />
              )}
              <Stat
                label="AVG HR"
                value={detail?.hr_avg != null ? String(detail.hr_avg) : NO_VALUE}
                unit={detail?.hr_avg != null ? 'bpm' : undefined}
              />
              <Stat
                label="MAX HR"
                value={detail?.hr_max != null ? String(detail.hr_max) : NO_VALUE}
                unit={detail?.hr_max != null ? 'bpm' : undefined}
              />
            </View>

            {/* A blank number reads as a broken screen. Say which of the two
                reasons applies, so the answer is "not available for this run"
                rather than "something went wrong". */}
            {isRun && detail?.hr_avg == null && (
              <VirraText variant="body" size={12} color={colors.muted} style={{ lineHeight: 18 }}>
                No heart rate for this run. Imported runs carry it only from the last{' '}
                {HR_BACKFILL_WINDOW_DAYS} days, and runs recorded before that feature shipped have none.
              </VirraText>
            )}

            {/* Stated rather than left as a discrepancy someone finds later.
                See the note in healthKitImport: an imported workout has no
                pause list, so the whole window counts. */}
            {isRun && !appRecorded && detail?.hr_avg != null && (
              <VirraText variant="body" size={12} color={colors.muted} style={{ lineHeight: 18 }}>
                Imported from Apple Health. Averages cover the whole workout including any stops, so they
                read a little lower than a run recorded in Virra.
              </VirraText>
            )}
          </VirraCard>

          {splits.length > 0 && (
            <VirraCard style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <SectionLabel>SPLITS</SectionLabel>
              {splits.map((sp) => (
                <View key={sp.km} style={s.splitRow}>
                  <VirraText variant="mono" size={12} color={colors.muted}>KM {sp.km}</VirraText>
                  <VirraText variant="bodyMedium" size={14} color={colors.breath}>
                    {formatPace(sp.sec)}
                  </VirraText>
                </View>
              ))}
            </VirraCard>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  centred:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:    { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap:  { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.dawn, alignItems: 'center', justifyContent: 'center' },
  pill:      { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statGrid:  { flexDirection: 'row', flexWrap: 'wrap' },
  stat:      { width: '50%', gap: 2, marginBottom: spacing.md },
  statValue: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  splitRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
});
