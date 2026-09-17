import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { useSubscriptionStore } from '@/store/subscription';
import { PRO_FEATURES, paywallRoute, proCtaLabel, type ProFeature } from '@/lib/pro';

interface Props {
  feature:  ProFeature;
  /** Compact = a tile-sized card with no body copy; tapping it opens the paywall. */
  compact?: boolean;
  /** Extra line under the body, e.g. "your plan is saved". */
  note?:    string;
  /** Draw even when "Show Pro features" is off in Profile. ProScreen sets
   *  this: a route she has reached must say something. */
  always?:  boolean;
  style?:   StyleProp<ViewStyle>;
}

// Card 298. What a free user sees in place of a Pro feature. Never an empty
// state and never a dead control: the card says what the feature does and
// the one button goes to the paywall, which comes back here on Back.
export function ProLockedCard({ feature, compact, note, always, style }: Props) {
  const status = useSubscriptionStore((s) => s.status);
  const show   = useSubscriptionStore((s) => s.showProFeatures);
  const copy   = PRO_FEATURES[feature];
  const open   = () => router.push(paywallRoute(feature) as never);

  if (!show && !always) return null;

  if (compact) {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${copy.kicker}, part of Virra Pro`}
        style={style}
      >
        <VirraCard style={styles.compact}>
          <View style={styles.kickerRow}>
            <SymbolView name="lock.fill" size={11} tintColor={colors.pulse} />
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.kicker}>
              VIRRA PRO
            </VirraText>
          </View>
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>
            {copy.kicker}
          </VirraText>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            UNLOCK →
          </VirraText>
        </VirraCard>
      </Pressable>
    );
  }

  return (
    <VirraCard accent style={[styles.card, style]}>
      <View style={styles.kickerRow}>
        <SymbolView name="lock.fill" size={11} tintColor={colors.pulse} />
        <VirraText variant="mono" size={11} color={colors.pulse} style={styles.kicker}>
          VIRRA PRO
        </VirraText>
      </View>
      <VirraText variant="serif" size={17} color={colors.breath} style={styles.title}>
        {copy.kicker}
      </VirraText>
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.7)" style={styles.body}>
        {copy.body}
      </VirraText>
      {note && (
        <VirraText variant="body" size={12} color={colors.muted} style={styles.body}>
          {note}
        </VirraText>
      )}
      <VirraButton label={proCtaLabel(status)} onPress={open} style={styles.cta} />
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:      { gap: spacing.xs },
  compact:   { gap: 4, justifyContent: 'center' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker:    { letterSpacing: 1.5 },
  title:     { lineHeight: 24, marginTop: 2 },
  body:      { lineHeight: 19 },
  cta:       { marginTop: spacing.sm },
});
