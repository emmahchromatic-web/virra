import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

const CAL_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CAL_MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                    'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y: number, m: number) {
  const js = new Date(y, m, 1).getDay();
  return js === 0 ? 6 : js - 1; // 0=Mon
}

export function CalendarPicker({
  value, minDate, onSelect,
}: {
  value:    Date;
  minDate:  Date;
  onSelect: (d: Date) => void;
}) {
  const [viewY, setViewY] = useState(value.getFullYear());
  const [viewM, setViewM] = useState(value.getMonth());

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY((y) => y - 1); }
    else setViewM((m) => m - 1);
  }
  function nextMonth() {
    if (viewM === 11) { setViewM(0); setViewY((y) => y + 1); }
    else setViewM((m) => m + 1);
  }

  const total  = daysInMonth(viewY, viewM);
  const offset = firstDow(viewY, viewM);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const minY = minDate.getFullYear(), minM = minDate.getMonth(), minD = minDate.getDate();
  const selY = value.getFullYear(),   selM = value.getMonth(),   selD = value.getDate();

  const canPrev = viewY > minY || (viewY === minY && viewM > minM);

  return (
    <View style={cal.wrap}>
      {/* Header */}
      <View style={cal.header}>
        <Pressable onPress={canPrev ? prevMonth : undefined} style={cal.navBtn}>
          <SymbolView name="chevron.left" size={11}
            tintColor={canPrev ? colors.breath : colors.border} />
        </Pressable>
        <VirraText variant="mono" size={10} color={colors.breath} style={{ letterSpacing: 1.5 }}>
          {CAL_MONTHS[viewM]} {viewY}
        </VirraText>
        <Pressable onPress={nextMonth} style={cal.navBtn}>
          <SymbolView name="chevron.right" size={11} tintColor={colors.breath} />
        </Pressable>
      </View>

      {/* Day headers */}
      <View style={cal.row}>
        {CAL_DAYS.map((d, i) => (
          <VirraText key={i} variant="mono" size={11} color={colors.muted} style={cal.cell}>{d}</VirraText>
        ))}
      </View>

      {/* Date grid */}
      {Array.from({ length: cells.length / 7 }, (_, wi) => (
        <View key={wi} style={cal.row}>
          {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
            if (!day) return <View key={di} style={cal.cell} />;
            const isSelected = viewY === selY && viewM === selM && day === selD;
            const isDisabled = viewY < minY
              || (viewY === minY && viewM < minM)
              || (viewY === minY && viewM === minM && day < minD);
            return (
              <Pressable
                key={di}
                style={[cal.cell, cal.dayCell, isSelected && cal.dayCellSelected]}
                onPress={() => !isDisabled && onSelect(new Date(viewY, viewM, day))}
                disabled={isDisabled}
              >
                <VirraText
                  variant="mono"
                  size={11}
                  color={isSelected ? colors.mile : isDisabled ? colors.border : colors.breath}
                >
                  {day}
                </VirraText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toLocalISO(date: Date): string {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

const cal = StyleSheet.create({
  wrap:           { marginVertical: spacing.xs, borderRadius: radius.md, overflow: 'hidden' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  navBtn:         { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  row:            { flexDirection: 'row' },
  cell:           { flex: 1, textAlign: 'center', paddingVertical: 2 },
  dayCell:        { alignItems: 'center', paddingVertical: 5, borderRadius: radius.sm },
  dayCellSelected:{ backgroundColor: colors.pulse },
});
