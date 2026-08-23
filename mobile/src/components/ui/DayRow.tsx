import React from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  date:         string;
  weekdayLabel: string;
  isToday:      boolean;
  highlighted:  boolean;
  children:     React.ReactNode | React.ReactNode[];
  // top/bottom are relative to the ScrollView's content, not the window.
  // measureInWindow on a ScrollView child is unreliable on iOS; it returns
  // (0,0,0,0) until the user scrolls. nativeEvent.layout is always populated.
  onMeasure:    (date: string, top: number, bottom: number) => void;
}

export function DayRow({ date, weekdayLabel, isToday, highlighted, children, onMeasure }: Props) {
  function handleLayout(e: LayoutChangeEvent) {
    const { y, height } = e.nativeEvent.layout;
    onMeasure(date, y, y + height);
  }

  const empty = React.Children.toArray(children).length === 0;

  return (
    <View
      onLayout={handleLayout}
      style={[styles.row, highlighted && styles.highlighted]}
    >
      <VirraText variant="mono" size={11} color={colors.muted} style={styles.kicker}>
        {weekdayLabel}{isToday ? ' · TODAY' : ''}
      </VirraText>
      {empty ? (
        <View style={[styles.empty, highlighted && styles.emptyActive]}>
          <VirraText variant="mono" size={11} color={highlighted ? colors.pulse : colors.muted}>
            {highlighted ? 'DROP HERE' : 'REST DAY'}
          </VirraText>
        </View>
      ) : (
        <View style={styles.cards}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: 4, borderWidth: 2, borderColor: 'transparent', overflow: 'visible' },
  highlighted:{ borderColor: colors.pulse, borderRadius: radius.sm },
  kicker:     { letterSpacing: 1.5 },
  cards:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, overflow: 'visible' },
  empty:      { height: 52, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28,28,36,0.4)' },
  emptyActive:{ borderStyle: 'solid', borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.08)' },
});
