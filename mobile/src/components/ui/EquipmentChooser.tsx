import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { WORKOUT_PREFERENCE_OPTIONS } from '@/lib/workoutPreference';
import type { WorkoutPreference } from '@/store/profile';

/**
 * "Where are you training?", asked at the moment the answer changes what you
 * get.
 *
 * Lifted out of the plan screen for card 261, where the same question had to
 * appear on the workout screen too. Two copies of a question this consequential
 * would drift, and the wording is the part doing the work: it says the
 * programme comes in three versions and that the choice is changeable, so
 * answering does not feel like a commitment.
 *
 * Card 246 established why this is asked rather than assumed: `gym_full` was a
 * column default nobody had chosen, and it silently enrolled someone training
 * at home with dumbbells onto the full-gym variant of a programme. A worse
 * first session than no programme at all.
 */
export function EquipmentChooser({
  onPick,
  intro,
}: {
  onPick: (value: WorkoutPreference) => void;
  /** Override for screens where "we will use it from here on" is not accurate. */
  intro?: string;
}) {
  return (
    <VirraCard style={s.card}>
      <VirraText variant="mono" size={11} color={colors.pulse} style={s.label}>
        WHERE ARE YOU TRAINING?
      </VirraText>
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={s.sub}>
        {intro ??
          'This programme comes in three versions. Pick the one that matches your kit and we will use it from here on. You can change it in your profile at any time.'}
      </VirraText>
      {WORKOUT_PREFERENCE_OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          style={s.option}
          onPress={() => onPick(opt.value)}
          accessibilityRole="button"
          accessibilityLabel={`${opt.label}. ${opt.sub}`}
        >
          <VirraText variant="mono" size={13} color={colors.breath}>{opt.label.toUpperCase()}</VirraText>
          <VirraText variant="body" size={12} color="rgba(244,237,224,0.45)">{opt.sub}</VirraText>
        </Pressable>
      ))}
    </VirraCard>
  );
}

const s = StyleSheet.create({
  card:   { gap: spacing.sm },
  label:  { letterSpacing: 2 },
  sub:    { lineHeight: 19 },
  option: { gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.control },
});
