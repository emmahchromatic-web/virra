import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { formatRest } from '@/lib/restTimer';

interface Props {
  exerciseName:     string;
  remainingSeconds: number;
  /** 0 to 1, drives the fill that drains as the rest runs down. */
  progress:         number;
  done:             boolean;
  onSkip:           () => void;
  onRestart:        () => void;
}

/**
 * Rest countdown pinned above the set list. Sits over the scroll view so it
 * stays put while the user scrolls ahead to the next exercise.
 */
export function RestTimerBar({ exerciseName, remainingSeconds, progress, done, onSkip, onRestart }: Props) {
  return (
    <View style={s.wrap} accessibilityRole="timer" accessibilityLabel={done ? 'Rest complete' : `Resting, ${formatRest(remainingSeconds)} remaining`}>
      <View style={[s.fill, { width: `${Math.round((1 - progress) * 100)}%` }, done && s.fillDone]} />

      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <VirraText variant="mono" size={10} color={done ? colors.pulse : colors.dawn} style={{ letterSpacing: 1.5 }}>
            {done ? 'REST COMPLETE' : 'RESTING'}
          </VirraText>
          <VirraText variant="mono" size={11} color={colors.muted} numberOfLines={1}>
            {exerciseName}
          </VirraText>
        </View>

        <VirraText variant="display" size={26} color={colors.breath} style={s.clock}>
          {formatRest(remainingSeconds)}
        </VirraText>

        <Pressable onPress={onRestart} hitSlop={10} style={s.action} accessibilityRole="button" accessibilityLabel="Restart rest">
          <SymbolView name="arrow.counterclockwise" size={17} tintColor={colors.muted} />
        </Pressable>
        <Pressable onPress={onSkip} hitSlop={10} style={s.skip} accessibilityRole="button" accessibilityLabel={done ? 'Dismiss rest timer' : 'Skip rest'}>
          <VirraText variant="display" size={12} color={colors.mile} style={{ letterSpacing: 1.5 }}>
            {done ? 'DONE' : 'SKIP'}
          </VirraText>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal:  spacing.lg,
    marginBottom:      spacing.sm,
    borderRadius:      radius.sm,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.mist,
    overflow:          'hidden',
  },
  fill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255,46,126,0.16)',
  },
  fillDone: { backgroundColor: 'rgba(255,46,126,0.28)' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  clock:  { minWidth: 62, textAlign: 'right' },
  action: { width: 34, alignItems: 'center', justifyContent: 'center' },
  skip: {
    backgroundColor: colors.pulse, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
});
