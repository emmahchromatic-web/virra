import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { getCycleDayOverlay } from '@/lib/cycleMonthOverlay';
import type { CyclePhase } from '@/lib/cycleEngine';

const PHASE_COLOR: Record<CyclePhase, string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

const DAY_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  periodStart: Date;
  cycleLength: number;
  year?:       number;
  month?:      number; // 1-based
  today?:      Date;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function firstDayOffset(y: number, m: number): number {
  const jsDay = new Date(y, m - 1, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function CycleMonthCalendar({ periodStart, cycleLength, year, month, today = new Date() }: Props) {
  const y = year  ?? today.getFullYear();
  const m = month ?? today.getMonth() + 1;

  const totalDays   = daysInMonth(y, m);
  const startOffset = firstDayOffset(y, m);
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const todayISO = today.toLocaleDateString('en-CA');

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {DAY_HEADER.map((d, i) => (
          <VirraText key={i} variant="mono" size={11} color={colors.muted} style={styles.headerCell}>{d}</VirraText>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((dayNum, di) => {
            if (dayNum === null) return <View key={di} style={styles.cell} />;
            const iso     = toISO(y, m, dayNum);
            const isToday = iso === todayISO;
            const cellDate = new Date(y, m - 1, dayNum);
            const overlay  = getCycleDayOverlay(periodStart, cycleLength, cellDate);
            const tint     = PHASE_COLOR[overlay.phase];
            const textColor = overlay.phase === 'ovulatory' || overlay.phase === 'luteal'
              ? colors.mile
              : colors.breath;
            return (
              <View
                key={di}
                testID={isToday ? 'cycle-month-day-today' : `cycle-month-day-${dayNum}`}
                style={[
                  styles.cell,
                  styles.cellFilled,
                  { backgroundColor: tint },
                  isToday && styles.cellToday,
                ]}
              >
                <VirraText variant="mono" size={11} color={textColor}>{String(dayNum)}</VirraText>
                {overlay.isBleed && <View style={styles.bleedDot} />}
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <LegendDot color={colors.heat}   label="BLEED" />
        <LegendDot color={colors.dawn}   label="FOLLICULAR" />
        <LegendDot color={colors.pulse}  label="OVULATORY" />
        <LegendDot color={colors.breath} label="LUTEAL" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
    </View>
  );
}

const CELL = 40;
const styles = StyleSheet.create({
  container:    { gap: 2 },
  headerRow:    { flexDirection: 'row', marginBottom: spacing.xs },
  headerCell:   { flex: 1, textAlign: 'center' },
  weekRow:      { flexDirection: 'row', gap: 2 },
  cell:         { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.sm, position: 'relative' },
  cellFilled:   {},
  cellToday:    { borderWidth: 2, borderColor: colors.breath },
  bleedDot:     { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.mile },
  legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md, paddingHorizontal: spacing.xs },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
});
