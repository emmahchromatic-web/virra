import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import type { UserEvent } from '@/lib/volumePlan';
import { useMonthSessions } from '@/hooks/useMonthSessions';
import type { PlannedSessionRow } from '@/store/sessionStore.types';

export interface CalendarSession {
  id: string;
  session_label: string | null;
  modality: string;
  status: string;
  block_id: string | null;
}

interface Props {
  userId:       string;
  year:         number;
  month:        number; // 1-based
  onDayPress?:  (date: string, sessions: CalendarSession[], events: UserEvent[]) => void;
  onLongPress?: (date: string) => void;
}

const MODALITY_COLOR: Record<string, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

const DAY_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function firstDayOffset(y: number, m: number): number {
  const jsDay = new Date(y, m - 1, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1; // Mon=0
}

export function MonthCalendar({ userId, year, month, onDayPress, onLongPress }: Props) {
  const { byDate } = useMonthSessions(year, month);
  const [eventMap, setEventMap] = useState<Record<string, UserEvent[]>>({});
  const todayISO = new Date().toLocaleDateString('en-CA');

  // Match the previous query's filter — exclude dropped/moved sessions from calendar dots.
  const sessionMap = useMemo<Record<string, CalendarSession[]>>(() => {
    const sMap: Record<string, CalendarSession[]> = {};
    for (const [date, rows] of Object.entries(byDate)) {
      const visible = (rows as PlannedSessionRow[]).filter(
        (r) => r.status === 'planned' || r.status === 'completed',
      );
      if (visible.length > 0) {
        sMap[date] = visible.map((r) => ({
          id:            r.id,
          session_label: r.session_label,
          modality:      r.modality,
          status:        r.status,
          block_id:      r.block_id,
        }));
      }
    }
    return sMap;
  }, [byDate]);

  useEffect(() => { loadEvents(); }, [userId, year, month]);

  async function loadEvents() {
    const startISO = toISO(year, month, 1);
    const endISO   = toISO(year, month, daysInMonth(year, month));

    const eventsRes = await supabase
      .from('user_events')
      .select('id, name, event_date, priority, target_finish_time')
      .eq('user_id', userId)
      .gte('event_date', startISO)
      .lte('event_date', endISO);

    if (eventsRes.error) console.error('[MonthCalendar] user_events fetch:', eventsRes.error.message);
    const eMap: Record<string, UserEvent[]> = {};
    for (const e of (eventsRes.data ?? [])) {
      if (!eMap[e.event_date]) eMap[e.event_date] = [];
      eMap[e.event_date].push(e as UserEvent);
    }
    setEventMap(eMap);
  }

  const totalDays   = daysInMonth(year, month);
  const startOffset = firstDayOffset(year, month);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={cal.container}>
      <View style={cal.headerRow}>
        {DAY_HEADER.map((d, i) => (
          <VirraText key={i} variant="mono" size={11} color={colors.muted} style={cal.headerCell}>{d}</VirraText>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={cal.weekRow}>
          {week.map((dayNum, di) => {
            if (dayNum === null) return <View key={di} style={cal.cell} />;
            const iso      = toISO(year, month, dayNum);
            const sessions = sessionMap[iso] ?? [];
            const isToday  = iso === todayISO;
            const isPast   = iso < todayISO;
            return (
              <Pressable
                key={di}
                style={[cal.cell, isToday && cal.cellToday]}
                onPress={() => {
                  const hasSessions = sessions.length > 0;
                  const hasEvents   = (eventMap[iso] ?? []).length > 0;
                  if (hasSessions || hasEvents) onDayPress?.(iso, sessions, eventMap[iso] ?? []);
                }}
                onLongPress={() => onLongPress?.(iso)}
                delayLongPress={400}
                accessibilityRole={(sessions.length > 0 || (eventMap[iso] ?? []).length > 0) ? 'button' : 'none'}
              >
                <VirraText
                  variant="mono"
                  size={11}
                  color={isToday ? colors.pulse : isPast ? colors.muted : colors.breath}
                >
                  {dayNum}
                </VirraText>
                {sessions.length > 0 && (
                  <View style={cal.dotRow}>
                    {sessions.slice(0, 3).map((s, si) => (
                      <View
                        key={si}
                        style={[
                          cal.dot,
                          {
                            backgroundColor: MODALITY_COLOR[s.modality] ?? colors.muted,
                            opacity: isPast && s.status !== 'completed' ? 0.35 : 1,
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
                {(eventMap[iso] ?? []).length > 0 && (
                  <SymbolView
                    name="flag.fill"
                    size={10}
                    tintColor={(eventMap[iso][0].priority === 1 ? colors.heat : colors.dawn) as any}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL = 40;
const cal = StyleSheet.create({
  container:  { gap: 2 },
  headerRow:  { flexDirection: 'row', marginBottom: spacing.xs },
  headerCell: { flex: 1, textAlign: 'center' },
  weekRow:    { flexDirection: 'row' },
  cell:       { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center',
                gap: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  cellToday:  { borderColor: colors.pulse },
  dotRow:     { flexDirection: 'row', gap: 2 },
  dot:        { width: 4, height: 4, borderRadius: 2 },
});
