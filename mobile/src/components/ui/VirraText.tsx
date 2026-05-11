import React from 'react';
import { Text, TextStyle } from 'react-native';
import { colors, fonts } from '@/constants/theme';

type Variant = 'display' | 'serif' | 'body' | 'bodyMedium' | 'mono' | 'label';

interface VirraTextProps {
  variant?:      Variant;
  color?:        string;
  size?:         number;
  uppercase?:    boolean;
  numberOfLines?: number;
  style?:        TextStyle | TextStyle[];
  children:      React.ReactNode;
}

const variantStyles: Record<Variant, TextStyle> = {
  display:    { fontFamily: fonts.display,    fontSize: 32, letterSpacing: -0.5, textTransform: 'uppercase' },
  serif:      { fontFamily: fonts.serif,      fontSize: 18, fontStyle: 'italic' },
  body:       { fontFamily: fonts.body,       fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  mono:       { fontFamily: fonts.mono,       fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  label:      { fontFamily: fonts.mono,       fontSize: 9,  letterSpacing: 1.5, textTransform: 'uppercase' },
};

export function VirraText({ variant = 'body', color, size, uppercase, numberOfLines, style, children }: VirraTextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        variantStyles[variant],
        { color: color ?? colors.breath },
        size ? { fontSize: size } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
