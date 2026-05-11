import React, { useCallback, useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { dropSession, moveSession } from '@/lib/scheduleGenerator';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

const MODALITY_ICON: Record<string, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  other:    'figure.mixed.cardio',
};

const MODALITY_COLOR: Record<string, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface Session {
  id:            string;
  scheduled_date: string;
  modality:      string;
  session_label: string;
  status:        string;
}

interface DayRow {
  iso:      string;
  dayName:  string;
  date:     number;
  month:    string;
  sessions: Session[];
}

function nextMondayISO(): string {
  const now    = new Date();
  const dow    = now.getDay(); // 0=Sun
  const offset = dow === 0 ? 1 : 8 - dow;
  const d      = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.toLocaleDateString('en-CA');
}

function offsetISO(base: string, n: number): string {
  const [y, m, d] = base.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('en-CA');
}

function buildWeekRows(monday: string, sessions: Session[]): DayRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso  = offsetISO(monday, i);
    const date = new Date(`${iso}T00:00:00`);
    return {
      iso,
      dayName: DAY_NAMES[i],
      date:    date.getDate(),
      month:   date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
      sessions: sessions.filter((s) => s.scheduled_date === iso),
    };
  });
}

function fmtRange(monday: string): string {
  const start = new Date(`${monday}T00:00:00`);
  const end   = new Date(`${offsetISO(monday, 6)}T00:00:00`);
  const sFmt  = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  const eFmt  = end.toLocaleDateString('en-GB',   { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  return `${sFmt} – ${eFmt}`;
}

export default function WeekAheadScreen() {
  const { session }   = useAuthStore();
  const monday        = nextMondayISO();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => { load(); }, [session]),
  );

  async function load() {
    if (!session) return;
    const sunday = offsetISO(monday, 6);
    const { data } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date, modality, session_label, status')
      .eq('user_id', session.user.id)
      .gte('scheduled_date', monday)
      .lte('scheduled_date', sunday)
      .neq('status', 'moved')
      .order('scheduled_date');
    setRows(buildWeekRows(monday, (data ?? []) as Session[]));
  }

  async function handleDrop(sessionId: string) {
    setBusy(sessionId);
    try {
      await dropSession(sessionId);
      await load();
    } catch (e: any) {
      Alert.alert('Could not drop session', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleMoveNextWeek(sessionId: string, currentDate: string) {
    if (!session) return;
    setBusy(sessionId);
    try {
      const d = new Date(`${currentDate}T00:00:00`);
      d.setDate(d.getDate() + 7);
      await moveSession(sessionId, d.toLocaleDateString('en-CA'), session.user.id);
      await load();
    } catch (e: any) {
      Alert.alert('Could not move session', e.message);
    } finally {
      setBusy(null);
    }
  }

  const totalSessions = rows.reduce((n, r) => n + r.sessions.length, 0);
  const restDays      = rows.filter((r) => r.sessions.length === 0).length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.breath} />
        </Pressable>
        <VirraText variant="mono" size={11} color={colors.breath} style={s.title}>WEEK AHEAD</VirraText>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Range + summary */}
        <View style={s.meta}>
          <VirraText variant="mono" size={9} color={colors.muted} style={s.range}>
            {fmtRange(monday)}
          </VirraText>
          <VirraText variant="mono" size={9} color={colors.muted}>
            {totalSessions} SESSION{totalSessions !== 1 ? 'S' : ''} · {restDays} REST DAY{restDays !== 1 ? 'S' : ''}
          </VirraText>
        </View>

        {/* Day rows */}
        {rows.map((day) => (
          <VirraCard key={day.iso} style={s.dayCard}>
            <View style={s.dayHeader}>
              <View style={s.dayLabel}>
                <VirraText variant="mono" size={9} color={colors.muted}>{day.dayName}</VirraText>
                <VirraText variant="display" size={20} color={day.sessions.length > 0 ? colors.breath : colors.border}>
                  {day.date}
                </VirraText>
                <VirraText variant="mono" size={8} color={colors.muted}>{day.month}</VirraText>
              </View>

              <View style={s.sessionList}>
                {day.sessions.length === 0 ? (
                  <VirraText variant="mono" size={9} color={colors.border}>REST</VirraText>
                ) : (
                  day.sessions.map((sess, i) => (
                    <View key={sess.id} style={[s.sessionRow, i > 0 && s.sessionRowBorder]}>
                      <View style={s.sessionInfo}>
                        <View style={[s.modalityDot, { backgroundColor: MODALITY_COLOR[sess.modality] ?? colors.muted }]} />
                        <SymbolView
                          name={MODALITY_ICON[sess.modality] ?? 'figure.walk'}
                          size={13}
                          tintColor={MODALITY_COLOR[sess.modality] ?? colors.muted}
                        />
                        <View>
                          <VirraText variant="body" size={13} color={colors.breath}>
                            {sess.session_label.charAt(0).toUpperCase() + sess.session_label.slice(1)}
                          </VirraText>
                          <VirraText variant="mono" size={8} color={colors.muted}>
                            {sess.modality.toUpperCase()}
                          </VirraText>
                        </View>
                      </View>
                      {sess.status === 'planned' && (
                        <View style={s.actions}>
                          <Pressable
                            style={s.actionBtn}
                            onPress={() => handleMoveNextWeek(sess.id, sess.scheduled_date)}
                            disabled={!!busy}
                          >
                            <SymbolView name="arrow.right.circle" size={13} tintColor={colors.muted} />
                            <VirraText variant="mono" size={8} color={colors.muted}>+1 WK</VirraText>
                          </Pressable>
                          <Pressable
                            style={s.actionBtn}
                            onPress={() => handleDrop(sess.id)}
                            disabled={!!busy}
                          >
                            <SymbolView name="xmark.circle" size={13} tintColor={colors.heat} />
                            <VirraText variant="mono" size={8} color={colors.heat}>DROP</VirraText>
                          </Pressable>
                        </View>
                      )}
                      {sess.status !== 'planned' && (
                        <VirraText variant="mono" size={8} color={colors.muted}>
                          {sess.status.toUpperCase()}
                        </VirraText>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>
          </VirraCard>
        ))}

        {totalSessions === 0 && (
          <VirraCard style={s.emptyCard}>
            <VirraText variant="body" size={13} color={colors.muted}>
              No sessions planned for next week. Start a training plan to see your schedule here.
            </VirraText>
          </VirraCard>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.mile },
  header:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 52,
  },
  title:           { letterSpacing: 1.5 },
  scroll:          { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  meta:            { gap: 4, marginBottom: spacing.xs },
  range:           { letterSpacing: 1.5 },
  dayCard:         { padding: 0, overflow: 'hidden' },
  dayHeader:       { flexDirection: 'row' },
  dayLabel:        {
    width: 52, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: 2,
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  sessionList:     { flex: 1, justifyContent: 'center' },
  sessionRow:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  sessionRowBorder:{ borderTopWidth: 1, borderTopColor: colors.border },
  sessionInfo:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  modalityDot:     { width: 4, height: 4, borderRadius: 2 },
  actions:         { flexDirection: 'row', gap: spacing.xs },
  actionBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  emptyCard:       { gap: spacing.xs },
});
