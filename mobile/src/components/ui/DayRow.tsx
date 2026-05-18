import React, { useRef } from 'react';
import { View, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  date:         string;
  weekdayLabel: string;
  isToday:      boolean;
  highlighted:  boolean;
  children:     React.ReactNode | React.ReactNode[];
  onMeasure:    (date: string, top: number, bottom: number) => void;
}

export function DayRow({ date, weekdayLabel, isToday, highlighted, children, onMeasure }: Props) {
  const rowRef = useRef<View>(null);

  function handleLayout(_: LayoutChangeEvent) {
    if (!rowRef.current) return;
    rowRef.current.measureInWindow((_x, y, _w, h) => {
      onMeasure(date, y, y + h);
    });
  }

  const empty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <View
      ref={rowRef}
      onLayout={handleLayout}
      style={[styles.row, highlighted && styles.highlighted]}
    >
      <VirraText variant="mono" size={11} color={colors.muted} style={styles.kicker}>
        {weekdayLabel}{isToday ? ' · TODAY' : ''}
      </VirraText>
      {empty ? (
        <View style={styles.empty}>
          <VirraText variant="mono" size={10} color={colors.muted}>EMPTY</VirraText>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.xs, borderWidth: 2, borderColor: 'transparent' },
  highlighted:{ borderColor: colors.pulse, borderRadius: radius.sm },
  kicker:     { letterSpacing: 1.5 },
  scroll:     { gap: spacing.sm, paddingVertical: spacing.xs },
  empty:      { height: 64, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
