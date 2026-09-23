import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { getOfferings, purchasePackage, restorePurchases, getTrialEligibility } from '@/lib/revenuecat';
import { useSubscriptionStore } from '@/store/subscription';
import { getPostAuthRoute } from '@/lib/permissionsConfig';
import { PRO_FEATURES, PAYWALL_PRO_LIST, PAYWALL_FREE_LIST, isProFeature, trialEligible } from '@/lib/pro';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { VirraCard } from '@/components/ui/VirraCard';
import { InlineError } from '@/components/ui/InlineError';
import { NeedsSignal } from '@/components/ui/NeedsSignal';
import { trackPro } from '@/lib/proEvents';
import { SymbolView } from 'expo-symbols';

const TERMS_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://virra.app/privacy';

// Sells only what ships (cards 211 and 214), and since card 298 says what is
// free as well: the wall is a choice between two real things, not a gate.
// The lists live in pro.ts so the tiles, the paywall and the tests agree.

export default function PaywallScreen() {
  const { setStatus, status, devOverride } = useSubscriptionStore();
  // Card 298. Two ways in. From onboarding (no params) the way out is into
  // the app. From a locked tile inside the app (`from=app`) the way out is
  // Back, to the screen she was on, and the kicker names what she tapped.
  const params      = useLocalSearchParams<{ from?: string; feature?: string }>();
  const fromApp     = params.from === 'app';
  const featureCopy = isProFeature(params.feature) ? PRO_FEATURES[params.feature] : null;
  // Who may be promised a trial. Apple is the authority: the intro offer is
  // once per Apple ID per subscription group, so someone who trialled, let
  // it lapse, or even made a second Virra account is NOT eligible, whatever
  // our own records say. StoreKit's answer wins when it has one; our status
  // (lapsed = no trial) is the fallback while it is unknown.
  const [storeEligible, setStoreEligible] = useState<boolean | null>(null);
  // An internal "Preview as" pin outranks StoreKit: the point of the pin is
  // to look at a tier this Apple ID is not actually in.
  const canTrial    = devOverride
    ? trialEligible(status)
    : (storeEligible ?? trialEligible(status));
  const [packages, setPackages]   = useState<PurchasesPackage[]>([]);
  const [selected, setSelected]   = useState<PurchasesPackage | null>(null);
  const [loading,  setLoading]    = useState(false);
  // The initial offerings fetch, separate from `loading` (which is the
  // purchase/restore spinner). `offeringsFailed` distinguishes "the App
  // Store couldn't be reached" from "loaded fine, genuinely nothing to
  // sell" -- see getOfferings()'s doc comment. Card 284/J3c.
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [offeringsFailed,  setOfferingsFailed]  = useState(false);
  // Not appAlert. StoreKit puts its own view controller on screen for the
  // purchase sheet, and iOS will not present a modal from a controller that
  // already has one — so an alert fired the instant a purchase fails lands
  // while the system sheet is still being torn down and is silently dropped.
  // Observed 26 Aug: cancelling the Apple sign-in cleared the spinner and
  // showed the user nothing at all. On the one screen that takes money, a
  // dead button is the worst possible failure. Card 215's InlineError instead.
  const [failure,  setFailure]    = useState<{ title: string; message?: string } | null>(null);

  // Card 298 measurement: which surface sent her here, and what she did next.
  const evt = { feature: isProFeature(params.feature) ? params.feature : null, source: fromApp ? 'app' as const : 'onboarding' as const };
  useEffect(() => { trackPro('paywall_open', evt); /* once per visit */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOfferings() {
    setOfferingsLoading(true);
    setOfferingsFailed(false);
    const { packages: pkgs, failed } = await getOfferings();
    setOfferingsLoading(false);
    setOfferingsFailed(failed);
    setPackages(pkgs);
    setSelected(pkgs[0] ?? null);
    if (pkgs.length > 0) {
      getTrialEligibility(pkgs.map((p) => p.product.identifier)).then(setStoreEligible);
    }
  }

  useEffect(() => { loadOfferings(); }, []);

  async function routePostPaywall() {
    if (fromApp && router.canGoBack()) { router.back(); return; }
    const route = await getPostAuthRoute();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.replace(route as any);
  }

  // The free tier is the default, not a consolation: she keeps everything she
  // can log, and meets Pro again where it prescribes something.
  async function handleContinueFree() {
    trackPro(fromApp ? 'paywall_close' : 'continue_free', evt);
    if (!fromApp) setStatus('free');
    await routePostPaywall();
  }

  async function handlePurchase() {
    if (!selected) {
      // Belt-and-braces: the CTA is `disabled` whenever `selected` is null,
      // so a real tap cannot reach here -- but if that ever changes, this
      // must never be a silent no-op on the one screen that takes money.
      setFailure({
        title:   'Nothing to subscribe to yet',
        message: 'We couldn\'t load your plan options. Check your connection, then try again.',
      });
      return;
    }
    setLoading(true);
    setFailure(null);
    const productId = selected.product.identifier;
    trackPro('purchase_start', { ...evt, productId });
    const { success, cancelled, error } = await purchasePackage(selected);
    setLoading(false);
    trackPro(success ? 'purchase_success' : cancelled ? 'purchase_cancel' : 'purchase_fail', { ...evt, productId });
    if (success) {
      setStatus('active');
      await routePostPaywall();
    } else if (!cancelled) {
      setFailure({
        title:   'Purchase failed',
        message: 'We could not complete that with the App Store. Try again, or '
               + 'restore purchases below if you have subscribed before.',
      });
      if (error) console.error('[paywall] purchase failed:', error);
    }
  }

  async function handleRestore() {
    setLoading(true);
    setFailure(null);
    const success = await restorePurchases();
    setLoading(false);
    trackPro(success ? 'restore_success' : 'restore_none', evt);
    if (success) {
      setStatus('active');
      await routePostPaywall();
    } else {
      setFailure({
        title:   'No active subscription found',
        message: 'Nothing to restore on this Apple Account. Start a trial above.',
      });
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* A way out at the top, not only "Not now" three screens down.
            Same action as the ghost button at the bottom. */}
        <Pressable
          onPress={handleContinueFree}
          style={styles.close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={fromApp ? 'Close' : 'Continue with the free version'}
        >
          <SymbolView name="xmark" size={18} tintColor={colors.muted} />
        </Pressable>
        {featureCopy && (
          <VirraText variant="mono" size={11} color={colors.pulse} style={styles.kicker}>
            {featureCopy.kicker.toUpperCase()} · PART OF VIRRA PRO
          </VirraText>
        )}
        <VirraText variant="display" size={48} color={colors.pulse} style={featureCopy ? undefined : styles.title}>
          {canTrial ? 'Start your free trial' : 'Come back to Virra Pro'}
        </VirraText>
        <VirraText variant="serif" color={colors.breath} style={styles.sub}>
          {canTrial
            ? '14 days free. Cancel any time. No charge until your trial ends.'
            : 'Your plans and your history are still here. Pick up where you left off.'}
        </VirraText>

        <VirraCard accent style={styles.features}>
          <VirraText variant="mono" size={11} color={colors.pulse} style={styles.listKicker}>
            VIRRA PRO
          </VirraText>
          {PAYWALL_PRO_LIST.map((f) => (
            <View key={f} style={styles.featureRow}>
              <VirraText variant="mono" color={colors.pulse} size={12}>✓</VirraText>
              <VirraText variant="body" color={colors.breath} style={styles.featureLabel}>{f}</VirraText>
            </View>
          ))}
        </VirraCard>

        <VirraCard style={styles.features}>
          <VirraText variant="mono" size={11} color={colors.muted} style={styles.listKicker}>
            FREE, ALWAYS
          </VirraText>
          {PAYWALL_FREE_LIST.map((f) => (
            <View key={f} style={styles.featureRow}>
              <VirraText variant="mono" color={colors.muted} size={12}>✓</VirraText>
              <VirraText variant="body" color={colors.breath} style={styles.featureLabel}>{f}</VirraText>
            </View>
          ))}
        </VirraCard>

        {offeringsLoading ? (
          <ActivityIndicator color={colors.pulse} style={styles.offeringsLoading} />
        ) : packages.length > 0 ? (
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
                    {pkg.product.title} · {pkg.product.priceString}
                  </VirraText>
                </VirraCard>
              </Pressable>
            ))}
          </View>
        ) : (
          <NeedsSignal
            title={offeringsFailed ? "Couldn't load your options" : 'No plans available right now'}
            detail={offeringsFailed
              ? 'We couldn\'t reach the App Store to load your plan options. Check your connection and try again.'
              : 'Something\'s not quite right on our end — we\'re on it. Try again in a bit.'}
            onRetry={loadOfferings}
          />
        )}

        {failure && (
          <InlineError
            title={failure.title}
            message={failure.message}
            onDismiss={() => setFailure(null)}
          />
        )}

        <VirraButton
          label={canTrial ? 'Start 14-day free trial' : 'Subscribe to Virra Pro'}
          onPress={handlePurchase}
          loading={loading}
          disabled={!selected}
          style={styles.cta}
        />

        <View style={styles.legal}>
          <VirraText variant="mono" size={11} color={colors.muted} style={styles.legalLabel}>
            SUBSCRIPTION TERMS
          </VirraText>
          <VirraText variant="body" size={11} color={colors.muted} style={styles.legalBody}>
            Virra Pro is an auto-renewing subscription
            {selected ? ` (${selected.product.title} at ${selected.product.priceString})` : ''}.
            {canTrial
              ? ' Payment is charged to your Apple ID account at the end of the 14-day free trial. '
              : ' Payment is charged to your Apple ID account at confirmation of purchase. '}
            The subscription renews automatically at the same price for the same period unless
            auto-renew is turned off at least 24 hours before the end of the current period.
            Your account is charged for renewal within 24 hours prior to the end of the current
            period. Manage or cancel at any time in Settings → [your name] → Subscriptions
            on this device.
            {canTrial ? ' Any unused portion of the free trial is forfeited when you start a paid subscription.' : ''}
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

        <VirraButton
          label={fromApp ? 'Not now' : 'Continue with the free version'}
          variant="ghost"
          onPress={handleContinueFree}
        />

        {(__DEV__ || process.env.EXPO_PUBLIC_INTERNAL_BUILD === 'true') && (
          <VirraButton
            label="Skip (internal build)"
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
  title:       { marginTop: spacing.xs },
  kicker:      { letterSpacing: 1.5, marginTop: spacing.xs },
  close:       { alignSelf: 'flex-end', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sub:         { marginTop: spacing.sm, marginBottom: spacing.md },
  features:    { gap: spacing.md },
  listKicker:  { letterSpacing: 1.5, marginBottom: -spacing.xs },
  // The gutter after the tick was two hardcoded spaces inside the Text, which
  // is not a layout: a bullet long enough to wrap put its second line flush
  // under the tick instead of aligned with the first. A real gap plus a
  // flexing label keeps every line aligned however the copy grows.
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  featureLabel:{ flex: 1 },
  offeringsLoading: { marginVertical: spacing.md },
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
