import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { DayCell } from './DayCell';
import { EmptyWeekStrip } from './EmptyWeekStrip';
import { deriveDayState, type DayState, type SessionForDay } from '@/lib/dayState';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface FetchedSession extends SessionForDay {
  id:             string;
  scheduled_date: string;
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

function todayIndexMonZero(): number {
  // Date.getDay(): 0=Sun..6=Sat → convert to Mon=0..Sun=6
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export function WeekStrip({ userId, phase }: { userId: string; phase?: CyclePhase | null }) {
  const [states,    setStates]    = useState<DayState[]>(() => Array(7).fill({ kind: 'rest' }));
  const [hasPlan,   setHasPlan]   = useState<boolean>(true); // optimistic
  const [todayLoad, setTodayLoad] = useState<TrainingLoad | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadGuarded();
    return () => { cancelled = true; };

    async function loadGuarded() {
      const monday   = getMondayISO();
      const sunday   = offsetISO(monday, 6);
      const todayISO = localDateISO(new Date());

      const [{ data: sessions }, { data: blocks }] = await Promise.all([
        supabase
          .from('planned_sessions')
          .select('id, scheduled_date, modality, status')
          .eq('user_id', userId)
          .gte('scheduled_date', monday)
          .lte('scheduled_date', sunday)
          .in('status', ['planned', 'completed'])
          .order('scheduled_date'),
        supabase
          .from('training_blocks')
          .select('id')
          .eq('user_id', userId)
          .lte('starts_on', todayISO)
          .or(`ends_on.is.null,ends_on.gte.${todayISO}`)
          .limit(1),
      ]);
      if (cancelled) return;

      const sessionsByDay: Record<string, FetchedSession[]> = {};
      for (let i = 0; i < 7; i++) sessionsByDay[offsetISO(monday, i)] = [];
      for (const s of (sessions ?? [])) {
        sessionsByDay[s.scheduled_date]?.push(s as FetchedSession);
      }

      const nextStates: DayState[] = [];
      for (let i = 0; i < 7; i++) {
        const iso    = offsetISO(monday, i);
        const isPast = iso < todayISO;
        nextStates.push(deriveDayState(sessionsByDay[iso], isPast));
      }
      setStates(nextStates);
      setHasPlan((blocks ?? []).length > 0);

      try {
        const ctx = await getDailyTrainingContext(userId, todayISO, phase ?? null);
        if (cancelled) return;
        setTodayLoad(ctx.inferred_load);
      } catch {
        // Non-critical — load label omitted on error
      }
    }
  }, [userId, phase]));

  const tIndex = todayIndexMonZero();

  function openTraining() {
    router.push('/(app)/(tabs)/training' as any);
  }

  if (!hasPlan) {
    return (
      <Pressable
        onPress={openTraining}
        accessibilityRole="button"
        accessibilityLabel="This week's training — open Training tab"
      >
        <EmptyWeekStrip todayIndex={tIndex} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={openTraining}
      accessibilityRole="button"
      accessibilityLabel="This week's training — open Training tab"
    >
      <View style={strip.row}>
        {states.map((s, i) => (
          <DayCell
            key={i}
            state={s}
            isToday={i === tIndex}
            dayLetter={DAY_LABELS[i]}
            belowSlot={i === tIndex && todayLoad ? (
              <VirraText variant="mono" size={10} color={colors.muted}>
                {todayLoad === 'moderate' ? 'MOD' : todayLoad.toUpperCase()}
              </VirraText>
            ) : undefined}
          />
        ))}
      </View>
    </Pressable>
  );
}

const strip = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
});
