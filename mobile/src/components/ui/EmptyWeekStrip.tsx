import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { DayCell } from './DayCell';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface EmptyWeekStripProps {
  todayIndex: number; // 0..6 for Mon..Sun
}

export function EmptyWeekStrip({ todayIndex }: EmptyWeekStripProps) {
  return (
    <View>
      <View style={empty.row}>
        {DAY_LABELS.map((letter, i) => (
          <DayCell
            key={i}
            state={{ kind: 'rest' }}
            isToday={i === todayIndex}
            dayLetter={letter}
          />
        ))}
      </View>
      <VirraText variant="body" size={11} color={colors.muted} style={empty.caption}>
        No active plan — tap to pick one
      </VirraText>
    </View>
  );
}

const empty = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  caption: { textAlign: 'center', marginTop: spacing.xs },
});
