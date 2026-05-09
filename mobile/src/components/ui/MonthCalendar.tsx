import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export interface CalendarSession {
  id: string;
  session_label: string;
  modality: string;
  status: string;
  block_id: string;
}

interface Props {
  userId:      string;
  year:        number;
  month:       number; // 1-based
  onDayPress?: (date: string, sessions: CalendarSession[]) => void;
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

export function MonthCalendar({ userId, year, month, onDayPress }: Props) {
  const [sessionMap, setSessionMap] = useState<Record<string, CalendarSession[]>>({});
  const todayISO = new Date().toLocaleDateString('en-CA');

  useEffect(() => { load(); }, [userId, year, month]);

  async function load() {
    const { data } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date, session_label, modality, status, block_id')
      .eq('user_id', userId)
      .gte('scheduled_date', toISO(year, month, 1))
      .lte('scheduled_date', toISO(year, month, daysInMonth(year, month)))
      .neq('status', 'moved')
      .order('scheduled_date');
    const map: Record<string, CalendarSession[]> = {};
    for (const s of (data ?? [])) {
      if (!map[s.scheduled_date]) map[s.scheduled_date] = [];
      map[s.scheduled_date].push(s as CalendarSession);
    }
    setSessionMap(map);
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
          <VirraText key={i} variant="mono" size={9} color={colors.muted} style={cal.headerCell}>{d}</VirraText>
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
                onPress={() => sessions.length > 0 && onDayPress?.(iso, sessions)}
                accessibilityRole={sessions.length > 0 ? 'button' : 'none'}
              >
                <VirraText
                  variant="mono"
                  size={11}
                  color={isToday ? colors.mile : isPast ? colors.muted : colors.breath}
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
                gap: 2, borderRadius: radius.sm },
  cellToday:  { backgroundColor: colors.breath },
  dotRow:     { flexDirection: 'row', gap: 2 },
  dot:        { width: 4, height: 4, borderRadius: 2 },
});
