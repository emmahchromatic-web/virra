import React from 'react';
import { StyleSheet, StyleProp, TextStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  children: string;
  /** primary = pulse (default — card / section headers).
   *  muted   = subdued grey (paired with a status pill, or row-level labels). */
  tone?:    'primary' | 'muted';
  /** Override the default color (e.g. phase-tinted section headers on
   *  Insights). When set, takes precedence over `tone`. */
  color?:   string;
  style?:   StyleProp<TextStyle>;
}

// Canonical small-uppercase mono kicker used at the top of every card and
// above every section across the app. Default styling: size 11, color pulse,
// letterSpacing 1.5. Use tone="muted" for sub-labels (e.g. those paired with
// a status pill inside the same card, where the pill is the visual anchor).
export function SectionLabel({ children, tone = 'primary', color, style }: Props) {
  const resolved = color ?? (tone === 'primary' ? colors.pulse : colors.muted);
  return (
    <VirraText
      variant="mono"
      size={11}
      color={resolved}
      style={StyleSheet.flatten([{ letterSpacing: 1.5 }, style]) as TextStyle}
    >
      {children.toUpperCase()}
    </VirraText>
  );
}
