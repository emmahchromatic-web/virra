# Apple App Store Review Guideline Section 3 — Business — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#business (fetched live)
**Reviewer:** Claude Code

---

## Executive Summary

Section 3 is where subscription apps most often get rejected, and Virra has one **P0 blocker** here that is not yet on any other review list: the paywall is missing the full **Schedule 2 / 3.1.2(c) subscription disclosures** that Apple requires *before* the purchase confirmation. The current disclosure is a single line ("Subscription auto-renews. Cancel at any time in Settings before trial ends.") — it does not state the subscription title, the per-period length and price, the iTunes-account charge timing, the 24-hour-before-renewal window, the management-via-Account-Settings path, or the free-trial-forfeit rule. It also does not link Terms of Service or Privacy Policy from the paywall surface, which Apple requires for any auto-renewable subscription. Aside from that and the `DEV Skip paywall` button (correctly gated by `__DEV__`, but must be verified absent from the production binary), Virra's posture is clean: StoreKit-mediated IAP via RevenueCat, Restore Purchases present, subscription management routed through Apple's official URLs, no external purchase links, no crypto, no loans, no rate-to-unlock gates.

---

## Sub-clause × Virra Compliance Matrix

### 3.1.1 In-App Purchase (general)

**Quote (verbatim):**
> If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc. … you should make sure you have a restore mechanism for any restorable in-app purchases.

**Virra status:** ✅ Compliant

**Evidence:**
- All paid functionality is gated by RevenueCat's `purchasePackage()` (`mobile/app/(auth)/paywall.tsx` line 43), which wraps Apple's StoreKit. No alternate unlock mechanism exists in the codebase.
- Restore Purchases is present in both the paywall (`paywall.tsx` lines 53–63, 115–119) and the post-purchase subscription screen (`mobile/app/(app)/subscription.tsx` lines 54–69).
- No license keys, no QR codes, no AR markers, no crypto unlocks.
- No NFTs, no gift cards, no loot boxes, no in-game currencies.

---

### 3.1.1(a) Link to Other Purchase Methods

**Quote (verbatim):**
> Developers may apply for entitlements to provide a link in their app to a website the developer owns or maintains responsibility for in order to purchase digital content or services. … In all other storefronts, except for the United States storefront, where this prohibition does not apply, apps and their metadata may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase.

**Virra status:** ✅ Compliant

**Evidence:**
- No external purchase entitlements applied for.
- Paywall (`paywall.tsx`) contains no `Linking.openURL` calls and no external purchase links.
- The only external link in the subscription flow is `subscription.tsx` line 46–48: `Linking.openURL(managementURL)` which routes to RevenueCat's `managementURL` (which itself resolves to Apple's `https://apps.apple.com/account/subscriptions` per RC's implementation, with a fallback to that URL directly on line 46). This is Apple's official subscription management — not an external purchase path.

---

### 3.1.2(a) Subscriptions — Permissible Uses

**Quote (verbatim):**
> If you offer an auto-renewable subscription, you must provide ongoing value to the customer, and the subscription period must last at least seven days and be available across all of the user's devices. … apps that offer consistent, substantive updates; access to large collections of, or continually updated, media content; software as a service ("SAAS")…
> As with all apps, those offering subscriptions should allow a user to get what they've paid for without performing additional tasks, such as posting on social media, uploading contacts, checking in to the app a certain number of times, etc.

**Virra status:** ✅ Compliant

**Evidence:**
- **Ongoing value:** Virra is SaaS-pattern — continuous training plan generation, daily nutrition targets that update with cycle phase, weekly AI-generated insights, dynamic season engine, education library. All update continuously, not a one-shot unlock. ✅
- **Minimum period:** Planned tiers are monthly and annual (per `docs/app-store-submission.md` Phase 4 lines 38–39). Both ≥ 7 days. ✅
- **Cross-device:** Subscription entitlement is stored against the RevenueCat customer ID (tied to the user's Supabase auth ID), and RC handles cross-device sync when the same Apple ID signs into multiple devices. ✅
- **No engagement gates:** No "share to unlock", no "invite friends", no "rate the app", no daily-streak gates. Subscription unlocks ALL features for the entire trial + paid period. ✅
- **No bait-and-switch:** Description, paywall feature list, and actual app capabilities all match. Cycle-aware planning, nutrition targets, HealthKit sync, insights — all real, all shipping in v1.

**Sub-note on free trial:** 14-day trial is configured in the subscription group (per submission doc Phase 4 line 40). Apple's free trial mechanism uses StoreKit's introductory offer system — RC's `purchasePackage` handles this. The paywall correctly states "14 days free. Cancel any time. No charge until your trial ends." ✅ But see 3.1.2(c) below for the missing additional disclosures.

---

### 3.1.2(b) Upgrades and Downgrades

**Quote (verbatim):**
> Users should have a seamless upgrade/downgrade experience and should not be able to inadvertently subscribe to multiple variations of the same thing.

**Virra status:** ✅ Compliant (delegated to App Store Connect configuration)

**Evidence:**
- Submission doc Phase 4 line 37: *"Create subscription group 'Virra Pro'"* — putting both tiers in the same subscription group is the correct Apple pattern. Within a single subscription group, Apple's StoreKit enforces single-active-subscription per Apple ID and surfaces the upgrade/downgrade UX natively.
- Action item: ensure both monthly and annual tiers are created **inside** the same subscription group in App Store Connect (not as separate groups). Submission doc already states this correctly.

---

### 3.1.2(c) Subscription Information

**Quote (verbatim):**
> Before asking a customer to subscribe, you should clearly describe what the user will get for the price. How many issues per month? How much cloud storage? What kind of access to your service? Ensure you clearly communicate the requirements described in Schedule 2 of the Apple Developer Program License Agreement.

**Virra status:** ❌ BLOCKER

**Evidence:**

`mobile/app/(auth)/paywall.tsx` lines 65–113 render the entire pre-purchase paywall surface. The disclosure block (line 111–113) reads:
> *"Subscription auto-renews. Cancel at any time in Settings before trial ends."*

This omits most of what Schedule 2 of the Apple Developer Program License Agreement requires the paywall to display *before* purchase. Apple's standard required boilerplate is:

1. Title of the subscription (e.g. "Virra Pro");
2. Length of subscription (monthly/annual) and what the subscription delivers in each period;
3. Price of the subscription, by period;
4. "Payment will be charged to your Apple ID account at confirmation of purchase."
5. "Subscription automatically renews unless it is cancelled at least 24 hours before the end of the current period."
6. "Your account will be charged for renewal within 24 hours prior to the end of the current period."
7. "You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase."
8. "Any unused portion of a free trial period, if offered, will be forfeited when you purchase a subscription."
9. **Links to Terms of Service / EULA** (Apple's standard EULA URL is acceptable: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` — or you can supply your own custom EULA URL in App Store Connect).
10. **Link to Privacy Policy** (same URL planned for `virra.app/privacy`).

This is one of the most common rejection patterns Apple cites for first-time subscription apps.

**Action needed:**
1. Extend the paywall to render a `<View>` block beneath the CTA with all of the above. Keep it small-text (≈11pt) so it doesn't dominate the layout, but ensure it is rendered, scrollable, and visible *before* the user can tap "Start 14-day free trial".
2. Render two `Linking.openURL` links — "Terms of Service" → custom or Apple stdeula URL — and "Privacy Policy" → `virra.app/privacy` (once published).
3. Same pattern should also appear on the post-purchase `subscription.tsx` screen for compliance and user reference, but the **paywall is the gating surface** Apple reviews.

**Suggested copy** (adapt to brand voice; the legal substance must remain):
```
Virra Pro — Monthly · £X.99/month, or Annual · £XX.99/year
- Payment is charged to your Apple ID at the end of the 14-day free trial.
- Subscriptions auto-renew at the same price for the same period unless turned off
  at least 24 hours before the end of the current period.
- Manage or cancel in Settings → [Apple ID] → Subscriptions any time before the trial ends.
- Any unused portion of the free trial is forfeited when you purchase a paid subscription.

Terms of Service · Privacy Policy
```

---

### 3.1.3 Other Purchase Methods (3.1.3(a)–(g))

**Virra status:** ✅ Not applicable / Compliant

**Evidence:**
- 3.1.3(a) "Reader" Apps: Virra is not a reader app. Not applicable.
- 3.1.3(b) Multiplatform: Virra is iOS-only at launch. Not applicable.
- 3.1.3(c) Enterprise: Consumer app, not enterprise-sold. Not applicable.
- 3.1.3(d) Person-to-person services: No coach-to-client portal in v1 (deferred to Phase 2 per `CLAUDE.md`). Not applicable.
- 3.1.3(e) Physical goods/services consumed outside the app: Not applicable.
- 3.1.3(f) Free companion to web tool: Not applicable.
- 3.1.3(g) Advertising management: Not applicable.

---

### 3.1.4 Hardware-Specific Content

**Virra status:** ✅ Not applicable

**Evidence:** No hardware-bundled unlocks. HealthKit access does not unlock paid features — paid features are gated by the subscription regardless of HK availability.

---

### 3.1.5 Cryptocurrencies

**Virra status:** ✅ Not applicable

**Evidence:** No crypto wallet, mining, exchange, ICO, or token features. No `crypto` / `wallet` / `mining` references in the codebase.

---

### 3.2.1 Other Business Models — Acceptable

**Virra status:** ✅ Not applicable to most sub-clauses

**Evidence:** No third-party app displays, no insurance, no nonprofit fundraising, no gifting between users, no financial trading. The only acceptable-list clause Virra touches is implicitly 3.2.1 generally — operating a subscription SaaS for consumers.

---

### 3.2.2 Other Business Models — Unacceptable

**Quote (selected verbatim):**
> Apps must not force users to rate the app, review the app, download other apps, or other store-related actions in order to access functionality, content, or use of the app. Apps may otherwise incentivize users to take specific actions within apps (e.g. completing a level, watching an ad).

**Virra status:** ✅ Compliant

**Evidence:**
- 3.2.2(i) Third-party app catalog: Not applicable.
- 3.2.2(iii) Ad impression manipulation: Not applicable — no ads.
- 3.2.2(iv) Charity collection inside the app: Not applicable.
- 3.2.2(v) Arbitrary restriction by location/carrier: Not applicable. Virra is global by default.
- 3.2.2(vii) Manipulating user visibility on other services: Not applicable.
- 3.2.2(viii) Binary options / FOREX: Not applicable.
- 3.2.2(ix) Personal loans: Not applicable.
- 3.2.2(x) Force-rating / force-downloading: ✅ No StoreKit `requestReview()` calls in the codebase (verified by grep). No "rate us to unlock" gates. No "download our other app" prompts. Notifications do not link out to other apps.

---

### Other Section 3 Surfaces

**Pricing rip-off check (Section 3 preamble):** Subscription tiers TBD per `docs/app-store-submission.md` lines 38–39. Recommend benchmarking against Runna (~£14.99/month, £119.99/year), Strava (£8.99/month, £54.99/year), Apple Fitness+ (£9.99/month, £79.99/year) — anything in or below that band is defensible. Avoid prices that would read as a "rip-off" (e.g. £49.99/month).

**Review-manipulation check (Section 3 preamble):** No incentivized-review SDKs, no fake-review mechanisms, no review-trading services. ✅

---

## Blockers to Fix Before Submission

| # | Blocker | Clause | File(s) to Change | Priority |
|---|---------|--------|-------------------|----------|
| 1 | Paywall is missing full Schedule 2 / 3.1.2(c) subscription disclosures (per-period price + length, charge timing, 24h renewal language, Account Settings management path, free-trial forfeit, ToS + Privacy Policy links) | 3.1.2(c) | `mobile/app/(auth)/paywall.tsx` lines 111–113 — extend disclosure block | P0 |
| 2 | Subscription pricing not yet decided (and not yet created in ASC) | 3.1.2(a)/(c) | App Store Connect subscription group; `docs/app-store-submission.md` lines 38–39 | P0 |
| 3 | `[DEV] Skip paywall` button (`paywall.tsx` lines 121–128) is gated by `__DEV__ \|\| EXPO_PUBLIC_INTERNAL_BUILD === 'true'` — must verify the production EAS profile does NOT set `EXPO_PUBLIC_INTERNAL_BUILD=true` | 3.2.2(general) | `mobile/eas.json` production profile env block | P0 (verify) |

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R-3.1.2(b) | Confirm both monthly + annual tiers are created **inside a single subscription group** in ASC, not as separate groups | 3.1.2(b) | StoreKit handles seamless upgrades natively when in the same group; separate groups produce a worse UX and risk dual-subscription confusion |
| R-3.1.2(c)-mirror | Mirror the same Schedule 2 disclosures on `subscription.tsx` so users can re-read terms post-purchase | 3.1.2(c) | Strict reading of Apple's rule places the obligation only at the pre-purchase paywall, but mirroring is best practice and many apps do it |
| R-pricing | Benchmark monthly + annual prices against Runna, Strava, Apple Fitness+ before setting | 3 preamble | Defends against "irrationally high price" finding; sets a defensible band |
| R-EULA | Decide whether to use Apple's standard EULA (`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`) or a custom EULA hosted at `virra.app/terms`; if custom, configure the URL in App Store Connect → App Information → License Agreement | 3.1.2(c) / 5.1.1 | Custom EULA is rarely necessary for a fitness SaaS — using the standard EULA is faster and lower-risk |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/app/(auth)/paywall.tsx` | 111–113 | Disclosure block missing full Schedule 2 boilerplate |
| `mobile/app/(auth)/paywall.tsx` | 121–128 | `[DEV] Skip paywall` correctly gated, but verify production env does not set the flag |
| `mobile/app/(app)/subscription.tsx` | 46–48 | Manage URL routes correctly to Apple's subscription management (compliant) |
| `mobile/app/(app)/subscription.tsx` | 54–69 | Restore Purchases present (compliant) |
| `mobile/src/lib/revenuecat.ts` | (inferred) | RC wraps StoreKit — the IAP entry point |
| `docs/app-store-submission.md` | 38–39 | Subscription pricing decision still outstanding |
