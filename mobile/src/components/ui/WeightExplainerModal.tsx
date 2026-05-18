import React from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export type WeightExplainerMode = 'cycle' | 'steady';

interface Props {
  visible:   boolean;
  mode:      WeightExplainerMode;
  onDismiss: () => void;
}

const COPY: Record<WeightExplainerMode, { editorial: string; body: string }> = {
  cycle: {
    editorial:
      'Your weight rises and falls with your cycle. We track the shape of that, so you can see what\'s water, what\'s normal, and when something is actually worth noticing.',
    body:
      'No goal weight. No streaks. No daily prompt.\n' +
      'Calibrating — we need ~3 cycles of readings before insights are reliable.',
  },
  steady: {
    editorial:
      'Your weight bounces day-to-day from water, food timing, and hydration. We track the trend, not the day-to-day — so you can see what\'s noise and what\'s real.',
    body:
      'No goal weight. No streaks. No daily prompt.\n' +
      'Calibrating — we need ~30 days of readings before the steady line becomes reliable.',
  },
};

export function WeightExplainerModal({ visible, mode, onDismiss }: Props) {
  const copy = COPY[mode];
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.kicker}>
            THIS ISN'T A WEIGHT LOSS FEATURE
          </VirraText>
          <VirraText variant="serif" size={18} color={colors.breath} style={styles.editorial}>
            {copy.editorial}
          </VirraText>
          <VirraText variant="body" size={13} color={colors.muted} style={styles.body}>
            {copy.body}
          </VirraText>
          <Pressable style={styles.button} onPress={onDismiss} accessibilityRole="button">
            <VirraText variant="mono" size={12} color={colors.mile}>Got it</VirraText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card:     { backgroundColor: colors.mist, borderRadius: radius.md, borderWidth: 1, borderColor: colors.pulse, padding: spacing.lg, gap: spacing.sm, width: '100%', maxWidth: 380 },
  kicker:   { letterSpacing: 1.5 },
  editorial:{ fontStyle: 'italic' },
  body:     { lineHeight: 20 },
  button:   { marginTop: spacing.md, backgroundColor: colors.pulse, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center' },
});
