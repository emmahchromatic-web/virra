import React, { useMemo, useState } from 'react';
import {
  View, Pressable, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCycleStore } from '@/store/cycle';
import { useProfileStore, personalMetricsFields } from '@/store/profile';
import { useSessionStore } from '@/store/sessionStore';
import { useWeekSessions } from '@/hooks/useWeekSessions';
import { inferLoadFromLabel } from '@/lib/dailyTrainingContext';
import { resolveNutritionTargets, buildPersonalMetrics, type PersonalMetrics } from '@/lib/nutritionTargets';
import { getCyclePhase } from '@/lib/cycleEngine';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/lib/cycleEngine';
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

const LOAD_SHORT: Record<TrainingLoad, string> = {
  rest: 'REST', easy: 'EASY', moderate: 'MOD', hard: 'HARD',
};

const LOAD_COLOR: Record<TrainingLoad, string> = {
  rest:     colors.muted,
  easy:     colors.breath,
  moderate: colors.dawn,
  hard:     colors.heat,
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface Session {
  id:             string;
  scheduled_date: string;
  modality:       string;
  session_label:  string;
  status:         string;
}

interface DayRow {
  iso:      string;
  dayName:  string;
  date:     number;
  month:    string;
  sessions: Session[];
  load:     TrainingLoad;
  calories: number;
  phase:    CyclePhase | null;
}

function nextMondayISO(): string {
  const now    = new Date();
  const dow    = now.getDay();
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

const LOAD_RANK: Record<TrainingLoad, number> = { rest: 0, easy: 1, moderate: 2, hard: 3 };

function topLoad(sessions: Session[]): TrainingLoad {
  if (sessions.length === 0) return 'rest';
  return sessions.reduce<TrainingLoad>((top, s) => {
    const l = inferLoadFromLabel(s.session_label, s.modality);
    return LOAD_RANK[l] > LOAD_RANK[top] ? l : top;
  }, 'easy');
}

function buildWeekRows(
  monday:      string,
  sessions:    Session[],
  periodStart: Date | null,
  cycleLength: number,
  metrics:     PersonalMetrics | null,
): DayRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso        = offsetISO(monday, i);
    const date       = new Date(`${iso}T00:00:00`);
    const daySessions = sessions.filter((s) => s.scheduled_date === iso);
    const load       = topLoad(daySessions);
    const phase      = periodStart ? getCyclePhase(periodStart, cycleLength, date) : null;
    const { calories } = resolveNutritionTargets(metrics, phase, load);
    return {
      iso,
      dayName:  DAY_NAMES[i],
      date:     date.getDate(),
      month:    date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
      sessions: daySessions,
      load,
      calories,
      phase,
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
  const { periodStart, cycleLength }      = useCycleStore();
  const profile                           = useProfileStore();
  const metrics                           = useMemo(
    () => buildPersonalMetrics(personalMetricsFields(profile)),
    [profile.weightSteadyBaselineKg, profile.weightBaselineKg, profile.heightCm, profile.dateOfBirth],
  );
  const monday                            = useMemo(() => nextMondayISO(), []);
  const { days }                          = useWeekSessions(monday);
  const [busy, setBusy]                   = useState<string | null>(null);

  const rows: DayRow[] = useMemo(() => {
    const sessions: Session[] = days.flatMap((d) =>
      d.sessions
        .filter((s) => s.status !== 'moved')
        .map((s) => ({
          id:             s.id,
          scheduled_date: s.scheduled_date,
          modality:       s.modality,
          session_label:  s.session_label ?? '',
          status:         s.status,
        })),
    );
    return buildWeekRows(monday, sessions, periodStart, cycleLength ?? 28, metrics);
  }, [days, monday, periodStart, cycleLength, metrics]);

  async function handleDrop(sessionId: string) {
    setBusy(sessionId);
    try { await useSessionStore.getState().dropSession(sessionId); }
    catch (e: any) { Alert.alert('Could not drop session', e.message); }
    finally { setBusy(null); }
  }

  async function handleDefer(sessionId: string, currentDate: string) {
    setBusy(sessionId);
    try {
      const d = new Date(`${currentDate}T00:00:00`);
      d.setDate(d.getDate() + 7);
      await useSessionStore.getState().moveSession(sessionId, d.toLocaleDateString('en-CA'));
    } catch (e: any) { Alert.alert('Could not defer session', e.message); }
    finally { setBusy(null); }
  }

  const totalSessions = rows.reduce((n, r) => n + r.sessions.length, 0);
  const restDays      = rows.filter((r) => r.sessions.length === 0).length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Week ahead</VirraText>
        <View style={{ width: 18 }} />
      </View>

      <View style={s.body}>
        <View style={s.meta}>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.range}>{fmtRange(monday)}</VirraText>
          <VirraText variant="mono" size={11} color={colors.muted}>
            {totalSessions} SESSION{totalSessions !== 1 ? 'S' : ''} · {restDays} REST DAY{restDays !== 1 ? 'S' : ''}
          </VirraText>
        </View>

        <VirraCard style={s.card}>
          {rows.map((day, i) => (
            <React.Fragment key={day.iso}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.row}>

                {/* Date column */}
                <View style={s.dateCol}>
                  <VirraText variant="mono" size={10} color={colors.muted}>{day.dayName}</VirraText>
                  <VirraText variant="display" size={18}
                    color={day.sessions.length > 0 ? colors.breath : LOAD_COLOR.rest}>
                    {day.date}
                  </VirraText>
                </View>

                {/* Session column */}
                <View style={s.sessionCol}>
                  {day.sessions.length === 0 ? (
                    <View style={s.sessItem}>
                      <SymbolView name="moon.zzz" size={11} tintColor={LOAD_COLOR.rest} />
                      <VirraText variant="mono" size={11} color={LOAD_COLOR.rest}>REST DAY</VirraText>
                    </View>
                  ) : (
                    day.sessions.map((sess, si) => (
                      <View key={sess.id} style={[s.sessItem, si > 0 && { marginTop: 3 }]}>
                        <SymbolView
                          name={MODALITY_ICON[sess.modality] ?? 'figure.walk'}
                          size={11}
                          tintColor={MODALITY_COLOR[sess.modality] ?? colors.muted}
                        />
                        <VirraText variant="body" size={12} color={colors.breath} numberOfLines={1}>
                          {sess.session_label.charAt(0).toUpperCase() + sess.session_label.slice(1)}
                        </VirraText>
                      </View>
                    ))
                  )}
                </View>

                {/* Nutrition column */}
                <View style={s.nutritionCol}>
                  <VirraText variant="mono" size={11} color={LOAD_COLOR[day.load]}>
                    {LOAD_SHORT[day.load]}
                  </VirraText>
                  <VirraText variant="mono" size={10} color={colors.breath}>
                    {day.calories.toLocaleString()}
                  </VirraText>
                  <VirraText variant="mono" size={9} color={colors.muted}>KCAL</VirraText>
                </View>

                {/* Actions column — stacked */}
                <View style={s.actionsCol}>
                  {day.sessions.filter((sess) => sess.status === 'planned').map((sess) => (
                    <View key={sess.id} style={s.btnStack}>
                      <Pressable
                        style={s.actionBtn}
                        onPress={() => handleDefer(sess.id, sess.scheduled_date)}
                        disabled={!!busy}
                        hitSlop={4}
                      >
                        <SymbolView name="arrow.right.circle" size={11} tintColor={colors.muted} />
                        <VirraText variant="mono" size={9} color={colors.muted}>+1WK</VirraText>
                      </Pressable>
                      <Pressable
                        style={s.actionBtn}
                        onPress={() => handleDrop(sess.id)}
                        disabled={!!busy}
                        hitSlop={4}
                      >
                        <SymbolView name="xmark.circle" size={11} tintColor={colors.heat} />
                        <VirraText variant="mono" size={9} color={colors.heat}>DROP</VirraText>
                      </Pressable>
                    </View>
                  ))}
                </View>

              </View>
            </React.Fragment>
          ))}
        </VirraCard>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, height: 52,
  },
  backBtn:      { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  title:        { letterSpacing: 1.5 },
  body:         { flex: 1, padding: spacing.lg, paddingBottom: spacing.lg },
  meta:         { gap: 2, marginBottom: spacing.sm },
  range:        { letterSpacing: 1.5 },
  card:         { flex: 1, padding: 0, overflow: 'hidden' },
  divider:      { height: 1, backgroundColor: colors.border },
  row:          {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, gap: spacing.md,
  },
  dateCol:      { width: 36, alignItems: 'center', gap: 1 },
  sessionCol:   { flex: 1, gap: 2 },
  sessItem:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nutritionCol: { width: 52, alignItems: 'center', gap: 1 },
  actionsCol:   { width: 48, alignItems: 'flex-end', gap: 4 },
  btnStack:     { gap: 3 },
  actionBtn:    {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingVertical: 3, paddingHorizontal: 5,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
});
