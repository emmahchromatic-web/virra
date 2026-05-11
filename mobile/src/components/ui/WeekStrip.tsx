import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

interface StripSession {
  id: string;
  scheduled_date: string;
  modality: string;
  session_label: string;
  status: string;
}

interface DayData {
  sessions: StripSession[];
  isPast:   boolean;
  isToday:  boolean;
}

function localDateISO(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function getMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return localDateISO(monday);
}

function offsetISO(base: string, n: number): string {
  const [y, m, d] = base.split('-').map(Number);
  return localDateISO(new Date(y, m - 1, d + n));
}

export function WeekStrip({ userId, phase }: { userId: string; phase?: CyclePhase | null }) {
  const [dayMap,    setDayMap]    = useState<Record<string, DayData>>({});
  const [todayLoad, setTodayLoad] = useState<TrainingLoad | null>(null);

  useEffect(() => { load(); }, [userId]);

  async function load() {
    const monday   = getMondayISO();
    const sunday   = offsetISO(monday, 6);
    const todayISO = localDateISO(new Date());

    const { data } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date, modality, session_label, status')
      .eq('user_id', userId)
      .gte('scheduled_date', monday)
      .lte('scheduled_date', sunday)
      .neq('status', 'moved')
      .order('scheduled_date');

    const map: Record<string, DayData> = {};
    for (let i = 0; i < 7; i++) {
      const iso = offsetISO(monday, i);
      map[iso] = { sessions: [], isPast: iso < todayISO, isToday: iso === todayISO };
    }
    for (const s of (data ?? [])) {
      map[s.scheduled_date]?.sessions.push(s as StripSession);
    }
    setDayMap(map);

    try {
      const ctx = await getDailyTrainingContext(userId, todayISO, phase ?? null);
      setTodayLoad(ctx.inferred_load);
    } catch {
      // Non-critical — load label omitted on error
    }
  }

  return (
    <View style={strip.row}>
      {Object.entries(dayMap).map(([iso, day], i) => {
        const hasCompleted  = day.sessions.some((s) => s.status === 'completed');
        const hasSessions   = day.sessions.length > 0;
        const primary       = day.sessions[0];
        const modalityColor = primary ? (MODALITY_COLOR[primary.modality] ?? colors.muted) : null;
        const todayFill     = day.isToday && hasSessions && modalityColor;
        return (
          <View key={iso} style={strip.col}>
            <VirraText variant="mono" size={8} color={day.isToday ? colors.breath : colors.muted}>
              {DAY_LABELS[i]}
            </VirraText>
            <View style={[
              strip.circle,
              !hasSessions && strip.circleEmpty,
              todayFill && { backgroundColor: modalityColor, borderColor: modalityColor },
            ]}>
              {day.isPast && hasCompleted ? (
                <SymbolView name="checkmark" size={10} tintColor={colors.pulse} />
              ) : day.isPast && hasSessions ? (
                <SymbolView name="minus" size={10} tintColor={colors.muted} />
              ) : hasSessions && primary ? (
                <SymbolView
                  name={MODALITY_ICON[primary.modality] ?? 'figure.walk'}
                  size={12}
                  tintColor={day.isToday ? colors.mile : (MODALITY_COLOR[primary.modality] ?? colors.muted)}
                />
              ) : null}
            </View>
            {hasSessions && day.sessions.length > 1 && (
              <View style={strip.dots}>
                {day.sessions.slice(0, 3).map((s, di) => (
                  <View key={di} style={[strip.dot,
                    { backgroundColor: MODALITY_COLOR[s.modality] ?? colors.muted }]} />
                ))}
              </View>
            )}
            {day.isToday && todayLoad && (
              <VirraText variant="mono" size={8} color={colors.muted}>
                {todayLoad === 'moderate' ? 'MOD' : todayLoad.toUpperCase()}
              </VirraText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const CIRCLE = 32;
const strip = StyleSheet.create({
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  col:         { alignItems: 'center', gap: 4, flex: 1 },
  circle:      { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: 1,
                 borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
                 backgroundColor: colors.mist },
  circleEmpty: { borderColor: 'transparent', backgroundColor: 'transparent' },
  dots:        { flexDirection: 'row', gap: 3 },
  dot:         { width: 4, height: 4, borderRadius: 2 },
});
