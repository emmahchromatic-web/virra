# Apple App Store Review Guideline 5.1.1 — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#5.1.1 (fetched live)
**Reviewer:** Claude Code

---

## Executive Summary

Virra is broadly well-architected for App Store compliance but has **two blockers** that must be resolved before submission: (1) a Privacy Policy URL does not yet exist — it is required both in App Store Connect metadata and within the app, and (2) there is no in-app account deletion flow, which Apple mandates for any app that supports account creation. A third significant risk is the "background location" configuration: the app declares `UIBackgroundModes: ["location"]` and the `NSLocationAlwaysAndWhenInUseUsageDescription` key, but never actually requests the "always" permission level in code — this mismatch will draw scrutiny and the reviewer notes must explain it. The camera usage description is deceptive in the current build (barcode scanning is deferred to post-launch) and must be corrected. Everything else — HealthKit specificity, menstrual data handling, permission denial paths, consent flows, and the Haiku AI integration — is either compliant or requires only low-effort documentation fixes.

---

## Sub-clause × Virra Compliance Matrix

### 5.1.1(i) — Privacy Policies

**Quote (verbatim):**
> All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner. The privacy policy must clearly and explicitly: Identify what data, if any, the app/service collects, how it collects that data, and all uses of that data. Confirm that any third party with whom an app shares user data ... will provide the same or equal protection of user data as stated in the app's privacy policy and required by these Guidelines. Explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion of the user's data.

**Virra status:** ❌ BLOCKER

**Evidence:**
- `docs/app-store-submission.md` line 17: `- [ ] Privacy Policy URL ⚠ required` — explicitly marked as incomplete.
- `docs/app-store-submission.md` lines 222–224: "Privacy Policy + Support URLs — these are blocking. Even a basic privacy policy page at `virra.app/privacy` is enough."
- No privacy policy link exists anywhere in the app UI. Profile screen (`app/(app)/(tabs)/profile.tsx`) has no privacy policy row. Settings screen (`app/(app)/settings.tsx`) has no link.

**Action needed:**
1. Publish a privacy policy at `virra.app/privacy` before submission. The policy must cover: Supabase Auth (email, Apple ID token), HealthKit data categories (workouts, heart rate, HRV, sleep, weight, menstrual flow), precise location, RevenueCat purchase history, Anthropic Haiku (training context sent server-side — see 5.1.1(ii) AI note below), Supabase Storage (avatar images). It must name RevenueCat and Anthropic as third-party processors and state data retention and deletion request process.
2. Add a "Privacy Policy" tappable row in the Profile screen (`app/(app)/(tabs)/profile.tsx`) that opens `virra.app/privacy` in a browser. This satisfies "within the app in an easily accessible manner."

---

### 5.1.1(ii) — Permission (Consent)

**Quote (verbatim):**
> Apps that collect user or usage data must secure user consent for the collection, even if such data is considered to be anonymous at the time of or immediately following collection. Paid functionality must not be dependent on or require a user to grant access to this data. Apps must also provide the customer with an easily accessible and understandable way to withdraw consent. Ensure your purpose strings clearly and completely describe your use of the data.

**Virra status:** ⚠ Needs attention (three sub-issues)

**Evidence and sub-issues:**

**Sub-issue A — Camera usage description is deceptive:**
- `app.json` line 27: `"NSCameraUsageDescription": "Virra uses the camera to scan food barcodes for your nutrition log."`
- `app.json` line 67 (expo-camera plugin): `"cameraPermission": "Virra uses the camera to scan food barcodes."`
- `CLAUDE.md` and `docs/app-store-submission.md` both confirm that barcode scanning is deferred to post-launch.
- `permissionsConfig.ts` line 44–49: Camera is listed as `optional: true` and shown during onboarding with the same "scan barcodes" framing.
- Per guideline: purpose strings must "clearly and completely describe your use of the data." Requesting camera access for a feature that doesn't exist in the shipping build is a misrepresentation. Apple reviewers can verify the camera entitlement is used during review; if they find no barcode scanner, this will be flagged.

**Action needed (A):** Either (a) remove the camera permission entirely from the onboarding flow and `app.json` until barcode scanning ships, or (b) ship a functional barcode scanner at launch. Option (a) is the safe path. Remove `expo-camera` plugin from `app.json`, remove `camera` from the `PERMISSIONS` array in `permissionsConfig.ts` (lines 43–49), and remove the camera-related permission step from onboarding.

**Sub-issue B — No "withdraw consent" path for HealthKit:**
- `permissionsConfig.ts` lines 53–82: HealthKit is initialized and permissions are requested. There is no in-app mechanism to revoke HealthKit access (the iOS Settings > Health app is the system path).
- The onboarding "WHY THIS MATTERS" for Health (line 26) says "Your data never leaves your device. Virra never uploads or sells health information." — this is accurate for on-device HK data but incomplete: training context (activity count, weekly km, adherence %) IS sent to Anthropic via the `generate-insights` Edge Function (`supabase/functions/generate-insights/index.ts` lines 181–219).

**Action needed (B):** Add a note to the privacy policy and (optionally) the in-app permissions screen clarifying that aggregate training and cycle metrics are sent to Anthropic's API to generate insights. The raw HealthKit data fields (heart rate, splits, GPS) are NOT forwarded — only the pre-aggregated metrics the Edge Function derives (e.g., `weekly_km`, `adherence_pct`, `avg_energy_7d`). This distinction matters for the privacy policy and for reviewer notes.

**Sub-issue C — Paid functionality gating:**
- `app/(app)/_layout.tsx` lines 55–67: If RevenueCat reports the subscription as expired, the user is immediately redirected to the paywall. All app features are behind the subscription wall — which is allowed.
- HealthKit, Location, and Notifications are all marked `optional: false` in `permissionsConfig.ts` (lines 24, 32, 40). The guideline states "Paid functionality must not be dependent on or require a user to grant access to this data." The subscription paywall appears before the permissions screen (auth flow → paywall → onboarding including permissions). However, since the permissions are requested to support core functionality (not to unlock paid tiers), this is defensible. No concern provided the privacy policy is honest that these are required for app operation.

---

### 5.1.1(iii) — Data Minimization

**Quote (verbatim):**
> Apps should only request access to data relevant to the core functionality of the app and should only collect and use data that is required to accomplish the relevant task. Where possible, use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts.

**Virra status:** ✅ Compliant (with camera caveat from sub-clause ii above)

**Evidence:**
- HealthKit permissions (`permissionsConfig.ts` lines 58–78): reads HeartRate, RestingHeartRate, HRV, ActiveEnergyBurned, AppleExerciseTime, DistanceWalkingRunning, Steps, Vo2Max, SleepAnalysis, Weight, Workout — all directly relevant to cycle-aware training and nutrition. Writes Workout, EnergyConsumed, Carbohydrates, Protein, FatTotal, Fiber — all directly relevant to nutrition logging.
- Menstrual flow is read via a separate custom module (`@/modules/menstrual-health` — called at `permissionsConfig.ts` line 103–105), which is the correct pattern for sensitive HK types.
- No Contacts, Photos library, Microphone, or Face ID permissions requested.
- Avatar upload uses `ImagePicker.launchImageLibraryAsync` with `mediaTypes: 'images'` (profile.tsx line 114–119) — correctly scoped to photos only, not full Photos library.

**Remaining risk:** MenstrualFlow read via `requestMenstrualPermission()` (custom Expo module). Apple applies heightened scrutiny to HK menstrual data. The HealthKit usage description (`app.json` line 23) says "Virra uses HealthKit to sync your workouts and heart rate data to personalise your training and nutrition." This does not mention menstrual data — it is incomplete. Apple's HK review specifically looks for menstrual data declarations. See dedicated flag section below.

---

### 5.1.1(iv) — Access

**Quote (verbatim):**
> Apps must respect the user's permission settings and not attempt to manipulate, trick, or force people to consent to unnecessary data access. For example, apps that include the ability to post photos to a social network must not also require microphone access before allowing the user to upload photos. Where possible, provide alternative solutions for users who don't grant consent. For example, if a user declines to share Location, offer the ability to manually enter an address.

**Virra status:** ⚠ Needs attention

**Evidence — denial paths:**

**Location denial:** `run.tsx` line 94–96: `requestForegroundPermissionsAsync()` is called when the run tracker starts. If denied, an `Alert.alert('Location needed', 'Enable location access to track your run.')` fires. This is acceptable — it tells the user what they lose (run tracking) without blocking all app use. Watch-based data still syncs. This aligns with the `permissionsConfig.ts` `why` text: "Without this, Virra can't track runs live. Your Watch data still syncs automatically." Compliant.

**HealthKit denial:** If the user denies HealthKit at the iOS dialog, `initHealthKitForSession()` (`permissionsConfig.ts` line 86–96) silently catches the error and the app continues. `markPermissionsGranted()` is called at `permissions.tsx` line 25 after `requestPermission(current.id)` resolves — the flag is set regardless of whether the user actually granted the permission (because iOS returns the callback even on denial). The app then proceeds. This is functionally fine — the HealthKit features degrade gracefully — but the UX doesn't communicate to the user that HealthKit was denied. Not a compliance blocker but worth noting in reviewer notes.

**Notifications denial:** Same pattern — `Notifications.requestPermissionsAsync()` resolves regardless of denial. App proceeds. No crash.

**Camera denial:** Same — `Camera.requestCameraPermissionsAsync()` resolves regardless. Since the barcode feature doesn't exist yet, no functional impact.

**The "force" concern:** Location, HealthKit, and Notifications are all marked `optional: false` in `permissionsConfig.ts`. The onboarding flow presents them sequentially with a single "CONTINUE" button. There is no explicit "Skip" button for required permissions. The guideline says "provide alternative solutions for users who don't grant consent" — the workaround here is that iOS always gives the user the ability to deny the permission at the system dialog, and the `optional: false` flag in Virra's config only affects how the permission is labeled to the user, not whether iOS respects a denial. The app does not crash on denial. This is borderline — Apple has in the past rejected apps that present a single-CTA permission screen with no skip option, even if denial is technically possible via the system dialog.

**Action needed:** For completeness and to avoid rejection risk, consider adding a "Not now" or "Skip" secondary CTA below "CONTINUE" for HealthKit and Location — these would advance the user past the step without requesting. The `optional: true` camera permission already implies this pattern should be applied consistently. The reviewer may not flag this, but it removes ambiguity.

---

### 5.1.1(v) — Account Sign-In

**Quote (verbatim):**
> If your app doesn't include significant account-based features, let people use it without a login. If your app supports account creation, you must also offer account deletion within the app. Apps may not require users to enter personal information to function, except when directly relevant to the core functionality of the app or required by law. If your core app functionality is not related to a specific social network... you must provide access without a login or via another mechanism. Pulling basic profile information, sharing to the social network, or inviting friends to use the app are not considered core app functionality. The app must also include a mechanism to revoke social network credentials and disable data access between the app and social network from within the app. An app may not store credentials or tokens to social networks off of the device and may only use such credentials or tokens to directly connect to the social network from the app itself while the app is in use.

**Virra status:** ❌ BLOCKER (account deletion absent)

**Evidence:**
- Virra requires email or Apple Sign-In to function (`app/(auth)/sign-in.tsx`, `app/(auth)/paywall.tsx`). The guideline permits account requirements "when directly relevant to the core functionality." Cycle history, training plan sync, and cross-device nutrition data are all account-dependent. This is defensible.
- `app/(app)/(tabs)/profile.tsx` lines 298–302: "Sign out" button exists via `handleSignOut()` — ✅ sign-out is present.
- **Account deletion is absent.** There is no "Delete Account" button anywhere in the Profile, Settings, or any other screen. The guideline is explicit: "If your app supports account creation, you must also offer account deletion within the app." Apple added this requirement in 2022 and enforces it strictly. This is a guaranteed rejection reason.
- Apple's own support page (https://developer.apple.com/support/offering-account-deletion-in-your-app/) specifies that account deletion must: (a) delete the account and associated data, not just deactivate it; (b) be accessible from within the app; (c) for apps using Sign in with Apple, revoke Apple ID tokens.

**Action needed:**
1. Add a "Delete account" button to the Profile screen or Settings screen.
2. Implement a Supabase Edge Function (or RPC) that: deletes the user's data from all tables (`activities`, `nutrition_logs`, `cycle_logs`, `symptom_logs`, `planned_sessions`, `training_blocks`, `user_plans`, `food_entries`, `insights_cache`, `user_profiles`, `fitness_assessments`, `subscriptions`), revokes the Apple ID token via the Apple REST API (if the user signed in with Apple), and calls `supabase.auth.admin.deleteUser(userId)` to remove the auth record.
3. Add a confirmation dialog before deletion ("This will permanently delete your account and all data. This cannot be undone.")
4. After deletion, route to `/(auth)` sign-in screen.

---

### 5.1.1(vi) — Developer Identity (Surreptitious Data Discovery)

**Quote (verbatim):**
> Developers that use their apps to surreptitiously discover passwords or other private data will be removed from the Apple Developer Program.

**Virra status:** ✅ Compliant

**Evidence:** No password harvesting, keylogger behavior, or clipboard reading. Auth is handled via Supabase Auth (email OTP or Apple Sign-In tokens). No evidence of any private data access beyond what is explicitly requested.

---

### 5.1.1(vii) — SafariViewController

**Quote (verbatim):**
> SafariViewController must be used to visibly present information to users; the controller may not be hidden or obscured by other views or layers. Additionally, an app may not use SafariViewController to track users without their knowledge and consent.

**Virra status:** ✅ Compliant

**Evidence:** No SFSafariViewController usage found in the codebase. RevenueCat's management URL (used in the subscription screen) opens via the system browser. No evidence of hidden web views.

---

### 5.1.1(viii) — Compiling Personal Information from Non-User Sources

**Quote (verbatim):**
> Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent, even public databases, are not permitted on the App Store or alternative distribution.

**Virra status:** ✅ Compliant

**Evidence:** All user data originates from: the user's own HealthKit (with explicit permission), the user's direct input in onboarding and log screens, or RevenueCat subscription status tied to the user's own purchases. No data is scraped or aggregated from external sources about the user.

---

### 5.1.1(ix) — Regulated Fields / Legal Entity

**Quote (verbatim):**
> Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer.

**Virra status:** ⚠ Monitor

**Evidence:** Virra handles menstrual cycle data, heart rate, weight, and sleep — all sensitive health data. The app is currently submitted under individual developer account `dickenson.ps@gmail.com` (`app.json` line 79: `"owner": "paul-dickenson"`). The guideline says "should" (not "must") for healthcare-adjacent apps — this is a softer requirement than other clauses. However, Apple has discretion here.

**Action needed:** This is not a blocker for a fitness/running app that does not provide medical diagnoses or treatments. The reviewer notes already include appropriate disclaimers ("cycle-aware claims are framed as informational and educational, not medical advice" — `docs/app-store-submission.md` lines 176–177). If Apple pushes back, the path is to create a legal entity (Ltd company, sole trader registration) and re-enroll in the Apple Developer Program under it. Low probability of rejection on this clause alone for a fitness app.

---

### 5.1.1(x) — Optional Contact Information

**Quote (verbatim):**
> Apps may request basic contact information (such as name and email address) so long as the request is optional for the user, features and services are not conditional on providing the information, and it complies with all other provisions of these guidelines, including limitations on collecting information from kids.

**Virra status:** ✅ Compliant

**Evidence:** Email is required for account creation (authentication), which is directly tied to the core functionality of cycle history and plan sync — this is a covered exception. Name (first/last) is collected in onboarding profile step but is not required for any feature to function. The profile display falls back to "Runner" if no name is entered (`profile.tsx` line 91).

---

## Specific Flags

### HealthKit / Menstrual Data

**Risk level: ⚠ Medium — likely to get reviewer questions, not a guaranteed rejection**

The `NSHealthShareUsageDescription` in `app.json` (line 23) reads: *"Virra uses HealthKit to sync your workouts and heart rate data to personalise your training and nutrition."*

This description omits menstrual data. Apple's HealthKit review guidelines require that any usage description that covers menstrual flow (HKCategoryTypeIdentifierMenstrualFlow) explicitly mention it. The menstrual flow permission is requested at `permissionsConfig.ts` line 103–105 via `requestMenstrualPermission()` from the custom `@/modules/menstrual-health` module.

**Action needed:** Update `NSHealthShareUsageDescription` in `app.json` to: *"Virra uses HealthKit to read your workouts, heart rate, and menstrual cycle data to personalise your training plan and nutrition targets to your cycle phase."*

Also note: the MEMORY.md (`project_healthkit_library.md`) flags that `react-native-health` lacks MenstrualFlow and the plan is to switch to `@kingstinct/react-native-healthkit`. The current code uses a custom Expo module for this. Make sure the custom module is properly implemented and the permission is actually being granted by the system before submission — a failed permission request for menstrual data would cause the cycle phase engine to produce inaccurate results, which is the core value proposition.

---

### Permission Denial Paths

**Risk level: ✅ Low — app degrades gracefully**

- **HealthKit denied:** App continues. HealthKit features (workout sync, activity import, HRV, step count) are unavailable but the app does not crash. Manual activity log remains functional. Phase engine can still run on user-entered cycle data.
- **Location denied:** Alert fires in run tracker ("Enable location access to track your run."). Watch-based run data still syncs via HealthKit. App continues.
- **Notifications denied:** App continues. No features are blocked — notifications are advisory.
- **Camera denied:** No impact — barcode scanner doesn't exist in current build (see camera action item above).

**Concern:** The permission screens in `permissions.tsx` and `re-permissions.tsx` offer only a "CONTINUE" button. There is no visible "Not now" / "Skip" path for HealthKit, Location, or Notifications. The user CAN deny at the iOS system dialog, but Virra's UI implies these are mandatory. Given that `optional: false` is set on three of the four permissions, Apple could ask why there is no alternative path. **Low probability of rejection, but consider adding a skip/not-now secondary action.**

---

### Account Requirement (5.1.1(v) defensibility)

**Risk level: ✅ Low risk of rejection — account requirement is defensible**

Virra requires account creation before accessing any features. The guideline says apps may require accounts when "directly relevant to the core functionality." Virra's core value proposition — persistent cycle history correlated with training data over weeks and months — is meaningfully account-dependent. Cross-device sync and cloud backup of 12-week training plans are genuine features that require server-side storage. The reviewer notes (`docs/app-store-submission.md` lines 168–186) explain this well.

**Action needed:** None for the account requirement itself. However, the account deletion blocker must be resolved (see 5.1.1(v) above).

---

### AI Features (Haiku / Anthropic)

**Risk level: ⚠ Low-medium — disclosure gap, not a blocker yet**

The `generate-insights` Edge Function (`supabase/functions/generate-insights/index.ts` lines 181–219) sends user-derived training context to Anthropic's Claude Haiku API. The data sent includes: cycle phase, day of cycle, adherence percentage, weekly km, activity count, upcoming sessions, upcoming events, average energy and mood scores, nutrition log count. This is **derived aggregate data**, not raw HealthKit readings — but it is still personally identifiable training behaviour sent to a third party.

Under 5.1.1(i), the privacy policy must disclose this. Under 5.1.1(ii), purpose strings must describe data use. The current onboarding permission screen for Health (`permissionsConfig.ts` line 26) says: "Your data never leaves your device. Virra never uploads or sells health information." **This statement is technically incorrect** — aggregate training context does leave the device (via the Edge Function to Anthropic). The data is not sold, but it is transmitted.

The deferred "describe-a-meal" Phase H AI feature (photo → Claude Vision) would create a stronger disclosure requirement. That is not yet shipped.

**Action needed:**
1. Update the "WHY THIS MATTERS" text for the Health permission in `permissionsConfig.ts` line 26 from: *"Your data never leaves your device. Virra never uploads or sells health information."* to something accurate such as: *"Virra generates personalised insights using aggregate training metrics. Your raw health data stays on your device; only summary statistics are used. Your data is never sold."*
2. Ensure the privacy policy names Anthropic as a sub-processor and explains what data is sent (aggregate metrics, no raw biometric readings) and that Anthropic's data use is governed by their API terms (no training on API data).

---

### Subscription Mechanics

**Risk level: ✅ Compliant**

- 14-day free trial → paid subscription is the correct App Store pattern.
- `app/(app)/_layout.tsx` lines 55–67: Expired subscriptions redirect to paywall. During an active trial, all features are accessible.
- The subscription screen (`app/(app)/subscription.tsx`) is referenced and described in `docs/app-store-submission.md` as providing status, trial countdown, upgrade CTA, manage link via RC `managementURL`, and restore purchases.
- The guideline does not restrict what features a trial exposes — it only governs consent and data access. No concern here.
- RevenueCat test key (`test_` → `appl_`) swap is flagged in the submission checklist and must be done before going live, but this is not a 5.1.1 issue.

---

## Blockers to Fix Before Submission

| # | Blocker | Clause | File(s) to Change | Priority |
|---|---------|--------|-------------------|----------|
| 1 | Privacy Policy page does not exist; no in-app link | 5.1.1(i) | Create `virra.app/privacy`; add row to `app/(app)/(tabs)/profile.tsx` | P0 |
| 2 | No in-app account deletion | 5.1.1(v) | New button in `profile.tsx` or `settings.tsx`; new Edge Function for data deletion + Apple ID token revocation | P0 |
| 3 | Camera permission requested for a non-existent feature | 5.1.1(ii) | Remove camera from `app.json` plugins, from `PERMISSIONS` in `permissionsConfig.ts` (lines 43–49) | P0 |
| 4 | `NSHealthShareUsageDescription` omits menstrual data | 5.1.1(ii) / HealthKit | `app.json` line 23 | P1 |

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R1 | Update Health permission "WHY THIS MATTERS" copy to not claim data never leaves the device (since Haiku receives aggregate metrics) | 5.1.1(ii) | Prevents misleading disclosure finding; protects against future reviewer challenge |
| R2 | Add "Not now" / "Skip" secondary CTA to HealthKit, Location, and Notifications permission screens | 5.1.1(iv) | Reduces risk of "forcing consent" finding; improves UX for users who want to grant later |
| R3 | Add Privacy Policy and Terms of Service links to Profile screen, accessible without the drawer being buried | 5.1.1(i) | Required for compliance; discoverable in obvious location reduces reviewer friction |
| R4 | In reviewer notes, explicitly state what aggregate metrics are sent to Anthropic and confirm raw biometric data is not transmitted | 5.1.1(i) | Proactively addresses AI data processing questions; reduces back-and-forth |
| R5 | Verify `requestMenstrualPermission()` in the custom Expo module actually receives system permission grant and logs it correctly before submission | HealthKit | Core value prop depends on this working; a silent failure would make cycle phase engine inaccurate from day one |
| R6 | Confirm the `locationAlwaysAndWhenInUsePermission` in `app.json` is not causing iOS to request "Always" location on first prompt — code only calls `requestForegroundPermissionsAsync()` (`run.tsx` line 94). Having `UIBackgroundModes: ["location"]` without ever requesting "always" permission may generate a reviewer question about why background location mode is declared | 5.1.1(iii) Data Minimization | Remove `UIBackgroundModes: ["location"]` from `app.json` unless background location tracking is actually needed; foreground-only run tracking does not require it |
| R7 | Consider entity registration (sole trader or Ltd) before submitting, given the sensitive health data categories | 5.1.1(ix) | Low probability of rejection now, but eliminates a possible delayed rejection as the app scales |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/app.json` | 23 | `NSHealthShareUsageDescription` omits menstrual data |
| `mobile/app.json` | 27, 67 | Camera usage description for non-existent feature |
| `mobile/app.json` | 29 | `UIBackgroundModes: ["location"]` may be unnecessary |
| `mobile/app.json` | 54 | `locationAlwaysAndWhenInUsePermission` plugin config |
| `mobile/src/lib/permissionsConfig.ts` | 26 | Inaccurate "data never leaves device" claim |
| `mobile/src/lib/permissionsConfig.ts` | 43–49 | Camera permission for non-existent barcode scanner |
| `mobile/src/lib/permissionsConfig.ts` | 24, 32, 40 | `optional: false` on all non-camera permissions — no skip path |
| `mobile/app/(app)/(tabs)/profile.tsx` | 298–302 | Sign out present; account deletion absent |
| `mobile/app/(app)/settings.tsx` | entire | No privacy policy link, no account deletion |
| `mobile/supabase/functions/generate-insights/index.ts` | 181–219 | Anthropic API receives aggregate user metrics — requires privacy policy disclosure |
| `docs/app-store-submission.md` | 17 | Privacy Policy URL blocked |
