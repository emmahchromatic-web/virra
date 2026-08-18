import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { useProfileStore } from '@/store/profile';
import { useCycleStore } from '@/store/cycle';
import {
  STEADY_BAND,
  classifyReading, classifySteady, bandFor,
  type BandPosition, type PhaseBands,
} from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

interface Props {
  latestKg: number | null;
  /** Optional tap handler — when provided the whole card becomes pressable
   *  (e.g. for dashboard glance-card use). Omit on detail screens. */
  onPress?: () => void;
}

// Generic phase-aware copy used when there isn't yet a reading + baseline to
// contextualise. This replaces the standalone WHAT TO EXPECT card.
const PHASE_EXPECTATION: Record<CyclePhase, string> = {
  menstrual:  'Bleed days often show your lowest read of the cycle as water levels reset.',
  follicular: 'Follicular days are your steadiest baseline — energy rises and weight tends to hold.',
  ovulatory:  'A small lift around ovulation is normal. Hormones drive a brief water rise.',
  luteal:     'Expect a 1–2 kg lift before your period. This is water retention, not fat gain.',
};

const IN_BAND: Record<CyclePhase, string> = {
  menstrual:  'Right where your body wants to be today.',
  follicular: 'This is your body\'s natural floor — the number to anchor to.',
  ovulatory:  'A small lift around ovulation is normal hormonal water.',
  luteal:     'Right where your body wants to be today. This is water, not fat. It\'ll resolve in 5–7 days.',
};

const ABOVE_BAND: Record<CyclePhase, string> = {
  menstrual:  'A touch higher than usual for a bleed day. Worth a glance, not an alarm.',
  follicular: 'Slightly above your follicular baseline. Salt, alcohol, or a hard session can do this.',
  ovulatory:  'Ovulatory days can run high on water retention. Resolves in a few days.',
  luteal:     'A touch above the typical luteal peak. Watch what happens after your period.',
};

const BELOW_BAND: Record<CyclePhase, string> = {
  menstrual:  'Below the usual bleed-day range. If training\'s been heavy, check fuelling.',
  follicular: 'Below your follicular floor. If this persists, take a look at your fuelling.',
  ovulatory:  'Below the typical ovulatory range. Check intake against training load.',
  luteal:     'Below the typical luteal range. If training is high, you may need more carbs.',
};

const STEADY_COPY: Record<BandPosition, string> = {
  in_band: 'Within your usual daily range.',
  above:   'A touch above your steady line. One day isn\'t a trend — water, salt, or food timing can do this.',
  below:   'A touch below your steady line. If training has been heavy, check fuelling.',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'MENSTRUAL', follicular: 'FOLLICULAR', ovulatory: 'OVULATORY', luteal: 'LUTEAL',
};

function cycleCopyFor(position: BandPosition, phase: CyclePhase): string {
  if (position === 'above') return ABOVE_BAND[phase];
  if (position === 'below') return BELOW_BAND[phase];
  return IN_BAND[phase];
}

function pillColor(position: BandPosition): string {
  return position === 'in_band' ? colors.pulse : colors.dawn;
}

function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)} kg`;
}

function CycleMiniBand({ phase, delta, personal }: { phase: CyclePhase; delta: number; personal?: PhaseBands | null }) {
  const min = -1, max = 3;
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const { lower, upper } = bandFor(phase, personal);
  return (
    <View style={mini.track}>
      <View style={[mini.band, { left: `${pct(lower) * 100}%`, right: `${(1 - pct(upper)) * 100}%` }]} />
      <View style={[mini.marker, { left: `${pct(delta) * 100}%` }]} />
    </View>
  );
}

function SteadyMiniBand({ delta }: { delta: number }) {
  const min = -1.5, max = 1.5;
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const { lower, upper } = STEADY_BAND;
  return (
    <View style={mini.track}>
      <View style={[mini.band, { left: `${pct(lower) * 100}%`, right: `${(1 - pct(upper)) * 100}%` }]} />
      <View style={[mini.marker, { left: `${pct(delta) * 100}%` }]} />
    </View>
  );
}

const mini = StyleSheet.create({
  track:  { height: 6, backgroundColor: colors.border, borderRadius: radius.full, position: 'relative', overflow: 'visible' },
  band:   { position: 'absolute', top: 0, height: 6, backgroundColor: colors.pulse, opacity: 0.35, borderRadius: radius.full },
  marker: { position: 'absolute', top: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.breath, marginLeft: -6 },
});

export function WeightGlanceCard({ latestKg, onPress }: Props) {
  const trackWeight    = useProfileStore((s) => s.trackWeight);
  const cycleBaseline  = useProfileStore((s) => s.weightBaselineKg);
  const cyclePhaseBands = useProfileStore((s) => s.weightPhaseBands);
  const steadyBaseline = useProfileStore((s) => s.weightSteadyBaselineKg);
  const cycleProfile   = useCycleStore((s) => s.cycleProfile);
  const cycleInfo      = useCycleStore((s) => s.cycleInfo);

  if (!trackWeight) return null;

  const isCycleMode = cycleProfile === 'natural' || cycleProfile === 'irregular';

  const card = isCycleMode
    ? renderCycleBody({ latestKg, baseline: cycleBaseline, phase: cycleInfo?.phase ?? 'follicular', personal: cyclePhaseBands })
    : renderSteadyBody({ latestKg, baseline: steadyBaseline });

  if (!card) return null;

  if (onPress) {
    return <Pressable onPress={onPress}>{card}</Pressable>;
  }
  return card;
}

function renderCycleBody({
  latestKg, baseline, phase, personal,
}: { latestKg: number | null; baseline: number | null; phase: CyclePhase; personal?: PhaseBands | null }) {
  // No reading yet → show the generic phase expectation (formerly the
  // standalone WHAT TO EXPECT card).
  if (latestKg === null) {
    return (
      <VirraCard>
        <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
          WEIGHT · {PHASE_LABEL[phase]}
        </VirraText>
        <VirraText variant="body" size={14} color={colors.breath}>
          {PHASE_EXPECTATION[phase]}
        </VirraText>
      </VirraCard>
    );
  }

  // Reading present but baseline still settling.
  if (baseline === null) {
    return (
      <VirraCard>
        <View style={styles.row}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            WEIGHT · {PHASE_LABEL[phase]}
          </VirraText>
          <View style={[styles.pill, { borderColor: colors.muted }]}>
            <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
          </View>
        </View>
        <VirraText variant="display" size={28} color={colors.breath}>{latestKg.toFixed(1)} kg</VirraText>
        <VirraText variant="body" size={14} color={colors.breath}>
          {PHASE_EXPECTATION[phase]}
        </VirraText>
        <VirraText variant="body" size={12} color={colors.muted}>
          We need a few more cycles before the band becomes reliable.
        </VirraText>
      </VirraCard>
    );
  }

  const delta       = Math.round((latestKg - baseline) * 10) / 10;
  const position    = classifyReading(delta, phase, personal);
  const statusLabel = position === 'in_band' ? 'IN BAND' : position === 'above' ? 'ABOVE BAND' : 'BELOW BAND';
  return (
    <VirraCard>
      <View style={styles.row}>
        <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
          WEIGHT · {PHASE_LABEL[phase]}
        </VirraText>
        <View style={[styles.pill, { borderColor: pillColor(position) }]}>
          <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel}</VirraText>
        </View>
      </View>
      <VirraText variant="display" size={32} color={colors.pulse}>{formatDelta(delta)}</VirraText>
      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
        FROM YOUR FOLLICULAR BASELINE
      </VirraText>
      <View style={styles.bandWrap}>
        <CycleMiniBand phase={phase} delta={delta} personal={personal} />
        <View style={styles.bandAxis}>
          <VirraText variant="mono" size={9} color={colors.muted}>-1 kg</VirraText>
          <VirraText variant="mono" size={9} color={colors.muted}>+3 kg</VirraText>
        </View>
      </View>
      <VirraText variant="body" size={14} color={colors.breath}>{cycleCopyFor(position, phase)}</VirraText>
    </VirraCard>
  );
}

function renderSteadyBody({
  latestKg, baseline,
}: { latestKg: number | null; baseline: number | null }) {
  if (latestKg === null) return null;

  if (baseline === null) {
    return (
      <VirraCard>
        <View style={styles.row}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            WEIGHT · TODAY
          </VirraText>
          <View style={[styles.pill, { borderColor: colors.muted }]}>
            <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
          </View>
        </View>
        <VirraText variant="display" size={28} color={colors.breath}>{latestKg.toFixed(1)} kg</VirraText>
        <VirraText variant="body" size={13} color={colors.muted}>
          We need ~30 days of readings before the steady line becomes reliable.
        </VirraText>
      </VirraCard>
    );
  }

  const delta       = Math.round((latestKg - baseline) * 10) / 10;
  const position    = classifySteady(delta);
  const statusLabel = position === 'in_band' ? 'STEADY' : position === 'above' ? 'ABOVE LINE' : 'BELOW LINE';
  return (
    <VirraCard>
      <View style={styles.row}>
        <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
          WEIGHT · TODAY
        </VirraText>
        <View style={[styles.pill, { borderColor: pillColor(position) }]}>
          <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel}</VirraText>
        </View>
      </View>
      <VirraText variant="display" size={32} color={colors.pulse}>{formatDelta(delta)}</VirraText>
      <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
        FROM YOUR STEADY BASELINE
      </VirraText>
      <View style={styles.bandWrap}>
        <SteadyMiniBand delta={delta} />
        <View style={styles.bandAxis}>
          <VirraText variant="mono" size={9} color={colors.muted}>-1.5 kg</VirraText>
          <VirraText variant="mono" size={9} color={colors.muted}>+1.5 kg</VirraText>
        </View>
      </View>
      <VirraText variant="body" size={14} color={colors.breath}>{STEADY_COPY[position]}</VirraText>
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker:    { letterSpacing: 1.5 },
  pill:      { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  bandWrap:  { marginTop: spacing.xs, gap: 4 },
  bandAxis:  { flexDirection: 'row', justifyContent: 'space-between' },
});
