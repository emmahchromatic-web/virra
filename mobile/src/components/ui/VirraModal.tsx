import React from 'react';
import { View, Modal, Pressable, ScrollView, StyleSheet, StyleProp, ViewStyle, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface Props {
  visible:     boolean;
  onClose:     () => void;
  title?:      string;
  children:    React.ReactNode;
  style?:      StyleProp<ViewStyle>;
}

export function VirraModal({ visible, onClose, title, children, style }: Props) {
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BlurView intensity={50} tint="dark" style={styles.backdrop}>
        <Pressable style={[StyleSheet.absoluteFill, { zIndex: 0 }]} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          {/* Cap the card to the viewport so tall content scrolls internally
              rather than overflowing off-screen (the centred card would push
              its top under the status bar with no way to reach it). */}
          <View style={[styles.card, { maxHeight: height * 0.85 }, style]}>
            {title && (
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.title}>
                {title.toUpperCase()}
              </VirraText>
            )}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              bounces={false}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:              1,
    alignItems:        'stretch',  // children fill horizontally
    justifyContent:    'center',
    // Pages pad cards by spacing.lg (24pt). Modals sit 2pt further inset on
    // each side — 4pt narrower than the standard card overall — so the
    // hierarchy reads as distinct without losing meaningful content width.
    paddingHorizontal: spacing.lg + 2,
    position:          'relative',
  },
  // KeyboardAvoidingView has no intrinsic width on iOS, so it collapses to
  // its content unless we stretch it. Without this, the card sized to its
  // text content instead of filling the backdrop's inset.
  kav: {
    alignSelf: 'stretch',
  },
  card: {
    backgroundColor: colors.mist,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    // Match standard VirraCard inner padding so modal content has the same
    // breathing room as page cards.
    padding:         spacing.md,
    gap:             spacing.md,
    zIndex:          1,
  },
  // flexShrink lets the scroll view collapse to fit the card's maxHeight,
  // which is what makes it scrollable when content overflows.
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.md,
  },
  title: {
    letterSpacing: 1.5,
  },
});
