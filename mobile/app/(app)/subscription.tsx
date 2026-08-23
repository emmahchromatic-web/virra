import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, SafeAreaView, Pressable, Linking, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSubscriptionStore } from '@/store/subscription';
import { getEntitlementInfo, restorePurchases } from '@/lib/revenuecat';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';
import { appAlert } from '@/components/ui/VirraAlert';

const STATUS_COLOR: Record<string, string> = {
  trial:     colors.dawn,
  active:    colors.pulse,
  expired:   colors.heat,
  cancelled: colors.heat,
};

const STATUS_LABEL: Record<string, string> = {
  trial:     'FREE TRIAL',
  active:    'ACTIVE',
  expired:   'EXPIRED',
  cancelled: 'CANCELLED',
  unknown:   '—',
};

export default function SubscriptionScreen() {
  const { status, trialEnd, setStatus } = useSubscriptionStore();
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [restoring, setRestoring]         = useState(false);

  useEffect(() => {
    getEntitlementInfo()
      .then((info) => setManagementURL(info.managementURL))
      .finally(() => setLoading(false));
  }, []);

  const daysRemaining = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000))
    : null;

  async function handleManage() {
    const url = managementURL ?? 'https://apps.apple.com/account/subscriptions';
    try {
      await Linking.openURL(url);
    } catch {
      appAlert('Could not open link', 'Please visit Settings → Subscriptions to manage your plan.');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        setStatus('active');
        appAlert('Purchases restored', 'Your subscription has been restored.');
      } else {
        appAlert('Nothing to restore', 'No previous subscription found for this Apple ID.');
      }
    } catch (e: any) {
      appAlert('Restore failed', e?.message ?? 'An error occurred.');
    } finally {
      setRestoring(false);
    }
  }

  const badgeColor = STATUS_COLOR[status] ?? colors.muted;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Subscription</VirraText>
        <View style={{ width: 18 }} />
      </View>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      <VirraCard style={styles.card}>
        <VirraText variant="mono" size={11} color={colors.muted} style={styles.sectionLabel}>
          PLAN STATUS
        </VirraText>

        {loading ? (
          <ActivityIndicator color={colors.pulse} style={{ marginVertical: spacing.sm }} />
        ) : (
          <>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { borderColor: badgeColor }]}>
                <VirraText variant="mono" size={13} color={badgeColor}>
                  {STATUS_LABEL[status] ?? status.toUpperCase()}
                </VirraText>
              </View>
            </View>

            {status === 'trial' && daysRemaining !== null && (
              <VirraText variant="body" size={14} color={colors.breath} style={{ marginTop: spacing.xs }}>
                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining in your free trial
              </VirraText>
            )}

            {status === 'trial' && (
              <VirraButton
                label="Upgrade to Virra Pro"
                onPress={() => router.push('/(auth)/paywall')}
                style={{ marginTop: spacing.md }}
              />
            )}
          </>
        )}
      </VirraCard>

      <VirraCard style={styles.card}>
        <Pressable style={styles.linkRow} onPress={handleManage} disabled={loading}>
          <VirraText variant="body" size={15} color={colors.breath}>Manage Subscription</VirraText>
          <SymbolView name="arrow.up.right" size={14} tintColor={colors.muted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={handleRestore} disabled={restoring}>
          <VirraText variant="body" size={15} color={restoring ? colors.muted : colors.breath}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </VirraText>
          {restoring && <ActivityIndicator size="small" color={colors.muted} />}
        </Pressable>
      </VirraCard>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  scroll:       { flex: 1 },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header:       { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  backBtn:      { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  title:        { marginBottom: spacing.sm },
  card:         { gap: spacing.xs },
  sectionLabel: { letterSpacing: 1.5, marginBottom: spacing.xs },
  badgeRow:     { flexDirection: 'row', marginTop: spacing.xs },
  badge:        {
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  linkRow:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider:  { height: 1, backgroundColor: colors.border },
});
