import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';

type Variant = 'primary' | 'secondary' | 'ghost';

interface VirraButtonProps {
  label:     string;
  onPress:   () => void;
  variant?:  Variant;
  disabled?: boolean;
  loading?:  boolean;
  style?:    StyleProp<ViewStyle>;
}

const variantStyle: Record<Variant, ViewStyle> = {
  primary:   { backgroundColor: colors.pulse },
  secondary: { backgroundColor: colors.mist, borderWidth: 1, borderColor: colors.border },
  ghost:     { backgroundColor: 'transparent' },
};

const labelColor: Record<Variant, string> = {
  primary:   colors.mile,
  secondary: colors.breath,
  ghost:     colors.breath,
};

export function VirraButton({ label, onPress, variant = 'primary', disabled, loading, style }: VirraButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variantStyle[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading
        ? <ActivityIndicator color={labelColor[variant]} size="small" />
        : <VirraText variant="mono" color={labelColor[variant]}>{label}</VirraText>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base:     { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  pressed:  { opacity: 0.82 },
});
