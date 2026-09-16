import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraModal } from '@/components/ui/VirraModal';
import { useCycleStore } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import {
  listMobilitySessions,
  groupByLength,
  type MobilitySessionSummary,
} from '@/lib/mobilitySessions';
import {
  listScheduledMobility,
  scheduleWeekly,
  unscheduleWeekly,
  weekdayPlural,
  WEEKDAY_SHORT,
  type ScheduledMobility,
} from '@/lib/mobilitySchedule';
import type { CyclePhase } from '@/lib/cycleEngine';

/**
 * Card 264: the mobility library, and the two ways into it.
 *
 * Tap a session and it runs now, with no plan behind it. Tap the calendar on a
 * session and it joins your week on a chosen day, every week, as the mobility
 * plan in your stack. Emma's shape, 2026-09-16: "programme Deep Release weekly
 * on a Sunday, but also just go in and do Wind Down on days you feel like it."
 *
 * The sessions are grouped by how long they take, because that is the question
 * someone with a spare ten minutes is asking. Within a length the ones that
 * suit today's phase come first, but nothing is hidden: phase is a preference,
 * not a filter.
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

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MobilityScreen() {
  const [sessions,  setSessions]  = useState<MobilitySessionSummary[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMobility[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [failed,    setFailed]    = useState(false);
  const [picking,   setPicking]   = useState<MobilitySessionSummary | null>(null);
  const [pickDay,   setPickDay]   = useState<number | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [removing,  setRemoving]  = useState<string | null>(null);
  const { cycleInfo } = useCycleStore();
  const { session }   = useAuthStore();
  const userId = session?.user.id ?? null;
  const phase: CyclePhase | null = cycleInfo?.phase ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const [rows, inWeek] = await Promise.all([
      listMobilitySessions(),
      userId ? listScheduledMobility(userId).catch(() => [] as ScheduledMobility[]) : Promise.resolve([] as ScheduledMobility[]),
    ]);
    setSessions(rows);
    setScheduled(inWeek);
    setFailed(rows.length === 0);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupByLength(sessions, phase), [sessions, phase]);
  const scheduledNames = useMemo(() => new Set(scheduled.map((e) => e.label)), [scheduled]);

  function openPicker(s: MobilitySessionSummary) {
    setPicking(s);
    setPickDay(null);
    setError(null);
  }

  function closePicker() {
    if (busy) return;
    setPicking(null);
  }

  async function confirmSchedule() {
    if (!picking || pickDay == null || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await scheduleWeekly(userId, picking.id, pickDay);
      setPicking(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: ScheduledMobility) {
    const key = `${entry.label}|${entry.weekday}`;
    setRemoving(key);
    try {
      await unscheduleWeekly(entry);
      await load();
    } finally {
      setRemoving(null);
    }
  }

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
          Pilates-style sessions for range of movement. Tap one to do it now, or add it to your week.
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

        {!loading && scheduled.length > 0 && (
          <View style={styles.group}>
            <VirraText variant="mono" size={11} color={colors.pulse} style={{ letterSpacing: 1.5 }}>
              IN YOUR WEEK
            </VirraText>
            <VirraCard style={styles.weekCard}>
              {scheduled.map((e, i) => {
                const key = `${e.label}|${e.weekday}`;
                return (
                  <View key={key} style={[styles.weekRow, i > 0 && styles.weekDivider]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <VirraText variant="bodyMedium" size={15} color={colors.breath}>{e.label}</VirraText>
                      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1 }}>
                        {weekdayPlural(e.weekday).toUpperCase()} · NEXT {shortDate(e.nextDate).toUpperCase()}
                      </VirraText>
                    </View>
                    <Pressable
                      onPress={() => void remove(e)}
                      disabled={removing === key}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${e.label} from ${weekdayPlural(e.weekday)}`}
                    >
                      <VirraText variant="mono" size={10} color={removing === key ? colors.muted : colors.heat} style={{ letterSpacing: 1.5 }}>
                        {removing === key ? 'REMOVING' : 'REMOVE'}
                      </VirraText>
                    </Pressable>
                  </View>
                );
              })}
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={{ lineHeight: 18, marginTop: spacing.xs }}>
                This is the mobility plan in your stack. It is written eight weeks ahead and topped up as you go.
              </VirraText>
            </VirraCard>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.minutes} style={styles.group}>
            <VirraText variant="mono" size={11} color={colors.dawn} style={{ letterSpacing: 1.5 }}>
              {g.minutes} MINUTES
            </VirraText>
            {g.sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                phase={phase}
                inWeek={scheduledNames.has(s.name)}
                onSchedule={userId ? () => openPicker(s) : undefined}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <VirraModal visible={!!picking} onClose={closePicker} title="Add to your week">
        {picking && (
          <>
            <VirraText variant="display" size={20} color={colors.breath}>{picking.name}</VirraText>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.65)" style={{ lineHeight: 20, marginTop: spacing.xs }}>
              Every week on the day you pick. It becomes the mobility plan in your stack and sits alongside your run and strength plans.
            </VirraText>
            <View style={styles.days}>
              {WEEKDAY_SHORT.map((d, i) => {
                const on = pickDay === i;
                const taken = scheduled.find((e) => e.weekday === i);
                return (
                  <Pressable
                    key={d}
                    onPress={() => { setPickDay(i); setError(null); }}
                    style={[styles.day, on && styles.dayOn, !!taken && !on && styles.dayTaken]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${weekdayPlural(i)}${taken ? `, already ${taken.label}` : ''}`}
                  >
                    <VirraText variant="mono" size={11} color={on ? colors.mile : taken ? colors.muted : colors.breath}>
                      {d}
                    </VirraText>
                  </Pressable>
                );
              })}
            </View>
            {pickDay != null && (
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={{ lineHeight: 18 }}>
                {(() => {
                  const taken = scheduled.find((e) => e.weekday === pickDay);
                  return taken
                    ? `${weekdayPlural(pickDay)} already have ${taken.label}. Remove it first, or pick another day.`
                    : `${picking.name} every ${weekdayPlural(pickDay).slice(0, -1)}, starting this week.`;
                })()}
              </VirraText>
            )}
            {error && (
              <VirraText variant="body" size={13} color={colors.heat} style={{ lineHeight: 19 }}>{error}</VirraText>
            )}
            <View style={styles.actions}>
              <Pressable onPress={closePicker} disabled={busy} style={[styles.btn, styles.cancelBtn]} accessibilityRole="button">
                <VirraText variant="mono" size={11} color={colors.muted} style={{ letterSpacing: 1.5 }}>CANCEL</VirraText>
              </Pressable>
              <Pressable
                onPress={() => void confirmSchedule()}
                disabled={busy || pickDay == null || !!scheduled.find((e) => e.weekday === pickDay)}
                style={[styles.btn, styles.addBtn, (busy || pickDay == null || !!scheduled.find((e) => e.weekday === pickDay)) && styles.btnOff]}
                accessibilityRole="button"
              >
                <VirraText variant="mono" size={11} color={colors.mile} style={{ letterSpacing: 1.5 }}>
                  {busy ? 'ADDING' : 'ADD TO MY WEEK'}
                </VirraText>
              </Pressable>
            </View>
          </>
        )}
      </VirraModal>
    </SafeAreaView>
  );
}

function SessionCard({ session, phase, inWeek, onSchedule }: {
  session:     MobilitySessionSummary;
  phase:       CyclePhase | null;
  inWeek:      boolean;
  onSchedule?: () => void;
}) {
  const suitsToday = !!phase && session.phases.includes(phase);
  // A session tagged for every phase is not "for today" in any useful sense.
  const forToday = suitsToday && session.phases.length < 4;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(app)/workout-preview', params: { mobilitySessionId: session.id } } as any)}
      accessibilityRole="button"
      accessibilityLabel={`${session.name}, ${session.minutes} minutes, ${INTENSITY_LABEL[session.intensity]}. Do it now`}
    >
      <VirraCard style={styles.card}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardTop}>
            <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
              {INTENSITY_LABEL[session.intensity].toUpperCase()}
            </VirraText>
            {forToday && (
              <View style={styles.tag}>
                <SymbolView name="sparkle" size={9} tintColor={colors.sage} />
                <VirraText variant="mono" size={10} color={colors.sage} style={{ letterSpacing: 1 }}>SUITS TODAY</VirraText>
              </View>
            )}
            {inWeek && (
              <View style={styles.tag}>
                <SymbolView name="calendar" size={9} tintColor={colors.pulse} />
                <VirraText variant="mono" size={10} color={colors.pulse} style={{ letterSpacing: 1 }}>IN YOUR WEEK</VirraText>
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
          {onSchedule && (
            <Pressable
              onPress={onSchedule}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Add ${session.name} to your week`}
              style={styles.scheduleBtn}
            >
              <SymbolView name="calendar.badge.plus" size={16} tintColor={colors.pulse} />
            </Pressable>
          )}
        </View>
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  header:      { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:   { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  group:       { gap: spacing.sm, marginTop: spacing.sm },
  card:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tag:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardRight:   { alignItems: 'flex-end', gap: spacing.sm },
  scheduleBtn: { width: 32, height: 32, borderRadius: radius.full, borderWidth: 1, borderColor: colors.control, alignItems: 'center', justifyContent: 'center' },
  emptyCard:   { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
  weekCard:    { padding: spacing.md, gap: spacing.sm },
  weekRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  weekDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  days:        { flexDirection: 'row', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  day:         { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.control },
  dayOn:       { backgroundColor: colors.pulse, borderColor: colors.pulse },
  dayTaken:    { borderColor: colors.border, opacity: 0.6 },
  actions:     { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn:         { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.sm },
  cancelBtn:   { borderWidth: 1, borderColor: colors.control },
  addBtn:      { backgroundColor: colors.pulse },
  btnOff:      { opacity: 0.4 },
});
