import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

/**
 * In-tree error message, for anywhere that cannot safely open a dialog.
 *
 * appAlert() draws in a native RN Modal, and iOS will not present a modal from
 * a view controller that already has one on screen. Any component that is
 * itself shown in a VirraModal (or lives inside a modal screen) therefore
 * cannot report failure with appAlert: the dialog either never appears or
 * renders non-interactive and eats the next touch, which is what froze
 * "describe a meal" in build 10.
 *
 * Originally written inline in describe-meal.tsx as part of that fix, and
 * lifted here when Paul's audit (card 215) found four more components with the
 * same shape. One implementation rather than five copies.
 */
export function InlineError({ title, message, onDismiss }: {
  title:     string;
  message?:  string;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <VirraText variant="mono" size={10} color={colors.heat} style={styles.label}>
          {title.toUpperCase()}
        </VirraText>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
          <SymbolView name="xmark" size={13} tintColor={colors.muted} />
        </Pressable>
      </View>
      {message ? (
        <VirraText variant="body" size={13} color={colors.breath}>{message}</VirraText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card:   { backgroundColor: colors.mist, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.heat, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:  { letterSpacing: 1.5 },
});
