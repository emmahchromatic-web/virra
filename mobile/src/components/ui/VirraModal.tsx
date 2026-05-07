import React from 'react';
import { View, Modal, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface Props {
  visible:     boolean;
  onClose:     () => void;
  title?:      string;
  children:    React.ReactNode;
  style?:      ViewStyle;
}

export function VirraModal({ visible, onClose, title, children, style }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BlurView intensity={50} tint="dark" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, style]}>
          {title && (
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.title}>
              {title.toUpperCase()}
            </VirraText>
          )}
          {children}
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width:           '100%',
    backgroundColor: colors.mist,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.md,
    zIndex:          1,
  },
  title: {
    letterSpacing: 1.5,
  },
});
