import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export type ActivityType = 'run' | 'swim' | 'strength' | 'yoga' | 'other';

export interface Activity {
  id:               string;
  activity_type:    ActivityType;
  sub_type?:        string | null;
  started_at:       string;
  duration_seconds: number;
  distance_meters:  number | null;
  phase_at_time:    string | null;
  run_details?:     { avg_pace_seconds_per_km: number | null }[] | null;
}

const ACTIVITY_ICON: Record<ActivityType, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  swim:     'figure.pool.swim',
  strength: 'dumbbell',
  yoga:     'figure.mind.and.body',
  other:    'figure.mixed.cardio',
};

const ACTIVITY_NAME: Record<ActivityType, string> = {
  run:      'Run',
  swim:     'Swim',
  strength: 'Strength',
  yoga:     'Yoga',
  other:    'Workout',
};

// Sub-type label + matching SF Symbol when present.
// Keep in sync with mapSubType() in healthKitImport.ts.
type SymName = React.ComponentProps<typeof SymbolView>['name'];
const SUB_TYPE_LABEL: Record<string, string> = {
  trail_run:        'Trail Run',
  open_water_swim:  'Open Water Swim',
  hike:             'Hike',
  walk:             'Walk',
  cycle:            'Cycle',
  handcycle:        'Hand Cycle',
  row:              'Row',
  elliptical:       'Elliptical',
  stairs:           'Stairs',
  dance:            'Dance',
  martial:          'Martial Arts',
  climb:            'Climb',
  ski:              'Ski',
  skate:            'Skate',
  paddle:           'Paddle',
  surf:             'Surf',
  tennis:           'Tennis',
  golf:             'Golf',
  pilates:          'Pilates',
  hiit:             'HIIT',
  cross_train:      'Cross Train',
  mixed_cardio:     'Mixed Cardio',
};
const SUB_TYPE_ICON: Record<string, SymName> = {
  trail_run:        'figure.run',
  open_water_swim:  'figure.open.water.swim',
  hike:             'figure.hiking',
  walk:             'figure.walk',
  cycle:            'bicycle',
  handcycle:        'figure.outdoor.cycle',
  row:              'figure.rower',
  elliptical:       'figure.elliptical',
  stairs:           'figure.stair.stepper',
  dance:            'figure.dance',
  martial:          'figure.martial.arts',
  climb:            'figure.climbing',
  ski:              'figure.skiing.downhill',
  skate:            'figure.skating',
  paddle:           'figure.outdoor.rowing',
  surf:             'figure.surfing',
  tennis:           'figure.tennis',
  golf:             'figure.golf',
  pilates:          'figure.pilates',
  hiit:             'figure.highintensity.intervaltraining',
  cross_train:      'figure.cross.training',
  mixed_cardio:     'figure.mixed.cardio',
};

export const PHASE_COLOR: Record<string, string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, '0')}s`;
  return `${ss}s`;
}

export function formatPace(secPerKm: number | null): string | null {
  if (!secPerKm || secPerKm <= 0 || secPerKm > 1800) return null;
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

export function ActivityRow({ activity }: { activity: Activity }) {
  const type       = activity.activity_type;
  const sub        = activity.sub_type ?? null;
  const icon       = sub ? (SUB_TYPE_ICON[sub]  ?? ACTIVITY_ICON[type]) : ACTIVITY_ICON[type];
  const name       = sub ? (SUB_TYPE_LABEL[sub] ?? ACTIVITY_NAME[type]) : ACTIVITY_NAME[type];
  const distKm     = activity.distance_meters ? (activity.distance_meters / 1000).toFixed(2) : null;
  const pace       = type === 'run'
    ? formatPace(activity.run_details?.[0]?.avg_pace_seconds_per_km ?? null)
    : null;
  const phaseColor = activity.phase_at_time
    ? (PHASE_COLOR[activity.phase_at_time] ?? colors.muted)
    : colors.muted;
  const time = new Date(activity.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(activity.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const isToday = new Date(activity.started_at).toDateString() === new Date().toDateString();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { borderColor: phaseColor }]}>
        <SymbolView name={icon} size={18} tintColor={phaseColor} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <VirraText variant="bodyMedium" size={15} color={colors.breath}>{name}</VirraText>
          {activity.phase_at_time && (
            <View style={[styles.phasePill, { borderColor: phaseColor }]}>
              <VirraText variant="mono" size={9} color={phaseColor} style={styles.phaseText}>
                {activity.phase_at_time.toUpperCase()}
              </VirraText>
            </View>
          )}
        </View>
        <View style={styles.meta}>
          {distKm && <VirraText variant="mono" size={10} color={colors.muted}>{distKm} km</VirraText>}
          {distKm && <VirraText variant="mono" size={10} color={colors.border}>·</VirraText>}
          <VirraText variant="mono" size={10} color={colors.muted}>{formatDuration(activity.duration_seconds)}</VirraText>
          {pace && <VirraText variant="mono" size={10} color={colors.border}>·</VirraText>}
          {pace && <VirraText variant="mono" size={10} color={colors.muted}>{pace}</VirraText>}
          <VirraText variant="mono" size={10} color={colors.border}>·</VirraText>
          <VirraText variant="mono" size={10} color={colors.muted}>{isToday ? time : date}</VirraText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  iconWrap:   { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mist },
  body:       { flex: 1, gap: 4 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  phasePill:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  phaseText:  { letterSpacing: 1 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
});
