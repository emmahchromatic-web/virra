import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export interface SwapTarget {
  id:            string;
  modality:      'run' | 'strength' | 'swim' | 'yoga' | 'other';
  session_label: string;
}

interface Props {
  visible:          boolean;
  targetDateLabel:  string;
  targets:          SwapTarget[];
  onSwap:           (id: string) => void;
  onAddAlongside:   () => void;
  onCancel:         () => void;
}

const MODALITY_COLOUR: Record<SwapTarget['modality'], string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};

export function SwapPickerSheet({ visible, targetDateLabel, targets, onSwap, onAddAlongside, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            WHAT DO YOU WANT TO DO?
          </VirraText>
          {targets.map((t) => (
            <Pressable
              key={t.id}
              style={styles.option}
              onPress={() => onSwap(t.id)}
              accessibilityRole="button"
            >
              <View style={[styles.swatch, { backgroundColor: MODALITY_COLOUR[t.modality] }]} />
              <VirraText variant="body" size={15} color={colors.breath}>
                Swap with {t.session_label}
              </VirraText>
            </Pressable>
          ))}
          <Pressable style={styles.option} onPress={onAddAlongside} accessibilityRole="button">
            <View style={styles.swatchEmpty} />
            <VirraText variant="body" size={15} color={colors.breath}>
              Add alongside {targetDateLabel}
            </VirraText>
          </Pressable>
          <Pressable style={[styles.option, styles.cancel]} onPress={onCancel} accessibilityRole="button">
            <VirraText variant="mono" size={12} color={colors.muted}>Cancel</VirraText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: colors.mist, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  kicker:      { letterSpacing: 1.5, marginBottom: spacing.xs },
  option:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  swatch:      { width: 12, height: 12, borderRadius: 3 },
  swatchEmpty: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  cancel:      { justifyContent: 'center', borderTopWidth: 0, paddingTop: spacing.sm },
});
