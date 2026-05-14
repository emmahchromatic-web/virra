# Apple App Store Review Guideline Section 5 — Legal — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#legal (fetched live)
**Reviewer:** Claude Code

**Note:** Section 5.1.1 was previously audited in `docs/app-store-5.1.1-review.md`. This document covers the remaining clauses: **5.1.2** (Data Use and Sharing), **5.1.3** (Health and Health Research), **5.1.4** (Kids), **5.1.5** (Location Services), **5.2** (Intellectual Property), **5.3** (Gaming/Gambling — not applicable), **5.4** (VPN — not applicable), **5.5** (MDM — not applicable), **5.6** (Developer Code of Conduct — high-level compliance check).

---

## Executive Summary

Section 5 is the heart of compliance for a health-data app and Virra has **two new P0 findings** here that haven't appeared in earlier sections: (1) **5.1.3(i) HealthKit data disclosure** — the App Privacy questionnaire in App Store Connect must enumerate every specific HealthKit data type Virra reads/writes (workouts, HR, HRV, resting HR, AEE, AppleExerciseTime, DistanceWalkingRunning, Steps, VO₂ max, sleep analysis, weight, menstrual flow); a generic "Health & Fitness data" entry is insufficient. (2) **5.2.2 Open Food Facts attribution** — Virra uses the Open Food Facts API (`mobile/src/lib/openFoodFacts.ts`) and OFF's Open Database License requires user-visible attribution, which does not currently exist anywhere in the app. Section 5.2.5 contains a **monitor-level risk** for the Activity Rings on the dashboard — Apple specifically calls out third-party rings that visualise Move/Exercise/Stand data in a way that resembles the system Activity control. Virra's rings are visually distinct (two tiles, not three concentric; "STEPS" and "MIN" labels; lime + orange colours) but the "MIN" ring directly tracks the same Exercise-minutes metric as Apple's. Worth documenting the design rationale for the reviewer notes.

---

## Sub-clause × Virra Compliance Matrix

### 5.1.2 Data Use and Sharing

**Quote (verbatim, key parts):**
> Unless otherwise permitted by law, you may not use, transmit, or share someone's personal data without first obtaining their permission. … You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so. … You must receive explicit permission from users via the App Tracking Transparency APIs to track their activity. … Your app may not require users to enable system functionalities (e.g. push notifications, location services, tracking) in order to access functionality, content, use the app, or receive monetary or other compensation.
> Data collected for one purpose may not be repurposed without further consent…
> Data gathered from the HomeKit API, HealthKit … may not be used for marketing, advertising or use-based data mining, including by third parties.

**Virra status:** ⚠ Two findings

**Sub-issue A — Anthropic disclosure (third-party AI):**
- Clause 5.1.2(i) explicitly names "third-party AI" as a category that requires disclosure and consent.
- `mobile/supabase/functions/generate-insights/index.ts` sends aggregate training metrics (weekly km, adherence %, energy/mood averages, upcoming sessions, cycle phase) to Anthropic's Claude Haiku API.
- This must be disclosed in: (a) the App Store Connect App Privacy questionnaire as a third-party processor; (b) the published privacy policy at `virra.app/privacy`; (c) ideally also in a short in-app explainer the first time an Insight is generated. Items (a) and (b) are blockers; (c) is best practice.

**Sub-issue B — ATT / tracking:**
- ✅ Virra does no cross-app/website tracking. No third-party advertising SDKs, no analytics SDKs. No `NSUserTrackingUsageDescription` declared in `mobile/app.json` and none is needed.
- No App Tracking Transparency prompt is required.

**Sub-issue C — Required system functionality:**
- The clause says apps "may not require users to enable system functionalities (e.g. push notifications, location services, tracking) in order to access functionality, content, [or] use the app."
- Virra's onboarding flags HealthKit, Location, and Notifications as `optional: false` in `mobile/src/lib/permissionsConfig.ts`. Functionally the app proceeds even on denial (verified in `docs/app-store-5.1.1-review.md` clause 5.1.1(iv)). The `optional: false` label is a UX framing, not a hard gate.
- ✅ The app does not blow up or block features behind a permission grant. Compliant in substance; UX should be reviewed for any "you must enable X to continue" copy.

**Sub-issue D — Data repurposing:**
- ✅ All data is used for its declared purpose: HK reads → training/nutrition personalisation; cycle data → phase engine; subscription data → entitlement gating. No analytics, no advertising profile building.

**Sub-issue E — Surreptitious profile building (5.1.2(iii)):**
- ✅ No anonymous-profile-building behaviour. Insights are generated for, and shown only to, the authenticated user themselves.

**Sub-issue F — HealthKit for marketing/advertising/data mining (5.1.2(vi)):**
- ✅ HK-derived data is never used for advertising. Aggregate metrics are sent to Anthropic *to improve health management* (the only permitted use under 5.1.3(i) — see next clause).

**Action needed:**
1. Add Anthropic to the App Privacy questionnaire as a third-party processor of "Health & Fitness data — aggregated" and disclose explicitly in `virra.app/privacy`.
2. Audit the entire onboarding flow for any copy that reads "you must enable X to continue" — the language must communicate the consequence ("Virra can't track your run without this") without implying the app is unusable.

---

### 5.1.3 Health and Health Research

**Quote (verbatim, key parts):**
> Apps may not use or disclose to third parties data gathered in the health, fitness, and medical research context … for advertising, marketing, or other use-based data mining purposes other than improving health management, or for the purpose of health research, and then only with permission. … **You must disclose the specific health data that you are collecting from the device.**
> Apps must not write false or inaccurate data into HealthKit … and may not store personal health information in iCloud.

**Virra status:** ⚠ One finding (5.1.3(i) data disclosure specificity)

**Sub-issue A — Disclosure specificity (P0):**
- 5.1.3(i) requires the developer to **enumerate the specific HealthKit data types** being read and/or written. A generic "we use Health & Fitness data" entry on the App Privacy questionnaire is **not sufficient** for an app of Virra's category.
- Virra's `buildHKPermissions()` in `mobile/src/lib/permissionsConfig.ts` lines 54–82 reads from: `HeartRate`, `RestingHeartRate`, `HeartRateVariability`, `ActiveEnergyBurned`, `AppleExerciseTime`, `DistanceWalkingRunning`, `Steps`, `Vo2Max`, `SleepAnalysis`, `Weight`, `Workout`. It writes: `Workout`, `EnergyConsumed`, `Carbohydrates`, `Protein`, `FatTotal`, `Fiber`. Plus the custom menstrual-flow read via `@/modules/menstrual-health`.
- **All of these must be enumerated in both:**
  - The App Store Connect App Privacy questionnaire (under Health & Fitness → specific types collected)
  - The privacy policy at `virra.app/privacy`

**Sub-issue B — Use of HK data for "improving health management":**
- ✅ Aggregate training context is sent to Anthropic Haiku for narrative-insight generation. The purpose is "improving health management for the user," which is the explicit permitted purpose in 5.1.3(i).
- Not used for advertising. Not used for marketing. Not used for data mining for third-party profit. ✅

**Sub-issue C — No false data writes (5.1.3(ii)):**
- ✅ Virra writes only verified workouts and verified nutrition entries to HK. Workout writes come from completed run tracker sessions or manually logged activities where the user is the source of truth. Nutrition writes (`EnergyConsumed`, `Carbohydrates`, `Protein`, `FatTotal`, `Fiber`) come from user-confirmed food entries.
- No fabricated, simulated, or extrapolated data is written to HK.

**Sub-issue D — No iCloud storage of PHI (5.1.3(ii)):**
- ✅ Virra does not use iCloud for any storage. Personal health information lives in: (a) Apple Health on-device (Apple's responsibility), (b) Supabase (`cycle_logs`, `symptom_logs`, `food_entries`, `activities`, `nutrition_logs` — encrypted in transit and at rest by Supabase Postgres). Supabase is not iCloud. ✅

**Sub-issues E and F (5.1.3(iii) and (iv)) — Health research:**
- ✅ Not applicable. Virra is not a research app. No human-subject research is conducted. No IRB approval is needed.

**Action needed:**
1. Enumerate every HK type (read + write) on the App Privacy questionnaire — granular checkboxes per Apple's questionnaire schema.
2. Mirror the same enumeration verbatim in the privacy policy.
3. Add a note in the App Review reviewer notes that Virra's only third-party processing of HK-derived data is via the `generate-insights` Edge Function to Anthropic Claude Haiku, that only aggregate (non-PHI) metrics are sent, and that the purpose is health management for the user — not advertising, marketing, research, or data mining.

---

### 5.1.4 Kids

**Virra status:** ✅ Not applicable (re-confirmed)

**Evidence:**
- Already covered in `docs/app-store-section-1-safety-review.md` (clause 1.3). Virra is not a kids app, not submitted to the Kids Category. Target audience is adult women runners — explicitly handles menstrual data, which is incompatible with the Kids Category.
- No third-party analytics, no third-party advertising — both clauses align with kids-app expectations but the rationale is just "Virra has no ads, no analytics" rather than "Virra is for kids".
- Submission doc lines 213–215: age rating 4+ is fine; this is rating-only, not Kids Category.

---

### 5.1.5 Location Services

**Quote (verbatim):**
> Use Location Services in your app only when it is directly relevant to the features and services provided by the app. Location-based APIs shouldn't be used to provide emergency services or autonomous control over vehicles, aircraft, and other devices. … Ensure that you notify and obtain consent before collecting, transmitting, or using location data. If your app uses Location Services, be sure to explain the purpose in your app.

**Virra status:** ✅ Compliant

**Evidence:**
- Location is used by `mobile/app/(app)/run.tsx` for in-app GPS run tracking — directly relevant to the core "run logging" feature.
- Location data is not transmitted off-device beyond the workout's GPS trace being written to Apple HealthKit (and optionally to Supabase via the `gps_trace` column on `activities`). The GPS trace is the user's own run map — no aggregation, no third-party sharing.
- Permission is requested with a clear pre-permission rationale screen (`mobile/app/(auth)/onboarding/permissions.tsx` driven by `permissionsConfig.ts` line 27–33). The usage description in `mobile/app.json` line 25–26 explains the purpose.
- No autonomous vehicle / aircraft / drone control. No emergency services.

---

### 5.2 Intellectual Property

**Sub-clause findings:**

**5.2.1 Generally:** ✅ Compliant
- Virra is original IP. Brand, name, design system, all first-party.
- Submitted by the legal owner (sole developer per `app.json`). Submission doc Phase 5 line 47 lists contact info — same developer.

**5.2.2 Third-Party Sites/Services:** ⚠ Finding

Virra uses these third-party services and APIs:

| Service | Used for | Terms compliance | Attribution required? | Status |
|---------|----------|------------------|----------------------|--------|
| Apple HealthKit | Health data read/write | Apple's own platform | N/A | ✅ |
| Supabase | Auth, Postgres, Storage, Edge Functions | Supabase TOS — backend service for own data | N/A | ✅ |
| RevenueCat | IAP entitlement management | RC TOS — direct integration | N/A | ✅ |
| Anthropic Claude Haiku | AI-generated insights | Anthropic API terms — paid usage | N/A | ✅ |
| Open Food Facts | Food / barcode lookup | **ODbL (Open Database License) — REQUIRES attribution** | **Yes** | ❌ |
| Google Fonts | Big Shoulders Display, Fraunces, Inter, Space Mono | SIL Open Font License — free use | Not required for runtime use | ✅ |

**Open Food Facts attribution gap:**
- `mobile/src/lib/openFoodFacts.ts` line 5 correctly uses a descriptive User-Agent (OFF requires this).
- However, grep for "Open Food Facts" across `mobile/app/` and `mobile/src/` reveals **no user-visible attribution anywhere** — not on the food-search screen, not in Settings, not in the description.
- The Open Database License (ODbL) under which OFF data is distributed requires **clear attribution to Open Food Facts on a surface visible to end users**.
- The simplest compliant pattern: a small "Food data from Open Food Facts" footer on the food-search screen, plus a "Credits" row in Settings or Profile that lists OFF and links to `https://openfoodfacts.org`.

**5.2.3 Audio/Video Downloading:** ✅ Not applicable. Virra does not download, save, or convert media from third-party sources.

**5.2.4 Apple Endorsements:**
- ✅ No "Endorsed by Apple" or "Made by Apple" implications anywhere in the codebase or marketing copy.
- ✅ No Apple wordmark or Apple logo embedded in the icon, splash, or any in-app surface.

**5.2.5 Apple Products:** ⚠ Monitor (Activity Rings)

This clause says: *"If your app displays Activity rings, they should not visualize Move, Exercise, or Stand data in a way that resembles the Activity control."*

`mobile/src/components/ui/ActivityRing.tsx` defines `ActivityRings` rendered on the Dashboard (`mobile/app/(app)/(tabs)/index.tsx` line 237). Comparison to Apple's Activity control:

| Attribute | Apple Activity | Virra |
|-----------|---------------|-------|
| Ring count | 3 (Move / Exercise / Stand) | 2 (Steps / Exercise minutes) |
| Layout | Concentric overlapping | Side-by-side tiles |
| Move ring | Red, kcal-active goal | (Virra has no Move ring) |
| Exercise ring | Green, exercise-minutes goal | Orange (`colors.dawn`), exercise-minutes goal — same metric |
| Stand ring | Blue/cyan, stand-hours goal | (Virra has no Stand ring) |
| Steps ring | (None in Apple Activity) | Lime (`colors.pulse`), step-count goal |
| Per-ring metric label | None visible (icons only) | Mono "STEPS" / "MIN" labels under each tile |

**Assessment:**
- The exercise-minutes ring directly tracks the same metric as Apple's Exercise ring (HK `AppleExerciseTime`). However, the colour (orange not green), label ("MIN" not iconified), and layout (separate tile not concentric) are visually distinct.
- The steps ring tracks a different metric than any Apple Activity ring.
- Apple has accepted similar third-party rings from Runkeeper, Strava, AutoSleep, etc. for years. The clause targets clones of the Apple Activity control visual identity, not all progress-ring UI.
- **Risk level: Low-medium.** A reviewer might flag this for the exercise-minutes overlap. Adding a brief note in reviewer notes explaining the design decision pre-empts the question.

**Action needed (Activity Rings):**
1. In the reviewer notes, add: *"Dashboard activity rings show steps and exercise minutes against user-defined targets, in two side-by-side tiles. They are visually and structurally distinct from Apple's three-ring concentric Activity control — different ring count, different layout, different colours, different labels. Exercise minutes is read from HKQuantityTypeIdentifierAppleExerciseTime as Apple intends for third-party fitness apps to do."*
2. No code change required unless a reviewer flags it.

---

### 5.3 Gaming, Gambling, and Lotteries

**Virra status:** ✅ Not applicable

**Evidence:** No betting, sweepstakes, contests, raffles, real-money gaming, lotteries, or in-game currencies. None of 5.3.1–5.3.4 apply.

---

### 5.4 VPN Apps

**Virra status:** ✅ Not applicable

**Evidence:** Virra does not use `NEVPNManager`. No network extension entitlements. No VPN, content blocking, parental control, or proxy functionality.

---

### 5.5 Mobile Device Management

**Virra status:** ✅ Not applicable

**Evidence:** No MDM capability requested. No `com.apple.mdm` entitlements. Virra is a consumer fitness app, not an enterprise device manager.

---

### 5.6 Developer Code of Conduct

**Virra status:** ✅ Compliant (high-level)

**Evidence (high-level audit):**
- **Integrity:** Reviewer notes (`docs/app-store-submission.md` lines 168–186) are accurate, factual, and matchable against actual app behaviour.
- **Customer fairness:** Subscription terms will be clearly disclosed once the Schedule 2 disclosures (P0 in Section 3 review) land on the paywall. Free trial is honoured. Cancellation works through Apple's standard subscription management. No dark patterns.
- **Review manipulation:** No incentivized-review SDKs. No review-trading services. No "rate us to unlock" prompts.
- **Fraud / abuse:** No deceptive features. No hidden functionality. No bait-and-switch (cycle-aware claims are real and shipping).
- **App Review respect:** Reviewer notes are professional, direct, and helpful.

**Note:** Section 5.6 also covers off-platform conduct (treating App Review staff respectfully, not making misrepresentations during appeals, etc.). This is a behavioural standard, not a code-auditable rule. No findings.

---

## Blockers to Fix Before Submission

| # | Blocker | Clause | File(s) / Surface | Priority |
|---|---------|--------|-------------------|----------|
| 1 | App Privacy questionnaire must enumerate every specific HealthKit data type Virra reads + writes (HR, RestingHR, HRV, AEE, AppleExerciseTime, DistanceWalkingRunning, Steps, VO₂max, SleepAnalysis, Weight, Workout, MenstrualFlow; writes: Workout, EnergyConsumed, Carbohydrates, Protein, FatTotal, Fiber) — generic "Health & Fitness data" is insufficient | 5.1.3(i) | App Store Connect → App Privacy + `virra.app/privacy` | P0 |
| 2 | Anthropic must be disclosed as a third-party processor of aggregate Health & Fitness data — both in the App Privacy questionnaire AND the privacy policy | 5.1.2(i) / 5.1.3(i) | App Store Connect + privacy policy | P0 |
| 3 | Open Food Facts attribution missing from any user-visible surface — ODbL licence requires attribution | 5.2.2 | Add footer to food-search screen and/or "Credits" row in Profile or Settings | P0 |

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R-5.1.2-onboarding | Audit onboarding copy for "you must enable X to continue" framing — replace with consequence-only language ("Virra can't track your run without this") | 5.1.2(i) | Prevents "forcing consent" finding |
| R-5.1.3-explainer | Add a one-shot in-app explainer the first time an Insight is generated, noting that aggregate (non-PHI) metrics are sent to Anthropic's AI to compose the narrative — and that raw HealthKit values stay on-device | 5.1.3(i) / 5.1.1(i) | Stronger transparency; defends against later complaints |
| R-5.2.5-rings | Add a paragraph in the reviewer notes explaining the Dashboard Activity Rings design (steps + exercise minutes, two tiles, not concentric, distinct from Apple's three-ring Activity control) | 5.2.5 | Pre-empts a reviewer question; no code change |
| R-5.2.2-credits | Add a "Credits / Acknowledgements" section in Settings listing Open Food Facts (with link), Google Fonts, and any other open-source dependencies — good hygiene plus satisfies multiple licences in one place | 5.2.2 | One-shot compliance for current and future third-party data sources |
| R-5.6 | Keep all reviewer-facing communications professional and factual; if a rejection happens, respond via App Store Connect with calm, specific reasoning, not appeals based on competitor behaviour | 5.6 | Cultural — protects developer-program standing |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/src/lib/permissionsConfig.ts` | 54–82 | Specific HK types must be enumerated in App Privacy + policy |
| `mobile/supabase/functions/generate-insights/index.ts` | (entire) | Anthropic = third-party AI processor — must be disclosed |
| `mobile/src/lib/openFoodFacts.ts` | 3, 5 | OFF integration; attribution missing on user-visible surface |
| `mobile/src/components/ui/ActivityRing.tsx` | (entire) | Dashboard rings — monitor for 5.2.5 confusion risk |
| `mobile/app/(app)/(tabs)/index.tsx` | 237 | Activity rings rendered on dashboard |
| `mobile/app/(app)/run.tsx` | (location use) | 5.1.5 compliant — purpose explained, no off-device transmission beyond user's own HK/Supabase |
| `mobile/app/(auth)/onboarding/*` | (copy) | Recommend audit for "must enable" language — R-5.1.2-onboarding |

---

## Cross-Reference to Other Reviews

| Topic | Covered in |
|-------|-----------|
| Privacy policy + account deletion + camera permission + skip-button issue | `docs/app-store-5.1.1-review.md` |
| Medical disclaimer + support URL + data security | `docs/app-store-section-1-safety-review.md` |
| Demo account + RevenueCat key swap + screenshots | `docs/app-store-section-2-performance-review.md` |
| Schedule 2 subscription disclosures on paywall | `docs/app-store-section-3-business-review.md` |
| Originality, notifications hygiene, login services | `docs/app-store-section-4-design-review.md` |
