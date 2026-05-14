import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { getOfferings, purchasePackage, restorePurchases } from '@/lib/revenuecat';
import { useSubscriptionStore } from '@/store/subscription';
import { getPostAuthRoute } from '@/lib/permissionsConfig';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

const TERMS_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://virra.app/privacy';

const FEATURES = [
  'Cycle-adjusted training plans (5K → marathon)',
  'Nutrition targets that shift with your phase',
  'HealthKit sync — workouts import automatically',
  'Daily dashboard built for your cycle',
  'Education library by a qualified PT',
];

export default function PaywallScreen() {
  const { setStatus } = useSubscriptionStore();
  const [packages, setPackages]   = useState<PurchasesPackage[]>([]);
  const [selected, setSelected]   = useState<PurchasesPackage | null>(null);
  const [loading,  setLoading]    = useState(false);

  useEffect(() => {
    getOfferings().then((pkgs) => {
      setPackages(pkgs);
      setSelected(pkgs[0] ?? null);
    });
  }, []);

  async function routePostPaywall() {
    const route = await getPostAuthRoute();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.replace(route as any);
  }

  async function handlePurchase() {
    if (!selected) return;
    setLoading(true);
    const { success, error } = await purchasePackage(selected);
    setLoading(false);
    if (success) {
      setStatus('active');
      await routePostPaywall();
    } else {
      Alert.alert('Purchase failed', error ?? 'Please try again or restore purchases below.');
    }
  }

  async function handleRestore() {
    setLoading(true);
    const success = await restorePurchases();
    setLoading(false);
    if (success) {
      setStatus('active');
      await routePostPaywall();
    } else {
      Alert.alert('No active subscription found');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <VirraText variant="display" size={48} color={colors.pulse} style={styles.title}>
          Start your free trial
        </VirraText>
        <VirraText variant="serif" color={colors.breath} style={styles.sub}>
          14 days free. Cancel any time. No charge until your trial ends.
        </VirraText>

        <VirraCard style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <VirraText variant="mono" color={colors.pulse} size={12}>✓  </VirraText>
              <VirraText variant="body" color={colors.breath}>{f}</VirraText>
            </View>
          ))}
        </VirraCard>

        {packages.length > 0 && (
          <View style={styles.packages}>
            {packages.map((pkg) => (
              <Pressable key={pkg.identifier} onPress={() => setSelected(pkg)}>
                <VirraCard
                  accent={pkg === selected}
                  style={pkg === selected ? styles.pkgSelected : styles.pkg}
                >
                  <VirraText
                    variant="bodyMedium"
                    color={pkg === selected ? colors.pulse : colors.breath}
                  >
                    {pkg.product.title} — {pkg.product.priceString}
                  </VirraText>
                </VirraCard>
              </Pressable>
            ))}
          </View>
        )}

        <VirraButton
          label="Start 14-day free trial"
          onPress={handlePurchase}
          loading={loading}
          style={styles.cta}
        />

        <View style={styles.legal}>
          <VirraText variant="mono" size={11} color={colors.muted} style={styles.legalLabel}>
            SUBSCRIPTION TERMS
          </VirraText>
          <VirraText variant="body" size={11} color={colors.muted} style={styles.legalBody}>
            Virra Pro is an auto-renewing subscription
            {selected ? ` — ${selected.product.title} at ${selected.product.priceString}` : ''}.
            Payment is charged to your Apple ID account at the end of the 14-day free trial.
            The subscription renews automatically at the same price for the same period unless
            auto-renew is turned off at least 24 hours before the end of the current period.
            Your account is charged for renewal within 24 hours prior to the end of the current
            period. Manage or cancel at any time in Settings → [your name] → Subscriptions
            on this device. Any unused portion of the free trial is forfeited when you start a
            paid subscription.
          </VirraText>
          <View style={styles.legalLinks}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.legalLink}>
                TERMS OF SERVICE
              </VirraText>
            </Pressable>
            <VirraText variant="mono" size={10} color={colors.muted}>·</VirraText>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.legalLink}>
                PRIVACY POLICY
              </VirraText>
            </Pressable>
          </View>
        </View>

        <VirraButton
          label="Restore purchases"
          variant="ghost"
          onPress={handleRestore}
        />

        {(__DEV__ || process.env.EXPO_PUBLIC_INTERNAL_BUILD === 'true') && (
          <VirraButton
            label="[DEV] Skip paywall"
            variant="ghost"
            onPress={() => { setStatus('trial'); routePostPaywall(); }}
            style={{ marginTop: spacing.lg, opacity: 0.5 }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.mile },
  scroll:      { padding: spacing.lg, gap: spacing.md },
  title:       { marginTop: spacing.lg },
  sub:         { marginTop: spacing.sm, marginBottom: spacing.md },
  features:    { gap: spacing.sm },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start' },
  packages:    { gap: spacing.sm },
  pkg:         { paddingVertical: spacing.md },
  pkgSelected: { borderColor: colors.pulse },
  cta:         { marginTop: spacing.sm },
  legal: {
    marginVertical: spacing.sm,
    gap:            spacing.xs,
  },
  legalLabel:  { letterSpacing: 1.5 },
  legalBody:   { lineHeight: 16 },
  legalLinks:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xs },
  legalLink:   { letterSpacing: 1.5 },
});
