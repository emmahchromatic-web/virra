import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Text as SvgText, Circle, Path } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { bandFor, type PhaseBands } from '@/lib/weightBand';
import { MIN_FOLLICULAR_READINGS } from '@/lib/weightBaseline';
import { getCycleInfo } from '@/lib/cycleEngine';
import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightReading {
  recorded_on: string;
  weight_kg:   number;
}

interface Props {
  baselineKg:  number | null;
  readings:    WeightReading[];
  periodStart: Date;
  cycleLength: number;
  /** The user's learned per-phase bands; falls back to the population band per
   *  phase where absent. */
  bands?:      PhaseBands | null;
  today?:      Date;
}

const VB_W = 800, VB_H = 320;
const PAD_L = 50, PAD_R = 20, PAD_T = 50, PAD_B = 60;
const Y_MIN = -1, Y_MAX = 3;

function xForDay(day: number, cycleLength: number) {
  const usable = VB_W - PAD_L - PAD_R;
  return PAD_L + ((day - 1) / (cycleLength - 1)) * usable;
}

function yForDelta(delta: number) {
  const usable = VB_H - PAD_T - PAD_B;
  const t = (delta - Y_MIN) / (Y_MAX - Y_MIN);
  return PAD_T + (1 - t) * usable;
}

function dayOfCycleFor(date: Date, periodStart: Date, cycleLength: number): { day: number; cycleOffset: number } {
  const ms          = date.getTime() - periodStart.getTime();
  const elapsed     = Math.floor(ms / 86400000);
  const cycleOffset = Math.floor(elapsed / cycleLength);
  const day         = ((elapsed % cycleLength) + cycleLength) % cycleLength + 1;
  return { day, cycleOffset };
}

// The store's `periodStart` is the latest logged period; it may be several cycles
// behind today. The chart needs a periodStart anchored to the cycle that contains
// today so cycleOffset 0 = current, -1 = prior, -2 = two-prior.
function anchorToCurrentCycle(periodStart: Date, cycleLength: number, today: Date): Date {
  const ms      = today.getTime() - periodStart.getTime();
  const elapsed = Math.floor(ms / 86400000);
  const n       = Math.floor(elapsed / cycleLength);
  if (n === 0) return periodStart;
  const d = new Date(periodStart);
  d.setDate(periodStart.getDate() + n * cycleLength);
  return d;
}

function phaseForDay(day: number, cycleLength: number): CyclePhase {
  if (day <= 5) return 'menstrual';
  const ov = cycleLength - 14;
  if (day >= ov - 1 && day <= ov + 1) return 'ovulatory';
  if (day < ov - 1) return 'follicular';
  return 'luteal';
}

function bandPath(cycleLength: number, bands?: PhaseBands | null): string {
  const days = Array.from({ length: cycleLength }, (_, i) => i + 1);
  const upper = days.map((d) => `${xForDay(d, cycleLength)},${yForDelta(bandFor(phaseForDay(d, cycleLength), bands).upper)}`);
  const lower = days.map((d) => `${xForDay(d, cycleLength)},${yForDelta(bandFor(phaseForDay(d, cycleLength), bands).lower)}`).reverse();
  return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
}

export function CycleWeightChart({ baselineKg, readings, periodStart, cycleLength, bands, today = new Date() }: Props) {
  const anchor      = anchorToCurrentCycle(periodStart, cycleLength, today);
  const todayInfo   = dayOfCycleFor(today, anchor, cycleLength);
  const calibrating = baselineKg === null;

  // The band is gated on follicular readings, not on elapsed cycles, so show
  // that count. Telling someone to wait "~3 cycles" sent them looking for a
  // cycle-logging problem when the real answer was to weigh in more often.
  const follicularLogged = calibrating
    ? readings.filter((r) => getCycleInfo(periodStart, cycleLength, new Date(r.recorded_on)).phase === 'follicular').length
    : 0;

  const buckets: Record<number, WeightReading[]> = { 0: [], [-1]: [], [-2]: [] };
  for (const r of readings) {
    const info = dayOfCycleFor(new Date(r.recorded_on), anchor, cycleLength);
    if (info.cycleOffset <= 0 && info.cycleOffset >= -2) {
      buckets[info.cycleOffset].push(r);
    }
  }

  function dotColor(offset: number): string {
    if (offset === 0)  return colors.pulse;
    if (offset === -1) return 'rgba(244, 237, 224, 0.55)';
    return 'rgba(244, 237, 224, 0.35)';
  }

  return (
    <View>
      {calibrating && (
        <View style={styles.ribbon}>
          <VirraText variant="mono" size={9} color={colors.muted}>
            CALIBRATING · {Math.min(follicularLogged, MIN_FOLLICULAR_READINGS)}/{MIN_FOLLICULAR_READINGS} FOLLICULAR READINGS{'\n'}WEIGH IN ACROSS YOUR CYCLE TO FINISH THIS
          </VirraText>
        </View>
      )}
      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={220}>
        {[-1, 0, 1, 2, 3].map((y) => (
          <Line
            key={y}
            x1={PAD_L} y1={yForDelta(y)} x2={VB_W - PAD_R} y2={yForDelta(y)}
            stroke={y === 0 ? 'rgba(244,237,224,0.15)' : 'rgba(244,237,224,0.05)'}
            strokeWidth={1}
            strokeDasharray={y === 0 ? '4,4' : undefined}
          />
        ))}
        {[-1, 0, 1, 2, 3].map((y) => (
          <SvgText
            key={`label-${y}`}
            x={PAD_L - 10} y={yForDelta(y) + 6}
            fill="rgba(244,237,224,0.5)" fontSize={18} fontFamily="SpaceMono_400Regular"
            textAnchor="end"
          >{y >= 0 ? `+${y}` : String(y)}</SvgText>
        ))}
        {!calibrating && (
          <Path d={bandPath(cycleLength, bands)} fill="rgba(212,255,38,0.18)" stroke="rgba(212,255,38,0.4)" strokeWidth={1} />
        )}
        {todayInfo.cycleOffset === 0 && (
          <>
            <Line
              x1={xForDay(todayInfo.day, cycleLength)} y1={PAD_T}
              x2={xForDay(todayInfo.day, cycleLength)} y2={VB_H - PAD_B}
              stroke="rgba(212,255,38,0.6)" strokeWidth={1} strokeDasharray="3,3"
            />
            <SvgText
              x={xForDay(todayInfo.day, cycleLength)} y={PAD_T - 12}
              fill={colors.pulse} fontSize={16} fontFamily="SpaceMono_400Regular"
              textAnchor="middle"
            >TODAY · D{todayInfo.day}</SvgText>
          </>
        )}
        {([-2, -1, 0] as const).map((offset) =>
          buckets[offset].map((r, i) => {
            const info    = dayOfCycleFor(new Date(r.recorded_on), periodStart, cycleLength);
            const delta   = baselineKg !== null ? r.weight_kg - baselineKg : 0;
            const isToday = offset === 0 && info.day === todayInfo.day;
            return (
              <Circle
                key={`${offset}-${i}`}
                cx={xForDay(info.day, cycleLength)}
                cy={yForDelta(delta)}
                r={isToday ? 6 : offset === 0 ? 4 : 3}
                fill={dotColor(offset)}
                stroke={isToday ? colors.breath : undefined}
                strokeWidth={isToday ? 2 : 0}
              />
            );
          })
        )}
        {[1, 6, 14, 17, cycleLength].map((d) => (
          <SvgText
            key={`x-${d}`}
            x={xForDay(d, cycleLength)} y={VB_H - PAD_B + 24}
            fill="rgba(244,237,224,0.5)" fontSize={16} fontFamily="SpaceMono_400Regular"
            textAnchor="middle"
          >{d}</SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        {/* Only key the band while it is actually drawn. The band itself has
            always been gated on having a baseline, but the legend was not, so a
            brand-new account saw "EXPECTED BAND" announced against a chart that
            had none. Card 223. */}
        {!calibrating && (
          <Legend swatch={<View style={[styles.swatchSquare, { backgroundColor: 'rgba(212,255,38,0.4)', borderColor: 'rgba(212,255,38,0.6)' }]} />} label="EXPECTED BAND" />
        )}
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: colors.pulse }]} />} label="CURRENT CYCLE" />
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: 'rgba(244,237,224,0.5)' }]} />} label="PRIOR CYCLES" />
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
  ribbon:       { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, marginBottom: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(255, 107, 61, 0.15)' },
  legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchSquare: { width: 10, height: 6, borderRadius: 2, borderWidth: 1 },
  swatchDot:    { width: 8, height: 8, borderRadius: 4 },
});
