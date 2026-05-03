import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

interface VirraCardProps {
  children:  React.ReactNode;
  accent?:   boolean;
  style?:    ViewStyle;
}

export function VirraCard({ children, accent, style }: VirraCardProps) {
  return (
    <View style={[styles.card, accent && styles.accent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card:   { backgroundColor: colors.mist, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  accent: { borderColor: `${colors.pulse}40` },
});
