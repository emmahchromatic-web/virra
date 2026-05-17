import React, { useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { buildCycleCalendar, type CycleCalendarDay } from '@/lib/cycleCalendar';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  periodStart: Date;
  cycleLength: number;
  today?:      Date;
}

const PHASE_COLOR: Record<CycleCalendarDay['phase'], string> = {
  menstrual:  colors.heat,
  follicular: colors.dawn,
  ovulatory:  colors.pulse,
  luteal:     colors.breath,
};

const CHIP_WIDTH = 40;
const CHIP_GAP   = 6;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

export function CycleCalendar({ periodStart, cycleLength, today = new Date() }: Props) {
  const days = buildCycleCalendar(periodStart, cycleLength);
  const scrollRef = useRef<ScrollView>(null);

  const todayIndex = days.findIndex((d) => sameDay(d.date, today));

  useEffect(() => {
    if (todayIndex < 0 || !scrollRef.current) return;
    const x = Math.max(0, todayIndex * (CHIP_WIDTH + CHIP_GAP) - CHIP_WIDTH * 2);
    scrollRef.current.scrollTo({ x, animated: false });
  }, [todayIndex]);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {days.map((d, i) => {
          const isToday   = i === todayIndex;
          const tint      = PHASE_COLOR[d.phase];
          const textColor = d.phase === 'ovulatory' || d.phase === 'luteal'
            ? colors.mile
            : colors.breath;
          return (
            <View
              key={d.dayOfCycle}
              testID={isToday ? 'cycle-day-today' : `cycle-day-${d.dayOfCycle}`}
              style={[
                styles.chip,
                { backgroundColor: tint },
                isToday && styles.chipToday,
              ]}
            >
              <VirraText variant="mono" size={11} color={textColor}>
                {String(d.dayOfCycle)}
              </VirraText>
              {d.isBleed && <View style={styles.bleedDot} />}
            </View>
          );
        })}
      </ScrollView>

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

const styles = StyleSheet.create({
  row:           { gap: CHIP_GAP, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  chip:          { width: CHIP_WIDTH, height: CHIP_WIDTH, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  chipToday:     { borderWidth: 2, borderColor: colors.breath, transform: [{ scale: 1.08 }] },
  bleedDot:      { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.mile },
  legend:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch:  { width: 8, height: 8, borderRadius: 2 },
});
