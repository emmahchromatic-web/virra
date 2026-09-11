import React from 'react';
import { Switch, type SwitchProps } from 'react-native';
import { colors } from '@/constants/theme';

/**
 * The app's switch, with one styling rather than three.
 *
 * Build 14 regression pass: toggling a setting turned the white thumb green, so
 * a switch that was ON showed a green thumb on a green track and stopped
 * reading as a control at all. Two of the three switches in the app did that
 * (settings, onboarding body-metrics); the profile one did not, which is why it
 * looked like a bug on some screens and not others.
 *
 * The thumb is the part that MOVES, so it keeps the constant colour and the
 * track carries the state. Colouring both green leaves nothing to see.
 *
 * One component so the next switch cannot invent a fourth styling.
 */
export function VirraSwitch(props: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>) {
  return (
    <Switch
      {...props}
      trackColor={{ false: colors.border, true: colors.pulse }}
      thumbColor={colors.breath}
      ios_backgroundColor={colors.border}
    />
  );
}
