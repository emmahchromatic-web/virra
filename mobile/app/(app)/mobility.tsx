import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { useCycleStore } from '@/store/cycle';
import {
  listMobilitySessions,
  groupByLength,
  type MobilitySessionSummary,
} from '@/lib/mobilitySessions';
import type { CyclePhase } from '@/lib/cycleEngine';

/**
 * Card 264, the entry point for a one-off.
 *
 * The sessions are grouped by how long they take, because that is the question
 * someone with a spare ten minutes is asking. Within a length the ones that
 * suit today's phase come first, but nothing is hidden: phase is a preference,
 * not a filter, and a woman looking for hip work should never be told there is
 * none because of where she is in her cycle.
 *
 * Tapping one opens the workout screen with `mobilitySessionId`, which runs it
 * without a plan behind it.
 */

const PHASE_LINE: Record<CyclePhase, string> = {
  menstrual:  'Gentle, floor-based work first today.',
  follicular: 'Energy is rising. Fuller range is on the table.',
  ovulatory:  'Peak range today, and the easiest week to over-reach. Stop where the stretch is clear.',
  luteal:     'Hips and lower back take the brunt this week. Release-led sessions first.',
};

const INTENSITY_LABEL: Record<MobilitySessionSummary['intensity'], string> = {
  gentle:   'Gentle',
  moderate: 'Moderate',
  strong:   'Strong',
};

export default function MobilityScreen() {
  const [sessions, setSessions] = useState<MobilitySessionSummary[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [failed,   setFailed]   = useState(false);
  const { cycleInfo } = useCycleStore();
  const phase: CyclePhase | null = cycleInfo?.phase ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const rows = await listMobilitySessions();
    setSessions(rows);
    setFailed(rows.length === 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupByLength(sessions, phase), [sessions, phase]);

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
        <VirraText variant="display" size={24} color={colors.pulse}>Mobility</VirraText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <VirraText variant="serif" size={16} color={colors.breath} style={{ lineHeight: 24 }}>
          Pilates-style sessions for range of movement. Pick a length, roll out a mat, no plan needed.
        </VirraText>
        {phase && (
          <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={{ lineHeight: 20 }}>
            {PHASE_LINE[phase]}
          </VirraText>
        )}

        {loading && <ActivityIndicator color={colors.pulse} style={{ marginTop: spacing.xl }} />}

        {!loading && failed && (
          <VirraCard style={styles.emptyCard}>
            <VirraText variant="body" size={14} color={colors.breath} style={{ lineHeight: 22 }}>
              No sessions to show. We may not have reached the server.
            </VirraText>
            <Pressable onPress={() => void load()} accessibilityRole="button" style={{ marginTop: spacing.sm }}>
              <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>TRY AGAIN →</VirraText>
            </Pressable>
          </VirraCard>
        )}

        {groups.map((g) => (
          <View key={g.minutes} style={styles.group}>
            <VirraText variant="mono" size={11} color={colors.dawn} style={{ letterSpacing: 1.5 }}>
              {g.minutes} MINUTES
            </VirraText>
            {g.sessions.map((s) => (
              <SessionCard key={s.id} session={s} phase={phase} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({ session, phase }: { session: MobilitySessionSummary; phase: CyclePhase | null }) {
  const suitsToday = !!phase && session.phases.includes(phase);
  // A session tagged for every phase is not "for today" in any useful sense.
  const forToday = suitsToday && session.phases.length < 4;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(app)/workout-preview', params: { mobilitySessionId: session.id } } as any)}
      accessibilityRole="button"
      accessibilityLabel={`${session.name}, ${session.minutes} minutes, ${INTENSITY_LABEL[session.intensity]}`}
    >
      <VirraCard style={styles.card}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardTop}>
            <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
              {INTENSITY_LABEL[session.intensity].toUpperCase()}
            </VirraText>
            {forToday && (
              <View style={styles.today}>
                <SymbolView name="sparkle" size={9} tintColor={colors.sage} />
                <VirraText variant="mono" size={10} color={colors.sage} style={{ letterSpacing: 1 }}>SUITS TODAY</VirraText>
              </View>
            )}
          </View>
          <VirraText variant="bodyMedium" size={16} color={colors.breath}>{session.name}</VirraText>
          {session.focus && (
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={{ lineHeight: 18 }}>
              {session.focus}
            </VirraText>
          )}
        </View>
        <View style={styles.cardRight}>
          <VirraText variant="mono" size={10} color={colors.muted}>{session.minutes}m</VirraText>
          <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
        </View>
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:    { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  group:     { gap: spacing.sm, marginTop: spacing.sm },
  card:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  today:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  emptyCard: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
});
