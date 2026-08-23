import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { colors, spacing } from '@/constants/theme';
import type { Verdict } from '@/lib/baselineCalibration';

interface Props {
  visible:   boolean;
  verdict:   Verdict | null;
  onConfirm: () => void;
  onSnooze:  () => void;
}

function fmtPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function FitnessUpdateModal({ visible, verdict, onConfirm, onSnooze }: Props) {
  if (!visible || !verdict) return null;

  const faster = verdict.direction === 'faster';
  const accent  = faster ? colors.pulse : colors.dawn;

  const title   = faster ? "You're getting faster." : "Let's recalibrate.";
  const body    = faster
    ? `Your recent runs are consistently quicker than what your plan assumes. Here's where we'd land.`
    : `Your last few weeks have been tougher than your plan assumed. No problem. Let's bring your targets to where you are now so every run feels achievable.`;
  const cascade = verdict.wouldChangeUpcoming
    ? (faster ? "We'll refresh your upcoming sessions to match." : "We'll ease your upcoming sessions to match.")
    : "We'll use this for your next plan.";
  const confirmLabel = faster ? 'Update my baseline' : 'Update my targets';
  const dismissLabel = faster ? 'Not yet' : 'Keep as is';

  return (
    <VirraModal visible={visible} onClose={onSnooze} title="Fitness Update">
      <View style={s.body}>
        <VirraText variant="serif" size={22} color={colors.breath} style={s.title}>{title}</VirraText>
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={s.copy}>{body}</VirraText>

        <View style={s.paceRow}>
          <VirraText variant="display" size={32} color={colors.muted}>{fmtPace(verdict.current)}</VirraText>
          <VirraText variant="display" size={24} color={accent} style={s.arrow}>{'→'}</VirraText>
          <VirraText variant="display" size={32} color={accent}>{fmtPace(verdict.proposed)}</VirraText>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.unit}>/km</VirraText>
        </View>

        <VirraText variant="mono" size={11} color={colors.muted} style={s.cascade}>{cascade}</VirraText>

        <VirraButton label={confirmLabel} onPress={onConfirm} style={{ marginTop: spacing.lg }} />
        <VirraButton label={dismissLabel} onPress={onSnooze} variant="ghost" style={{ marginTop: spacing.sm }} />
      </View>
    </VirraModal>
  );
}

const s = StyleSheet.create({
  body:    { gap: spacing.sm },
  title:   { lineHeight: 28 },
  copy:    { lineHeight: 22 },
  paceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.md },
  arrow:   { marginHorizontal: spacing.xs },
  unit:    { marginLeft: 2 },
  cascade: { textAlign: 'center', letterSpacing: 1 },
});
