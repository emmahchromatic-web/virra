import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { DayCell } from './DayCell';
import { EmptyWeekStrip } from './EmptyWeekStrip';
import { deriveDayState, type DayState } from '@/lib/dayState';
import { useIsPro } from '@/lib/pro';
import { loggedWeekStates, weekDates, type LoggedActivity } from '@/lib/loggedWeek';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { useWeekSessions } from '@/hooks/useWeekSessions';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

function todayIndexMonZero(): number {
  // Date.getDay(): 0=Sun..6=Sat → convert to Mon=0..Sun=6
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export function WeekStrip({ userId, phase }: { userId: string; phase?: CyclePhase | null }) {
  const mondayISO = useMemo(() => getMondayISO(), []);
  const todayISO  = useMemo(() => localDateISO(new Date()), []);

  const { days } = useWeekSessions(mondayISO);
  // Card 298. What she did is hers on any tier; what Virra planned for her is
  // Pro. On Pro this strip is the plan's week. Off Pro it is her logged week,
  // built from the activities table, and a lapsed subscriber's saved plan
  // stays behind the padlock with the rest.
  const isPro = useIsPro();
  const [logged, setLogged] = useState<LoggedActivity[] | null>(null);

  useFocusEffect(useCallback(() => {
    if (isPro) return;
    let cancelled = false;
    const dates = weekDates(mondayISO);
    const [y, m, d] = dates[0].split('-').map(Number);
    const from = new Date(y, m - 1, d).toISOString();
    const to   = new Date(y, m - 1, d + 7).toISOString();
    supabase
      .from('activities')
      .select('activity_type, sub_type, started_at')
      .eq('user_id', userId)
      .gte('started_at', from)
      .lt('started_at', to)
      .then(({ data }) => { if (!cancelled) setLogged((data as LoggedActivity[] | null) ?? []); });
    return () => { cancelled = true; };
  }, [isPro, userId, mondayISO]));

  const [hasPlan,   setHasPlan]   = useState<boolean>(true); // optimistic
  const [todayLoad, setTodayLoad] = useState<TrainingLoad | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadGuarded();
    return () => { cancelled = true; };

    async function loadGuarded() {
      const { data: blocks } = await supabase
        .from('training_blocks')
        .select('id')
        .eq('user_id', userId)
        .lte('starts_on', todayISO)
        .or(`ends_on.is.null,ends_on.gte.${todayISO}`)
        .limit(1);
      if (cancelled) return;
      setHasPlan((blocks ?? []).length > 0);

      try {
        const ctx = await getDailyTrainingContext(userId, todayISO, phase ?? null);
        if (cancelled) return;
        setTodayLoad(ctx.inferred_load);
      } catch {
        // Non-critical: load label omitted on error
      }
    }
  }, [userId, phase, todayISO]));

  const states: DayState[] = useMemo(() => {
    return days.map((d) => {
      const isPast = d.date < todayISO;
      // Filter to statuses dayState cares about (planned + completed), mirroring
      // the previous Supabase query's `.in('status', ['planned', 'completed'])`.
      const relevant = d.sessions.filter(
        (s) => s.status === 'completed' || (isPro && s.status === 'planned'),
      );
      return deriveDayState(relevant, isPast);
    });
  }, [days, todayISO, isPro]);

  const tIndex = todayIndexMonZero();

  // The strip is the plan's week. Off Pro there is no plan to show, and a
  // lapsed subscriber's saved one stays behind the padlock with the rest.
  if (!isPro) {
    if (!logged || logged.length === 0) {
      return (
        <EmptyWeekStrip
          todayIndex={tIndex}
          caption={logged ? 'Nothing logged yet this week' : ' '}
        />
      );
    }
    return (
      <View style={strip.row}>
        {loggedWeekStates(logged, mondayISO).map((s, i) => (
          <DayCell key={i} state={s} isToday={i === tIndex} dayLetter={DAY_LABELS[i]} />
        ))}
      </View>
    );
  }

  if (!hasPlan) {
    return <EmptyWeekStrip todayIndex={tIndex} />;
  }

  return (
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
    );
}

const strip = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
});
