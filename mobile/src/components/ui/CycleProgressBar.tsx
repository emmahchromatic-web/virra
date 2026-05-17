import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  dayOfCycle: number;
  cycleLength: number;
  phaseColor: string;
}

export function CycleProgressBar({ dayOfCycle, cycleLength, phaseColor }: Props) {
  const pct = Math.min((dayOfCycle - 1) / cycleLength, 1);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
      <View style={[styles.dot,  { left:  `${pct * 100}%` as any, backgroundColor: phaseColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, backgroundColor: colors.border, borderRadius: radius.full, marginTop: spacing.md, position: 'relative', overflow: 'visible' },
  fill:  { position: 'absolute', top: 0, left: 0, height: 3, borderRadius: radius.full },
  dot:   { position: 'absolute', top: -4, width: 11, height: 11, borderRadius: radius.full, marginLeft: -5 },
});
