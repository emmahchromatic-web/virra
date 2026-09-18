import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { InlineError } from './InlineError';
import { colors, spacing, radius } from '@/constants/theme';
import type { RealignmentPrompt, RealignmentOption } from '@/lib/runProgramme/realignment';

interface Props {
  visible: boolean;
  prompt:  RealignmentPrompt | null;
  busy?:   boolean;
  /** What the chosen action did, shown in place of the options. */
  outcome?: string | null;
  /** Why the chosen action failed. Nothing was changed. */
  error?:   string | null;
  onChoose: (option: RealignmentOption) => void;
  onDismiss: () => void;
  /** Closes the prompt after an outcome has been read. */
  onDone:    () => void;
  onClearError: () => void;
}

/**
 * What the app says when someone has missed training.
 *
 * Every option shows its consequence underneath it, because a choice you cannot
 * see the result of is not a choice. The risky one is offered rather than
 * hidden — the runner is allowed to decide — but it is marked, and it says why.
 *
 * No progress bars, no streak language, nothing that implies they have failed
 * at something. They missed some runs.
 */
export function RealignmentModal({
  visible, prompt, busy, outcome, error, onChoose, onDismiss, onDone, onClearError,
}: Props) {
  if (!visible || !prompt) return null;

  // The result is reported here, inside the prompt, never with appAlert. An
  // alert opened as this modal closes is presented from a view controller that
  // already has one on screen, so iOS draws nothing and the invisible dialog
  // eats every touch after it: the Dashboard froze on the simulator, 18 Sep.
  // Same rule as card 215 and InlineError.
  if (outcome) {
    return (
      <VirraModal visible={visible} onClose={onDone} title="Picking this back up">
        <View style={s.body}>
          <VirraText variant="serif" size={21} color={colors.breath} style={s.headline}>
            {outcome}
          </VirraText>
          <VirraButton label="Done" onPress={onDone} />
        </View>
      </VirraModal>
    );
  }

  return (
    <VirraModal visible={visible} onClose={onDismiss} title="Picking this back up">
      <View style={s.body}>
        <VirraText variant="serif" size={21} color={colors.breath} style={s.headline}>
          {prompt.headline}
        </VirraText>

        {error ? (
          <InlineError title="Could not update your plan" message={error} onDismiss={onClearError} />
        ) : null}

        <View style={s.options}>
          {prompt.options.map((option) => (
            <Pressable
              key={option.action}
              onPress={() => !busy && onChoose(option)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}. ${option.consequence}`}
              style={({ pressed }) => [
                s.option,
                option.risky && s.optionRisky,
                pressed && !busy && s.optionPressed,
                busy && s.optionBusy,
              ]}
            >
              <VirraText
                variant="bodyMedium"
                size={15}
                color={option.risky ? colors.dawn : colors.breath}
              >
                {option.label}
              </VirraText>
              <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={s.consequence}>
                {option.consequence}
              </VirraText>
            </Pressable>
          ))}
        </View>

        <VirraButton label="Not now" onPress={onDismiss} variant="ghost" disabled={busy} />
      </View>
    </VirraModal>
  );
}

const s = StyleSheet.create({
  body:        { gap: spacing.md },
  headline:    { lineHeight: 28 },
  options:     { gap: spacing.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  optionRisky:   { borderColor: 'rgba(255,107,61,0.5)' },
  optionPressed: { backgroundColor: colors.mist },
  optionBusy:    { opacity: 0.5 },
  consequence:   { lineHeight: 19 },
});
