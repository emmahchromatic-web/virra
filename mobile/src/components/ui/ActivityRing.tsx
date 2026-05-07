import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface Props {
  value:     number;   // current value
  max:       number;   // target value
  color:     string;
  size?:     number;   // outer size in dp, default 56
  label:     string;   // e.g. "STEPS"
  valueText: string;   // formatted value e.g. "4.2k"
}

export function ActivityRing({ value, max, color, size = 56, label, valueText }: Props) {
  const stroke        = 4;
  const radius        = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress      = max > 0 ? Math.min(value / max, 1) : 0;
  const dashOffset    = circumference * (1 - progress);
  const center        = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress arc — starts at top (rotate -90°) */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <VirraText variant="display" size={11} color={colors.breath} style={styles.value}>
        {valueText}
      </VirraText>
    </View>
  );
}

function ActivityRingTile({ ring }: { ring: Props }) {
  return (
    <View style={styles.tile}>
      <ActivityRing {...ring} />
      <VirraText variant="mono" size={7} color={colors.muted} style={styles.tileLabel}>
        {ring.label}
      </VirraText>
    </View>
  );
}

export function ActivityRings({ steps, exerciseMins }: { steps: number; exerciseMins: number }) {
  const stepsText = steps >= 1000
    ? `${(steps / 1000).toFixed(1)}k`
    : String(steps);
  const minsText = String(exerciseMins);

  return (
    <View style={styles.stack}>
      <ActivityRingTile ring={{ value: steps, max: 10000, color: colors.pulse, label: 'STEPS', valueText: stepsText }} />
      <ActivityRingTile ring={{ value: exerciseMins, max: 30, color: colors.dawn, label: 'MIN', valueText: minsText }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { alignItems: 'center', justifyContent: 'center' },
  value:     { textAlign: 'center' },
  tile:      { alignItems: 'center', gap: 3 },
  tileLabel: { letterSpacing: 1, textAlign: 'center' },
  stack:     { gap: spacing.sm, alignItems: 'center' },
});
