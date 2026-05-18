import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export interface WeightReading {
  recorded_on: string;
  weight_kg:   number;
}

interface Props {
  baselineKg: number | null;
  readings:   WeightReading[];
  today?:     Date;
}

const VB_W = 800, VB_H = 280;
const PAD_L = 50, PAD_R = 20, PAD_T = 30, PAD_B = 40;
const WINDOW_DAYS = 90;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function autoScaleY(deltas: number[]): { min: number; max: number } {
  if (!deltas.length) return { min: -1, max: 1 };
  const lo = Math.min(...deltas, 0) - 0.3;
  const hi = Math.max(...deltas, 0) + 0.3;
  return { min: Math.min(lo, -1), max: Math.max(hi, 1) };
}

export function WeightSteadyChart({ baselineKg, readings, today = new Date() }: Props) {
  const calibrating = baselineKg === null;

  const inWindow = readings.filter((r) => daysBetween(today, new Date(r.recorded_on)) <= WINDOW_DAYS);
  const deltas   = baselineKg !== null
    ? inWindow.map((r) => r.weight_kg - baselineKg)
    : [];

  const { min: yMin, max: yMax } = autoScaleY(deltas);

  function xForDate(d: Date) {
    const usable = VB_W - PAD_L - PAD_R;
    const t = 1 - daysBetween(today, d) / WINDOW_DAYS;
    return PAD_L + Math.max(0, Math.min(1, t)) * usable;
  }
  function yForDelta(delta: number) {
    const usable = VB_H - PAD_T - PAD_B;
    const t      = (delta - yMin) / (yMax - yMin);
    return PAD_T + (1 - t) * usable;
  }

  const ySteps = [yMin, 0, yMax];

  return (
    <View>
      {calibrating && (
        <View style={styles.ribbon}>
          <VirraText variant="mono" size={9} color={colors.muted}>
            CALIBRATING — {inWindow.length}/7 READINGS LOGGED
          </VirraText>
        </View>
      )}
      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={200}>
        {ySteps.map((y, i) => (
          <Line
            key={i}
            x1={PAD_L} y1={yForDelta(y)} x2={VB_W - PAD_R} y2={yForDelta(y)}
            stroke="rgba(244,237,224,0.05)" strokeWidth={1}
          />
        ))}
        {ySteps.map((y, i) => (
          <SvgText
            key={`label-${i}`}
            x={PAD_L - 10} y={yForDelta(y) + 4}
            fill="rgba(244,237,224,0.4)" fontSize={10} fontFamily="SpaceMono_400Regular"
            textAnchor="end"
          >{y > 0 ? `+${y.toFixed(1)}` : y.toFixed(1)}</SvgText>
        ))}
        {!calibrating && (
          <>
            <Rect
              x={PAD_L} y={yForDelta(0.5)}
              width={VB_W - PAD_L - PAD_R}
              height={yForDelta(-0.5) - yForDelta(0.5)}
              fill="rgba(212,255,38,0.18)"
              stroke="rgba(212,255,38,0.4)"
              strokeWidth={1}
            />
            <Line
              x1={PAD_L} y1={yForDelta(0)} x2={VB_W - PAD_R} y2={yForDelta(0)}
              stroke="rgba(212,255,38,0.6)" strokeWidth={1} strokeDasharray="4,4"
            />
          </>
        )}
        {inWindow.map((r, i) => {
          const date    = new Date(r.recorded_on);
          const delta   = baselineKg !== null ? r.weight_kg - baselineKg : 0;
          const ageDays = daysBetween(today, date);
          const isToday = ageDays === 0;
          const recent  = ageDays <= 7;
          return (
            <Circle
              key={i}
              cx={xForDate(date)}
              cy={calibrating ? PAD_T + (VB_H - PAD_T - PAD_B) / 2 : yForDelta(delta)}
              r={isToday ? 6 : recent ? 4 : 3}
              fill={isToday ? colors.pulse : recent ? colors.pulse : 'rgba(244,237,224,0.5)'}
              stroke={isToday ? colors.breath : undefined}
              strokeWidth={isToday ? 2 : 0}
            />
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <Legend swatch={<View style={[styles.swatchLine, { backgroundColor: 'rgba(212,255,38,0.6)' }]} />} label="STEADY LINE" />
        <Legend swatch={<View style={[styles.swatchBand, { backgroundColor: 'rgba(212,255,38,0.18)', borderColor: 'rgba(212,255,38,0.4)' }]} />} label="±0.5 KG BAND" />
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: colors.pulse }]} />} label="READING" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon:      { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, marginBottom: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(255, 107, 61, 0.15)' },
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchLine:  { width: 10, height: 1 },
  swatchBand:  { width: 10, height: 6, borderRadius: 2, borderWidth: 1 },
  swatchDot:   { width: 8, height: 8, borderRadius: 4 },
});
