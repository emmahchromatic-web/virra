import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraCard } from './VirraCard';
import { VirraText } from './VirraText';

export interface SeasonChainSummary {
  season_name:         string;
  total_weeks:         number;
  current_week:        number;
  current_phase:       string;          // 'Build', 'Recovery', etc.
  current_cycle_phase: string | null;   // 'Follicular', etc., or null
  next_event_name:     string;
  next_event_in_weeks: number;
  next_event_date:     string;
  later_events:        { name: string; in_weeks_after_next: number; date: string }[];
}

interface Props { summary: SeasonChainSummary | null; }

export function SeasonTimeline({ summary }: Props) {
  if (!summary) return null;
  const progressPct = Math.min(100, Math.round((summary.current_week / Math.max(1, summary.total_weeks)) * 100));

  return (
    <VirraCard style={styles.card}>
      <View style={styles.headerRow}>
        <VirraText variant="mono" size={9} color={colors.pulse} style={styles.kicker}>
          MY SEASON · {summary.total_weeks} WEEKS
        </VirraText>
        <VirraText variant="mono" size={9} color={colors.muted}>
          {summary.season_name}
        </VirraText>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progressPct}%` as any }]} />
      </View>
      <View style={styles.statusRow}>
        <VirraText variant="display" size={14} color={colors.breath}>
          Week {summary.current_week} · {summary.current_phase}
        </VirraText>
        {summary.current_cycle_phase && (
          <VirraText variant="mono" size={10} color={colors.pulse}>
            {summary.current_cycle_phase.toUpperCase()}
          </VirraText>
        )}
      </View>
      <View style={styles.divider} />
      <View style={styles.eventRow}>
        <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>NEXT</VirraText>
        <VirraText variant="bodyMedium" size={14} color={colors.breath}>
          {summary.next_event_name} · {summary.next_event_in_weeks} wk
        </VirraText>
      </View>
      {summary.later_events.map((e) => (
        <View key={e.date} style={styles.eventRow}>
          <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>THEN</VirraText>
          <VirraText variant="body" size={12} color="rgba(244,237,224,0.6)">
            {e.name} · {e.in_weeks_after_next} wk after
          </VirraText>
        </View>
      ))}
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:      { gap: spacing.sm },
  kicker:    { letterSpacing: 1.5 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack:  { height: 4, backgroundColor: 'rgba(212,255,38,0.15)', borderRadius: radius.full, overflow: 'hidden' },
  barFill:   { height: 4, backgroundColor: colors.pulse },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  divider:   { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  eventRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
