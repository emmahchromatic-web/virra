import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { colors, spacing } from '@/constants/theme';
import type { Verdict } from '@/lib/baselineCalibration';

interface Props {
  verdict: Verdict;
  onOpen: () => void;
  onDismiss: () => void;
}

export function FitnessUpdateCard({ verdict, onOpen, onDismiss }: Props) {
  const faster = verdict.direction === 'faster';
  const accent = faster ? colors.pulse : colors.dawn;
  const title = faster ? "You're getting faster" : "Let's recalibrate";
  const sub = faster
    ? "Your recent runs say your baseline's moved. Tap to see."
    : 'Your last few weeks suggest easing your targets so runs feel right. Tap to review.';

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open Fitness Update">
      <VirraCard style={[s.card, { borderColor: `${accent}55` }]}>
        <View style={s.row}>
          <SymbolView name={faster ? 'bolt.heart' : 'arrow.down.heart'} size={22} tintColor={accent} />
          <View style={s.text}>
            <VirraText variant="mono" size={11} color={accent} style={s.title}>{title}</VirraText>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={s.sub}>{sub}</VirraText>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss Fitness Update"
          >
            <SymbolView name="xmark" size={14} tintColor={colors.muted} />
          </Pressable>
        </View>
      </VirraCard>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card:  { borderWidth: 1.5 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text:  { flex: 1, gap: 2 },
  title: { letterSpacing: 1.5 },
  sub:   { lineHeight: 18 },
});
