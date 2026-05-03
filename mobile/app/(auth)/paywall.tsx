import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { getOfferings, purchasePackage, restorePurchases } from '@/lib/revenuecat';
import { useSubscriptionStore } from '@/store/subscription';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';

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

  async function handlePurchase() {
    if (!selected) return;
    setLoading(true);
    const success = await purchasePackage(selected);
    setLoading(false);
    if (success) {
      setStatus('active');
      router.replace('/(app)');
    } else {
      Alert.alert('Purchase failed', 'Please try again or restore purchases below.');
    }
  }

  async function handleRestore() {
    setLoading(true);
    const success = await restorePurchases();
    setLoading(false);
    if (success) {
      setStatus('active');
      router.replace('/(app)');
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

        <VirraText variant="label" color={colors.muted} style={styles.legal}>
          Subscription auto-renews. Cancel at any time in Settings before trial ends.
        </VirraText>

        <VirraButton
          label="Restore purchases"
          variant="ghost"
          onPress={handleRestore}
        />
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
  legal:       { textAlign: 'center', marginVertical: spacing.sm },
});
