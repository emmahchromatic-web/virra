# App Store Submission — Virra

Working document. ASC app already exists: **ID `6768433819`**, Apple ID `dickenson.ps@gmail.com`.

---

## Submission readiness checklist

### Phase 1 — Text metadata (draft below)
- [ ] App name (≤30 chars)
- [ ] Subtitle (≤30 chars)
- [ ] Promotional Text (≤170 chars)
- [ ] Description (≤4000 chars)
- [ ] Keywords (≤100 chars, comma-separated, no spaces after commas)
- [ ] Support URL
- [ ] Marketing URL (optional)
- [ ] Privacy Policy URL ⚠ required
- [ ] What's New in This Version (release notes, ≤4000 chars)
- [ ] Primary category + secondary category
- [ ] Age rating questionnaire

### Phase 2 — Visual assets

ASC's upload UI gates strictly on pixel dimensions per slot. Populate every slot the ASC UI shows you, capturing each from a matching simulator. Up to 10 screenshots per tier.

- [ ] **6.9"** (1320×2868) — iPhone 16 Pro Max
- [ ] **6.7"** (1290×2796 or 1284×2778) — iPhone 15 Pro Max / 16 Plus / 13 Pro Max
- [ ] **6.5"** (1242×2688 or 1284×2778) — iPhone 11 Pro Max / XS Max
- [ ] **5.5"** (1242×2208) — iPhone 8 Plus (only if ASC asks for this slot)
- [ ] App preview video (optional, recommended for retention)
- [x] App icon — light/dark/tinted variants (done, shipped 2026-05-13)
- [x] Splash screen — Splash.png (done)

Capture workflow per tier (after signing in to the App Review demo account on each booted simulator):

```bash
# 6.9" — iPhone 16 Pro Max
python3 tools/frame_screenshots.py --asc --tier 6.9 --screens \
  onboarding,dashboard,training,nutrition,cycle,insights,paywall

# 6.7" — shut down 6.9" sim, boot iPhone 15 Pro Max, then:
python3 tools/frame_screenshots.py --asc --tier 6.7 --screens \
  onboarding,dashboard,training,nutrition,cycle,insights,paywall

# 6.5" — boot iPhone 11 Pro Max, then:
python3 tools/frame_screenshots.py --asc --tier 6.5 --screens \
  onboarding,dashboard,training,nutrition,cycle,insights,paywall
```

The `--tier` flag validates the booted simulator produces the expected size and organises output into:

```
docs/app-store/screenshots/6.9/01-onboarding.png … 07-paywall.png
docs/app-store/screenshots/6.7/01-onboarding.png … 07-paywall.png
docs/app-store/screenshots/6.5/01-onboarding.png … 07-paywall.png
```

Drag each folder into the matching ASC slot.

### Phase 3 — App Privacy ("nutrition label")
- [ ] Complete the privacy questionnaire in ASC
- [ ] Privacy types collected: email, name, health & fitness, location (precise + coarse), purchase history, identifiers, usage data — see questionnaire draft below

### Phase 4 — Subscription product
- [x] Create subscription group "Virra Pro"
- [x] Add monthly tier — **£9.99 / month**
- [x] Add annual tier — **£99.99 / year** (effective £8.33 / month — saves ~17% vs monthly)
- [x] 14-day free trial configured on both
- [ ] Subscription display name + description per locale
- [ ] Subscription review notes
- [ ] RevenueCat: link products + offerings, update `EXPO_PUBLIC_REVENUECAT_IOS_KEY` from test_ key to appl_ key
- [ ] Replace test paywall product fetch with real

### Phase 5 — App Review information
- [ ] Demo account credentials (an account with onboarding completed + sample data)
- [ ] Reviewer notes — explain cycle tracking, female-health focus, expected age-rating considerations
- [ ] Contact info — first name, last name, phone, email

### Phase 6 — Build readiness
- [ ] 541-warning triage — review own-code warnings (see memory: project_xcode_warnings)
- [ ] All four onboarding permissions tested with allow + deny paths
- [ ] Crash-free verified on TestFlight (internal build first)
- [ ] Permission usage description strings match actual behaviour in code
- [ ] Build version + build number bumped (currently buildNumber: 5 in app.json)
- [ ] Production EAS profile build via `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios --latest` to push the build to ASC
- [ ] Submit for review through ASC

### Phase 7 — Marketing site
- [x] virra.app exists (Astro site)
- [ ] Update site to reflect launched-app status (not "coming soon")
- [ ] Privacy Policy page live at e.g. virra.app/privacy
- [ ] Support page live at e.g. virra.app/support — or a mailto: link is acceptable
- [ ] Optional: Press kit / app icons / screenshots for journalists

---

## Draft copy (iterate in place)

### App name — `Virra: Run with Your Cycle` (28 chars)

Alternatives if you want to test variants:
- `Virra — Running for Women` (24)
- `Virra: Cycle-Aware Running` (26)
- `Virra: Train with Your Cycle` (28)

The "Run with Your Cycle" wording leans into the moat. Apple search rewards distinctive names with strong keywords; "cycle" + "run" are both indexed.

### Subtitle — `Training in tune with you` (25 chars)

Alternatives:
- `Training that flexes with you` (29)
- `Cycle-aware training & fuel` (27)
- `Run with your body, not against it` (34 — too long)
- `Training built around your cycle` (32 — too long)

### Promotional Text — (170 chars max, editable post-launch)

> Training plans that adjust to your cycle. Nutrition targets that shift with your phase. Recovery that respects what your body actually needs. Built by a runner, for runners.

(160 chars — good)

### Description — (4000 chars max)

```
Virra is a running app built around how women's bodies actually work.

It's the only app that takes your menstrual cycle as seriously as your training plan — adjusting pace targets, fuelling demands, and recovery cues in real time. The same long run feels different in luteal than in follicular. So why should the plan stay the same?

WHAT VIRRA DOES

— Cycle-Adjusted Training Plans
5K to marathon. The plan reads your cycle phase, your training history, and your upcoming races. Long runs anchor to your follicular window for peak quality. Intervals land in ovulation for peak power. Threshold pace adjusts in luteal — same physiological work, different number on the watch.

— Phase-Aware Nutrition Targets
Carb, protein, fat, and fibre targets that flex with your cycle phase AND your training load. Higher carbs in luteal, when cravings are real and your body needs them. Front-loaded fuelling on long-run mornings. Never about restriction. Always about fuelling the work.

— Seamless Apple Health Sync
Runs from your Apple Watch import automatically. Pace, distance, heart rate, route. No manual logging unless you want to. Period tracking syncs both ways.

— Daily Dashboard
Today's training. Today's cycle phase. Today's fuelling target. One screen. No paralysis.

— Smart Notifications
Reminders that cancel themselves when the action is done. Logged your workout? The training reminder disappears. Logged dinner? The nutrition prompt goes quiet. Notifications that earn their place.

— Education Library
Articles by a qualified personal trainer covering every phase, every nutritional question, every recovery pattern. The "why" behind every number on your dashboard.

WHO VIRRA IS FOR

Runners who want to train hard AND respect what their body needs at each phase. From first 5K to fourth marathon. Women on natural cycles, hormonal contraception, perimenopause, or menopause — the app adapts.

NOT a weight loss app. NOT a calorie counter. NEVER diet culture. Virra speaks the language of fuelling, not restriction.

SUBSCRIPTION

14-day free trial, then Virra Pro:
• Monthly subscription
• Annual subscription (save vs monthly)
• Auto-renews unless cancelled in App Store settings
• Cancel anytime — your data stays

PRIVACY

Your health data never leaves your device unless you choose to share. We use Apple HealthKit, which keeps everything on your phone. Your cycle data is yours. Your training data is yours. We don't sell anything to anyone.

Built in the UK. Made for runners. Made with care.
```

(~2,200 chars — comfortable headroom for iteration; can run longer if needed)

### Keywords — (100 chars max, comma-separated, no spaces)

```
marathon,half,5k,10k,training plan,cycle,period,menstrual,nutrition,macros,women,running,fitness
```

(97 chars including commas)

Notes:
- Don't include "Virra" or words already in app name/subtitle — Apple indexes those automatically
- Avoid Runna/MyFitnessPal/Apple/Garmin (competitor trademarks)
- "women" is high-value: it filters our positioning into search

### What's New — v1.0 release notes

```
Welcome to Virra — the first running app designed around your cycle.

Plans that adjust as your hormones change. Nutrition targets that shift with your phase. Recovery cues that respect what your body actually needs.

This is the first version of something we'll keep building. We'd love to hear what works and what doesn't — find us at virra.app/feedback.
```

### Reviewer notes — App Review information

```
Hi App Review team,

Virra is a running app for women that integrates menstrual cycle data with training and nutrition planning. A few notes that may help:

1. Menstrual cycle tracking is core to the app's value, not optional. The "cycle" tab and related insights are visible to all users. This is health information, not adult content.

2. Apple HealthKit is the primary data source. We use HKObserverQuery to import workouts and HKMenstrualFlow to read period data. We write workouts and nutrition macros back to HealthKit for users who opt in.

3. Subscription: 14-day free trial → recurring monthly or annual. Configured in App Store Connect under the "Virra Pro" subscription group. Restored purchases supported.

4. Demo account: provided in the credentials field. The account has completed onboarding and 4 weeks of sample training + cycle data so reviewers can immediately see the cycle-aware features in action.

5. Permissions: HealthKit (workouts, heart rate variants, exercise minutes, distance, steps, VO₂max, sleep, weight, menstrual flow — read; workouts + nutrition macros — write), Location (**When in Use only — we never request Always**; `UIBackgroundModes: ["location"]` is declared so the run tracker can continue recording GPS while the screen is locked during an active run, which is the standard iOS pattern shared by Strava, Runkeeper, Apple Fitness etc.), Notifications (training and meal reminders that cancel themselves when the action is completed), Camera (for food barcode scanning in the nutrition log). All requested with a clear in-app rationale screen before the iOS dialog. The app does not block on denial — every feature degrades gracefully.

6. Cycle-aware claims are framed as informational and educational, not medical advice. Every article in the Education Library carries a disclaimer footer reminding the reader that Virra is not a substitute for advice from a qualified healthcare professional. A separate "Health & medical" entry in Profile presents the same disclaimer at any time.

7. AI insights: weekly narrative insights are generated via an Anthropic Claude Haiku API call from a Supabase Edge Function. Only aggregated training and cycle metrics are sent — never raw HealthKit readings (no heart rate samples, no GPS traces, no per-meal nutrition rows). The purpose is health management for the user; the data is not used for advertising, marketing, research, or data mining. Anthropic is disclosed as a third-party processor in the App Privacy questionnaire and in the privacy policy.

8. Dashboard activity rings: the Dashboard shows two separate progress tiles — STEPS and EXERCISE MIN — against user-defined daily targets. They are intentionally distinct from Apple's three-ring concentric Activity control: two side-by-side tiles (not concentric), lime + orange colours (not Apple's red/green/blue), and labelled with mono text. Exercise minutes is read from HKQuantityTypeIdentifierAppleExerciseTime, which Apple's HealthKit documentation invites third-party fitness apps to surface.

9. Account deletion: available under Profile → DELETE ACCOUNT. A type-to-confirm modal then calls a Supabase Edge Function which cascade-deletes all user data and removes the auth record. Compliant with 5.1.1(v).

10. Food data is sourced from the Open Food Facts open database (ODbL licence) with attribution visible on the food-search screen and in the in-app Credits surface.

Happy to answer any questions at dickenson.ps@gmail.com.
```

### Privacy questionnaire (ASC App Privacy)

Data collected by Virra:

| Type | Used for | Linked to user | Tracking |
|---|---|---|---|
| Email address | Account creation / sign-in (Supabase Auth) | Yes | No |
| Name | Profile display | Yes | No |
| Health & Fitness — workouts | Core app functionality | Yes (your account) | No |
| Health & Fitness — menstrual | Core app functionality (cycle phase) | Yes | No |
| Health & Fitness — body metrics | Optional, only if Track Weight enabled | Yes | No |
| Precise location | Run tracking (GPS) | Yes | No |
| Purchase history | Subscription management (RevenueCat) | Yes | No |

Tracking: **none.** No third-party advertising. No SDK that follows users across apps/websites. Crash/performance diagnostics are NOT collected today (no diagnostics SDK is wired in) — do not declare them on the App Privacy questionnaire until/unless one is added.

### HealthKit data types — paste-ready enumeration

For the App Privacy questionnaire (Health & Fitness → Specific types) and for the privacy policy. Every type is read or written through a permission the user grants in the iOS HealthKit dialog.

**Read (from Apple Health):**
- Workouts (`HKWorkoutType`) — runs, walks, strength sessions, swims, etc.
- Heart rate (`HKQuantityTypeIdentifierHeartRate`)
- Resting heart rate (`HKQuantityTypeIdentifierRestingHeartRate`)
- Heart rate variability — SDNN (`HKQuantityTypeIdentifierHeartRateVariabilitySDNN`)
- Active energy burned (`HKQuantityTypeIdentifierActiveEnergyBurned`)
- Apple exercise time (`HKQuantityTypeIdentifierAppleExerciseTime`)
- Walking + running distance (`HKQuantityTypeIdentifierDistanceWalkingRunning`)
- Step count (`HKQuantityTypeIdentifierStepCount`)
- VO₂ max (`HKQuantityTypeIdentifierVO2Max`)
- Sleep analysis (`HKCategoryTypeIdentifierSleepAnalysis`)
- Body mass / weight (`HKQuantityTypeIdentifierBodyMass`)
- Menstrual flow (`HKCategoryTypeIdentifierMenstrualFlow`) — via custom Expo module

**Write (to Apple Health):**
- Workouts (`HKWorkoutType`) — from the in-app run tracker and manual activity log
- Dietary energy (`HKQuantityTypeIdentifierDietaryEnergyConsumed`)
- Dietary carbohydrates (`HKQuantityTypeIdentifierDietaryCarbohydrates`)
- Dietary protein (`HKQuantityTypeIdentifierDietaryProtein`)
- Dietary fat (`HKQuantityTypeIdentifierDietaryFatTotal`)
- Dietary fibre (`HKQuantityTypeIdentifierDietaryFiber`)

### Third-party processors (paste-ready)

For the App Privacy questionnaire's "Data Used to Track You" / "Data Linked to You" disclosures and for the privacy policy.

| Processor | What is sent | Purpose | Tracking? |
|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage + Edge Functions) | Email, name, avatar, cycle logs, training plans, planned sessions, activities, nutrition entries, insights cache, subscription record | Backend for the app — encrypted in transit (TLS) and at rest | No |
| **RevenueCat** | Apple receipt + product identifier + anonymised customer ID | Subscription entitlement check | No |
| **Anthropic (Claude Haiku)** | **Aggregate** training and cycle metrics only — weekly km, adherence %, average energy/mood from check-ins, current cycle phase, upcoming session count. Never raw heart rate, never GPS traces, never per-meal entries | Generate weekly narrative insight text shown only to the user themselves | No |
| **Apple HealthKit** | (on-device only; not transmitted to Virra's servers in raw form) | Source of workout, heart rate, distance, sleep, weight, menstrual data | No |
| **Open Food Facts** | Outbound barcode lookup (a 13-digit number); no personal data sent | Resolve a barcode to food + macros | No |

None of the above are used for advertising, marketing, or use-based data mining.

### Category

- **Primary**: Health & Fitness
- **Secondary**: Sports

### Age rating

- Likely **4+** with no objectionable content
- Apple's questionnaire flags: Medical/Treatment Information → "Infrequent/Mild" (we discuss cycle phases and physiology, but in an educational, non-graphic way)
- No: violence, sexual content, mature themes, alcohol/tobacco, gambling, horror

---

## What I need from you to push this through

In rough priority order:

1. **Privacy Policy + Support URLs** — these are blocking. Even a basic privacy policy page at `virra.app/privacy` is enough. Support can be a mailto: link or a single page with a contact form.
2. **Subscription pricing decision** — monthly + annual tiers, with target pricing. ASC needs the products created and approved before the build can ship.
3. **RevenueCat key swap** — once subscription products are live in ASC, replace the `test_` RC key in `eas.json` with the production `appl_` key.
4. **Demo account credentials** — I can set this up once we agree what state the account should be in (completed onboarding, 4 weeks of synthetic data, active subscription).
5. **Screenshots** — these need to be captured from a built device or simulator. Probably 5-8 screens covering: onboarding, dashboard, training plan, nutrition, cycle settings, insights, paywall.
6. **Warning triage decision** — review the 541 Xcode warnings, separate our code from pod noise, fix or document the our-code ones.

I can help draft any of this. The two things that genuinely need your decisions are pricing and the privacy policy URL.

---

## Suggested order of operations

1. **This week**: Lock the copy above (or rewrite to your voice). Decide on subscription pricing. Draft privacy policy + push to virra.app.
2. **Next**: ASC setup — subscription products, app metadata, screenshots. RevenueCat key swap.
3. **Then**: Demo account creation, reviewer notes, warning triage.
4. **Final**: `eas build --profile production` + `eas submit --latest` + submit for review.

Review timelines as of 2026: typically 24-48 hours for first response, longer if rejection round-trips. Plan for 3-7 days from submission to live in worst case.
