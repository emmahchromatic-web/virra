import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraModal } from '@/components/ui/VirraModal';
import {
  WORKOUT_PREFERENCE_OPTIONS,
  EQUIPMENT_PROMPT_TITLE,
  EQUIPMENT_PROMPT_BODY,
  EQUIPMENT_PROMPT_SKIP,
} from '@/lib/workoutPreference';
import type { WorkoutPreference } from '@/store/profile';

interface Props {
  visible: boolean;
  /** Called with the chosen preference, or null when the user skips. */
  onDone:  (pref: WorkoutPreference | null) => void;
}

/**
 * Card 246. Asked once, on the first visit to the training tab.
 *
 * Skipping is a real answer, not a failure to answer: it leaves the preference
 * unset and the enrolment screen then shows every variant, so the app never
 * silently picks the full-gym programme for someone training in a bedroom. The
 * body copy says the choice can be changed in the profile, because a prompt
 * that feels final is a prompt people guess at.
 */
export function EquipmentPreferenceModal({ visible, onDone }: Props) {
  return (
    <VirraModal visible={visible} onClose={() => onDone(null)} title={EQUIPMENT_PROMPT_TITLE}>
      <VirraText variant="body" size={14} color="rgba(244,237,224,0.6)" style={styles.body}>
        {EQUIPMENT_PROMPT_BODY}
      </VirraText>

      <View style={styles.options}>
        {WORKOUT_PREFERENCE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={styles.option}
            onPress={() => onDone(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={`${opt.label}. ${opt.sub}`}
          >
            <VirraText variant="mono" size={13} color={colors.breath}>{opt.label.toUpperCase()}</VirraText>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.45)">{opt.sub}</VirraText>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => onDone(null)}
        style={styles.skip}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={EQUIPMENT_PROMPT_SKIP}
      >
        <VirraText variant="mono" size={12} color={colors.muted}>{EQUIPMENT_PROMPT_SKIP.toUpperCase()}</VirraText>
      </Pressable>
    </VirraModal>
  );
}

const styles = StyleSheet.create({
  body:    { lineHeight: 20, marginBottom: spacing.md },
  options: { gap: spacing.sm },
  option:  {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.control,
  },
  skip:    { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
});
