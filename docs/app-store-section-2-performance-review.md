# Apple App Store Review Guideline Section 2 — Performance — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#performance (fetched live)
**Reviewer:** Claude Code

---

## Executive Summary

Section 2 is mostly a checklist exercise for Virra. The two **submission blockers** are: (1) the **RevenueCat IAP integration still uses a test key** (`test_NVQMjICFyysKisTqoIiabOTJRfs`) in both `eas.json` profiles and `.env.local`, which means the paywall in any reviewer-facing build will not surface real, App Store-Connect-defined subscription products — this violates 2.1(b) "in-app purchases must be complete, up-to-date, visible to the reviewer and functional"; and (2) a **demo account is required by 2.1(a)** for login-gated apps and is still outstanding. Metadata clauses (2.3.x) are all addressable via the draft copy in `docs/app-store-submission.md` — none are non-compliant in principle, but submission readiness requires screenshots, finalized description, and age-rating questionnaire. Hardware (2.4) and Software Requirements (2.5) are clean: Expo Updates / OTA code download is not enabled, no Face ID misuse, no analytics SDKs, no ads, no Siri Intents, no Matter, no CallKit. Background modes are minimal and justified for their intended purposes.

---

## Sub-clause × Virra Compliance Matrix

### 2.1 App Completeness

**Quote (verbatim):**
> Submissions to App Review … should be final versions with all necessary metadata and fully functional URLs included; placeholder text, empty websites, and other temporary content should be scrubbed before submission. Make sure your app has been tested on-device for bugs and stability before you submit it, and include demo account info (and turn on your back-end service!) if your app includes a login. … We will reject incomplete app bundles and binaries that crash or exhibit obvious technical problems.
> If you offer in-app purchases in your app, make sure they are complete, up-to-date, visible to the reviewer and functional. If any configured in-app purchase items cannot be found or reviewed in your app, explain the reason in your review notes.

**Virra status:** ❌ BLOCKER (two sub-issues)

**Sub-issue A — RevenueCat test key in production builds:**
- `mobile/eas.json` lines 25 and 35: both `preview` and `production` EAS build profiles inject `EXPO_PUBLIC_REVENUECAT_IOS_KEY=test_NVQMjICFyysKisTqoIiabOTJRfs`.
- `mobile/.env.local` line 4: same test key.
- A build shipped to App Review with the test key will fail to fetch real App-Store-Connect subscription products. The paywall will either be empty, fall back to placeholder offerings, or surface RevenueCat's sandbox-only items — all of which trip 2.1(b).
- The submission checklist already tracks this (`docs/app-store-submission.md` line 41: *"RevenueCat: link products + offerings, update `EXPO_PUBLIC_REVENUECAT_IOS_KEY` from test_ key to appl_ key"*) and line 42: *"Replace test paywall product fetch with real"*.

**Action needed (A):**
1. Create the `Virra Pro` subscription group in App Store Connect with monthly + annual tiers, configure 14-day free trial.
2. Link products + offerings in RevenueCat dashboard.
3. Replace the `test_` key with the production `appl_` key in `eas.json` (both profiles) and `.env.local`.
4. Any hardcoded test product IDs in the paywall component need swapping to the real product identifiers — verify in `mobile/app/(auth)/paywall.tsx` once the swap is done.

**Sub-issue B — Demo account outstanding:**
- `docs/app-store-submission.md` Phase 5 line 45: *"Demo account credentials (an account with onboarding completed + sample data)"* — unchecked.
- The reviewer-notes draft (line 178) promises 4 weeks of sample training + cycle data; this state needs to actually exist on a real account before submission.

**Action needed (B):**
1. Create a Supabase account dedicated to App Review (e.g. `appreview@virra.app` or similar).
2. Complete onboarding (cycle profile, goals, profile fields).
3. Seed 4 weeks of synthetic activities, cycle logs, food entries, planned sessions, and at least one completed Insight via `generate-insights`. A SQL seed script in `mobile/supabase/seeds/` would make this reproducible across re-submissions.
4. Activate a sandbox subscription (or use RevenueCat's "promotional offer" entitlement) so reviewers can verify the post-trial state.
5. Enter the credentials into App Store Connect → Sign-In Information.

**Otherwise:** No placeholder text was found across `mobile/app/` and `mobile/src/`. All input-placeholder strings are legitimate UI affordances. No "Coming soon" copy in any user-visible surface. The app is functionally complete for v1.0 scope.

---

### 2.2 Beta Testing

**Quote (verbatim):**
> Demos, betas, and trial versions of your app don't belong on the App Store – use TestFlight instead.

**Virra status:** ✅ Compliant (and the submission plan respects this)

**Evidence:** `docs/app-store-submission.md` Phase 6 line 53: *"Crash-free verified on TestFlight (internal build first)"* — internal TestFlight is the planned validation gate, separate from the App Store production submission. Nothing in the codebase implies a "beta" or "preview" label for end users.

---

### 2.3 Accurate Metadata (and 2.3.1–2.3.13)

**Quote (verbatim):** *(see fetched guideline; all sub-clauses included)*

**Virra status:** ⚠ Submission-readiness gap (no non-compliance; checklist items outstanding)

**Sub-clause findings:**

**2.3.1 Hidden features / misleading marketing:** ✅ No hidden, dormant, or undocumented features. Subscription paywall is shown explicitly with trial terms. AI-derived insights are not marketed as anything other than what they are. Reviewer notes (`docs/app-store-submission.md` lines 168–186) describe app functionality with specificity.

**2.3.2 IAP description visibility:** ⚠ The current description draft (`docs/app-store-submission.md` lines 95–139) includes a SUBSCRIPTION section. ✅ Good. But the screenshots are not yet captured and there is no IAP promotional content configured in App Store Connect. Action: ensure at least one screenshot shows the subscription benefit, and confirm SKPaymentTransactionObserver is correctly wired via RevenueCat's `Purchases.configure()` (RC handles this internally — verify by reading `mobile/src/lib/revenuecat.ts` or equivalent during submission prep).

**2.3.3 Screenshots show app in use:** ❌ Outstanding. Submission doc Phase 2 lines 23–26 lists screenshot requirements; none captured. Must be device screenshots showing dashboard, training plan, nutrition, cycle, insights, paywall — not splash or login. Min 5, max 10.

**2.3.4 Previews:** Optional. Submission doc notes "App preview video (optional, recommended for retention)" — defer.

**2.3.5 Category:** ✅ Health & Fitness (primary), Sports (secondary). Submission doc line 208–209.

**2.3.6 Age rating:** ✅ 4+ with "Medical/Treatment Information → Infrequent/Mild." Submission doc lines 213–215. Submission doc note: confirm during the ASC questionnaire that menstrual-cycle content is classified as "Health" not "Adult/Sexual" — Apple has previously flagged this for cycle apps.

**2.3.7 App name + keywords:** ✅ Draft `Virra: Run with Your Cycle` (28 chars, under 30). Keywords avoid competitor trademarks (Runna, MyFitnessPal). Distinctive. Submission doc lines 70–77, 145–149.

**2.3.8 Metadata 4+ appropriate:** ✅ Draft copy reviewed — no graphic depictions, no terms reserved for Kids Category, no implied adult content. Icon set already shipped (`docs/app-store-submission.md` line 27).

**2.3.9 Rights to materials:** ✅ All icons, illustrations, and copy are first-party. Avatar uploads use system ImagePicker and the user's own photos.

**2.3.10 No other-platform references:** ⚠ Mild flag. Draft description (line 137) says *"Built in the UK. Made for runners. Made with care."* — fine. The wider description and `docs/app-store-submission.md` line 173 reference "Apple Watch", "Apple Health", "HealthKit", "HKObserverQuery", "HKMenstrualFlow" — all Apple platforms, appropriate. Mentions of "Garmin / Wahoo" appear in `CLAUDE.md` lines 75 (architecture decisions) but **not in the user-facing description draft** — verify they stay out of the App Store description. Garmin/Wahoo are hardware brands, not mobile platforms or alternative marketplaces, so a mention would not strictly violate 2.3.10, but Apple reviewers prefer descriptions to focus on Apple-platform integrations. The current draft is already clean.

**2.3.11 Pre-order:** ✅ Not applicable. Standard release.

**2.3.12 What's New text:** ✅ Draft v1.0 release notes provided (`docs/app-store-submission.md` lines 158–164). Acceptable.

**2.3.13 In-App Events:** ✅ Not applicable. Virra has no IAEs configured.

**Action needed (2.3 overall):** Complete the submission checklist items in Phase 1 and Phase 2 of `docs/app-store-submission.md`. None of the draft copy is non-compliant; the work is capture-and-upload, not redraft.

---

### 2.4 Hardware Compatibility

**Quote (verbatim):** *(see fetched guideline; 2.4.1–2.4.5)*

**Virra status:** ✅ Compliant (with one soft note on iPad support)

**2.4.1 iPad support:** ⚠ Soft. `mobile/app.json` line 16: `"supportsTablet": false`. The clause says "iPhone apps **should** run on iPad whenever possible" — a recommendation, not a requirement. Reviewers may comment but will not reject. Acceptable for v1.

**2.4.2 Power efficiency:**
- ✅ No cryptocurrency mining, no background loops, no device-damaging behavior.
- ✅ Run-tracker GPS is foreground-active during a run; the user expects the screen to be on. Battery drain is justified by core functionality.
- ✅ HealthKit background delivery (`com.apple.developer.healthkit.background-delivery: true`) processes observer-queue events in short bursts — not a battery concern.
- ✅ Background "location" mode (`UIBackgroundModes: ["location"]`) is only invoked during an active run; not a continuous always-on GPS listener.

**2.4.3 Apple TV controllers:** ✅ Not applicable.

**2.4.4 No restart prompts / disabling system settings:** ✅ Compliant. No prompts to disable Wi-Fi, turn off security features, or restart device. Permission denial paths gently route users to iOS Settings without coercion (verified in 5.1.1 review).

**2.4.5 Mac App Store specifics:** ✅ Not applicable — iOS-only submission.

---

### 2.5 Software Requirements

**Quote (verbatim):** *(see fetched guideline; 2.5.1–2.5.18)*

**Virra status:** ✅ Compliant

**Sub-clause findings:**

**2.5.1 Public APIs + correct integration:** ✅
- HealthKit is used for health and fitness purposes — read workouts, HR, HRV, menstrual flow; write workouts + nutrition macros. Aligns with the clause "HealthKit should be used for health and fitness purposes and integrate with the Health app."
- Expo SDK 54 (current), React Native bare workflow, no deprecated APIs in core paths.
- `mcp__supabase` is server-side tooling, not bundled into the app.

**2.5.2 No code download / OTA execution:** ✅
- No `expo-updates` plugin configured in `app.json` (grep returned no hits).
- No remote-bundle loading.
- App is fully self-contained in its bundle.

**2.5.3 No malicious code:** ✅ No virus/disruptive behavior.

**2.5.4 Background services for intended purposes:** ✅
- `UIBackgroundModes: ["location"]` — used by `mobile/app/(app)/run.tsx` during active run tracking. Legitimate. Background-permission request was added in commit `be509ca` so the declared mode now matches the actual entitlement request.
- `com.apple.developer.healthkit.background-delivery: true` — used by the HKObserverQuery for workout import. Legitimate.
- No declared `audio`, `voip`, `fetch`, `processing`, or other modes.

**2.5.5 IPv6:** ✅ All backend dependencies (Supabase, Anthropic API, RevenueCat) support IPv6 dual-stack.

**2.5.6 WebKit:** ✅ Not applicable — no in-app web browser. RevenueCat's `managementURL` and any future privacy/support links open via the system browser (Safari), which is the correct pattern.

**2.5.7 (omitted):** —

**2.5.8 No alternate home screen:** ✅ Not applicable.

**2.5.9 Standard switches respected:** ✅ Compliant. No mute-switch overrides, no volume manipulation.

**2.5.10 (omitted):** —

**2.5.11 SiriKit and Shortcuts:** ✅ Not applicable. No Siri intents declared in v1.0.

**2.5.12 CallKit / SMS / spam:** ✅ Not applicable.

**2.5.13 Facial recognition:** ✅ Not applicable. No Face ID, no ARKit-based recognition. Auth is email OTP + Apple Sign-In tokens.

**2.5.14 Recording consent + visual indication:** ✅
- Camera (barcode scanner only) requests permission via `Camera.requestCameraPermissionsAsync()` before any capture (`mobile/src/lib/permissionsConfig.ts` line 115).
- No microphone access. No screen recording. No background logging of user activity beyond what HealthKit and the in-app Run Tracker already disclose.

**2.5.15 Files app integration:** ✅ Not applicable. No file picker.

**2.5.16 Widgets / extensions / notifications:** ✅
- No widgets, extensions, or App Clips.
- Push notifications are configured (`expo-notifications`) for training reminders, meal reminders, check-in, weekly plan. All directly tied to in-app content (cancellation-on-action logic in `mobile/src/lib/notifications.ts`).

**2.5.17 Matter:** ✅ Not applicable.

**2.5.18 Advertising:** ✅ No ads. No analytics SDKs. No behavioral targeting. No third-party trackers — confirmed via dependency scan in Section 1 review (1.6).

---

## Blockers to Fix Before Submission

| # | Blocker | Clause | File(s) to Change | Priority |
|---|---------|--------|-------------------|----------|
| 1 | RevenueCat test key in `eas.json` (both profiles) and `.env.local` — review build will not find real subscription products | 2.1(b) | `mobile/eas.json` lines 25 + 35; `mobile/.env.local` line 4 | P0 |
| 2 | Demo account with seeded data does not exist | 2.1(a) | Create account; optional seed script in `mobile/supabase/seeds/` | P0 |
| 3 | Subscription products not yet created in ASC | 2.1(b) / 2.3.2 | App Store Connect → Subscriptions → Virra Pro group | P0 |
| 4 | Screenshots not captured | 2.3.3 | Device or simulator captures of 6 core surfaces | P0 |

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R-2.4.1 | Consider enabling `supportsTablet: true` with light iPad layout work post-launch | 2.4.1 | Soft Apple recommendation; meaningful download-base expansion |
| R-2.3.6 | Pre-verify in ASC age questionnaire that menstrual content is classified Health (not Sexual/Adult) | 2.3.6 | Apple has previously misflagged cycle apps to 17+; pre-clear during the questionnaire to keep 4+ rating |
| R-2.3.10 | Confirm "Garmin", "Wahoo", and any non-Apple platform names stay out of the App Store description | 2.3.10 | Mild reviewer-friction reduction; current draft is already clean |
| R-2.5.4 | When background location is invoked during a run, ensure a visible iOS status-bar indicator is present (the blue pill) — verify on device | 2.5.4 / 2.5.14 | Confirms user awareness of background tracking; required by iOS UI but worth verifying |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/eas.json` | 25, 35 | RevenueCat test key in both EAS profiles |
| `mobile/.env.local` | 4 | RevenueCat test key in local env |
| `mobile/app.json` | 16 | `supportsTablet: false` (acceptable; soft Apple preference) |
| `mobile/app.json` | 29 | `UIBackgroundModes: ["location"]` (now matched by background permission request post-`be509ca`) |
| `mobile/app.json` | 33 | `healthkit.background-delivery: true` (justified by HKObserverQuery workout import) |
| `mobile/app/(auth)/paywall.tsx` | tbc | Verify product IDs match the real ASC subscription identifiers after RC swap |
| `docs/app-store-submission.md` | 41, 42, 45 | Demo account + RC key swap + paywall fetch all flagged outstanding |
