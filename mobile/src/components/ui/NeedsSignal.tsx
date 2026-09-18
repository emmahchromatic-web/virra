import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { VirraButton } from './VirraButton';

/**
 * What a screen shows when a read fails, in place of its empty state. Card 295.
 *
 * With no signal the Training tab said "You don't have an active plan yet" and
 * Browse said "No plans available yet": a failed request read as a fact about
 * the user. The offline-first spec (card 284) names this state NeedsSignal:
 * say the app could not reach the server, offer a retry, never a blank and
 * never a false empty.
 */
export function NeedsSignal({ title, detail, onRetry, retrying = false }: {
  title:     string;
  detail?:   string;
  onRetry:   () => void;
  retrying?: boolean;
}) {
  return (
    <VirraCard style={styles.card}>
      <View style={styles.header}>
        <SymbolView name="wifi.slash" size={14} tintColor={colors.muted} />
        <VirraText variant="mono" size={11} color={colors.muted} style={styles.kicker}>NO SIGNAL</VirraText>
      </View>
      <VirraText variant="serif" size={17} color={colors.breath} style={styles.title}>{title}</VirraText>
      {detail ? (
        <VirraText variant="body" size={13} color="rgba(244,237,224,0.6)" style={styles.detail}>{detail}</VirraText>
      ) : null}
      <VirraButton label="Try again" variant="ghost" onPress={onRetry} loading={retrying} />
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:   { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kicker: { letterSpacing: 1.5 },
  title:  { lineHeight: 26 },
  detail: { lineHeight: 19 },
});
