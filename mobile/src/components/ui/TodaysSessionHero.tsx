import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import {
  type TodaysSession,
  formatDistance,
  formatDuration,
} from '@/lib/todaysSession';
import { formatPace } from '@/lib/volumePlan';

const MODALITY_ICON: Record<TodaysSession['modality'], SymbolViewProps['name']> = {
  run:      'figure.run',
  strength: 'dumbbell.fill',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.mixed.cardio',
};

const MODALITY_TINT: Record<TodaysSession['modality'], string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted as string,
};

function labelCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

interface StatusBadgeProps { status: TodaysSession['status']; }

function StatusBadge({ status }: StatusBadgeProps) {
  const { color, text, icon } = status === 'completed'
    ? { color: colors.pulse, text: 'DONE',    icon: 'checkmark' as const }
    : { color: colors.dawn,  text: 'TO DO',   icon: 'circle'    as const };
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <SymbolView name={icon} size={11} tintColor={color} />
      <VirraText variant="mono" size={11} color={color}>{text}</VirraText>
    </View>
  );
}

interface Props {
  sessions:      TodaysSession[];
  onStartPress?: () => void;
}

export function TodaysSessionHero({ sessions, onStartPress }: Props) {
  if (sessions.length === 0) {
    return (
      <VirraCard style={styles.card}>
        <VirraText variant="mono" size={11} color={colors.pulse} style={styles.kicker}>
          TODAY
        </VirraText>
        <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 24 }}>
          Rest day.
        </VirraText>
        <VirraText variant="body" size={13} color="rgba(244,237,224,0.55)" style={{ lineHeight: 18 }}>
          No session planned — recovery is part of the work.
        </VirraText>
      </VirraCard>
    );
  }

  return (
    <VirraCard style={styles.card}>
      <VirraText variant="mono" size={11} color={colors.pulse} style={styles.kicker}>
        TODAY · {sessions.length > 1 ? `${sessions.length} SESSIONS` : '1 SESSION'}
      </VirraText>
      {sessions.map((s, i) => (
        <View key={s.id} style={[styles.row, i > 0 && styles.rowDivider]}>
          <View style={[styles.icon, { backgroundColor: `${MODALITY_TINT[s.modality]}22` }]}>
            <SymbolView
              name={MODALITY_ICON[s.modality]}
              size={20}
              tintColor={MODALITY_TINT[s.modality]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <VirraText variant="display" size={17} color={colors.breath}>
              {labelCase(s.session_label)}
            </VirraText>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.55)" style={{ marginTop: 2 }}>
              {s.modality.toUpperCase()}
              {s.status === 'completed' && s.actual_distance_m ? ` · ${formatDistance(s.actual_distance_m)}` : ''}
              {s.status === 'completed' && s.actual_duration_s ? ` · ${formatDuration(s.actual_duration_s)}` : ''}
            </VirraText>
            {s.cycle_reason_short && (
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ marginTop: 2 }}>
                {s.cycle_adjusted_pace_secs
                  ? `${s.cycle_pace_arrow ?? '↓'} ${formatPace(s.cycle_adjusted_pace_secs)} · `
                  : ''}
                {s.cycle_reason_short.toLowerCase()}
              </VirraText>
            )}
            {s.structure_summary && (
              <VirraText
                variant="mono"
                size={11}
                color={colors.muted}
                style={{ marginTop: 2 }}
              >
                {s.structure_summary}
              </VirraText>
            )}
          </View>
          <StatusBadge status={s.status} />
        </View>
      ))}
      {onStartPress && sessions.some(s => s.status === 'planned') && (
        <Pressable
          style={styles.startBtn}
          onPress={onStartPress}
          accessibilityRole="button"
          accessibilityLabel="Start today's session"
        >
          <VirraText variant="display" size={13} color={colors.mile} style={styles.startLabel}>
            {sessions.find(s => s.modality === 'run' && s.status === 'planned') ? '▶  START RUN' : '▶  START SESSION'}
          </VirraText>
        </Pressable>
      )}
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:       { gap: spacing.sm },
  kicker:     { letterSpacing: 1.5 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  icon:       { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  startBtn: {
    backgroundColor: colors.pulse,
    borderRadius:    radius.sm,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    marginTop:       spacing.xs,
  },
  startLabel: { letterSpacing: 1.5 },
});
