import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import type { NutritionTotals } from '@/lib/dashboardData';

const ARC_SIZE   = 52;
const ARC_STROKE = 5.5;
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE * 2) / 2;
const ARC_CIRC   = 2 * Math.PI * ARC_RADIUS;
const ARC_CENTER = ARC_SIZE / 2;

interface Props {
  totals:   NutritionTotals;
  onPress?: () => void;
}

function pct(logged: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(Math.round((logged / target) * 100), 100);
}

function MacroBar({ label, logged, target, color }: { label: string; logged: number; target: number; color: string }) {
  const fill = target > 0 ? Math.min(logged / target, 1) : 0;
  return (
    <View style={bar.row}>
      <VirraText variant="mono" size={7} color={colors.muted} style={bar.label}>{label}</VirraText>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${fill * 100}%`, backgroundColor: color }]} />
      </View>
      <VirraText variant="mono" size={7} color={colors.muted} style={bar.val}>{Math.round(logged)}g</VirraText>
    </View>
  );
}

export function NutritionArcCard({ totals, onPress }: Props) {
  const calPct     = pct(totals.caloriesLogged, totals.caloriesTarget);
  const dashOffset = ARC_CIRC * (1 - calPct / 100);

  const content = (
    <VirraCard style={styles.card}>
      <VirraText variant="mono" size={7} color={colors.muted} style={styles.kicker}>FUELLING TODAY</VirraText>
      <View style={styles.body}>
        <View style={styles.arcWrap}>
          <Svg width={ARC_SIZE} height={ARC_SIZE}>
            <Circle
              cx={ARC_CENTER} cy={ARC_CENTER} r={ARC_RADIUS}
              stroke={colors.border} strokeWidth={ARC_STROKE} fill="none"
            />
            <G transform={`rotate(-90, ${ARC_CENTER}, ${ARC_CENTER})`}>
              <Circle
                cx={ARC_CENTER} cy={ARC_CENTER} r={ARC_RADIUS}
                stroke={colors.dawn} strokeWidth={ARC_STROKE} fill="none"
                strokeDasharray={[ARC_CIRC, ARC_CIRC]}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.arcCenter} pointerEvents="none">
            <VirraText variant="display" size={14} color={colors.dawn}>{calPct}%</VirraText>
            <VirraText variant="mono" size={6} color={colors.muted}>KCAL</VirraText>
          </View>
        </View>
        <View style={styles.bars}>
          <MacroBar label="CARB" logged={totals.carbsLogged}   target={totals.carbsTarget}   color={colors.pulse} />
          <MacroBar label="PRO"  logged={totals.proteinLogged} target={totals.proteinTarget} color={colors.dawn}  />
          <MacroBar label="FAT"  logged={totals.fatLogged}     target={totals.fatTarget}     color={`${colors.breath}40`} />
        </View>
      </View>
    </VirraCard>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Fuelling today, open nutrition">
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card:      { gap: spacing.xs },
  kicker:    { letterSpacing: 1.5 },
  body:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  arcWrap:   { width: ARC_SIZE, height: ARC_SIZE, position: 'relative' },
  arcCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bars:      { flex: 1, gap: 5 },
});

const bar = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { width: 22, letterSpacing: 0.5 },
  track: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  fill:  { height: 4, borderRadius: radius.full },
  val:   { width: 28, textAlign: 'right' },
});
