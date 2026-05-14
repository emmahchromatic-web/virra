# Apple App Store Review Guideline Section 1 — Safety — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#safety (fetched live)
**Reviewer:** Claude Code

---

## Executive Summary

Virra clears most of Section 1 cleanly — there is no objectionable content, no user-generated content surfaces, the app is not aimed at children, and there is no facilitation of harm, drugs, alcohol, or weapons. The two material findings are: (1) **1.4.1 Medical apps** — Virra makes phase-aware pace/training recommendations and serves cycle-physiology educational content, but the app has **no in-app medical disclaimer surface** ("consult a doctor"). The reviewer notes promise this disclaimer exists in the Education Library, but no such disclaimer exists in the shipping code today. (2) **1.5 Developer Information** — there is no in-app support contact path; the App Store Connect Support URL is also still outstanding. Section 1.6 Data Security is broadly fine (TLS via Supabase, RLS on every user-scoped table, no third-party trackers), with one recommendation to move the Supabase session token from AsyncStorage to the iOS Keychain via `expo-secure-store` given the sensitive health data category.

---

## Sub-clause × Virra Compliance Matrix

### 1.1 Objectionable Content (and 1.1.1–1.1.7)

**Quote (verbatim):**
> Apps should not include content that is offensive, insensitive, upsetting, intended to disgust, in exceptionally poor taste, or just plain creepy. … Defamatory, discriminatory, or mean-spirited content … Realistic portrayals of people or animals being killed, maimed, tortured, or abused … Depictions that encourage illegal or reckless use of weapons … Overtly sexual or pornographic material … Inflammatory religious commentary … False information and features, including inaccurate device data or trick/joke functionality … Harmful concepts which capitalize or seek to profit on recent or current events.

**Virra status:** ✅ Compliant

**Evidence:**
- Tone discipline is codified in `CLAUDE.md` ("Fuelling language only — never calorie restriction, never diet culture. Speak directly to the runner, not about her. Celebrate improvements, never shame.")
- App copy reviewed across onboarding (`mobile/app/(auth)/onboarding/*`), dashboard (`mobile/app/(app)/(tabs)/index.tsx`), training, nutrition, insights, library — no defamatory, discriminatory, religious, violent, sexual, or weapons content.
- No "joke" or "prank" features. No fake location, no fake biometric readouts. All measurements derive from Apple Health, user input, or deterministic on-device computation (cycle phase engine).
- 1.1.6 specific note: claims like "phase-adjusted pace" and "predicted fitness improvement" are derived from real user data and a documented model — not fabricated readings. Accuracy claims for health measurements covered in 1.4.1 below.

---

### 1.2 User-Generated Content (and 1.2.1)

**Quote (verbatim):**
> Apps with user-generated content present particular challenges, ranging from intellectual property infringement to anonymous bullying. To prevent abuse, apps with user-generated content or social networking services must include: A method for filtering objectionable material … A mechanism to report offensive content … The ability to block abusive users … Published contact information so users can easily reach you.

**Virra status:** ✅ Not applicable

**Evidence:** Virra has no UGC surfaces — no profile bios, no comments, no community, no chat, no sharing-to-others. All content is consumed (Education Library articles, AI-generated personal insights) or self-input (logs, profile, cycle data). No 1.2 obligations attach. If Phase 2 introduces community features, this clause activates.

---

### 1.3 Kids Category

**Quote (verbatim):**
> The Kids Category is a great way for people to easily find apps that are designed for children. … Kids Category apps may not send personally identifiable information or device information to third parties.

**Virra status:** ✅ Not applicable

**Evidence:** Virra is not submitted to the Kids Category. Primary category is Health & Fitness, secondary Sports (per `docs/app-store-submission.md` line 208–209). Age rating target is 4+ but the app is positioned for adult women runners and explicitly handles menstrual data — it is not a children's product.

**Note:** Confirm in App Store Connect that the Kids Category checkbox is NOT selected during submission. Once selected, the obligations stick to future updates.

---

### 1.4 Physical Harm (parent clause)

**Quote (verbatim):**
> If your app behaves in a way that risks physical harm, we may reject it.

**Virra status:** ⚠ Monitor (see 1.4.1 below — main risk vector)

---

### 1.4.1 Medical Apps

**Quote (verbatim):**
> Medical apps that could provide inaccurate data or information, or that could be used for diagnosing or treating patients may be reviewed with greater scrutiny.
> - Apps must clearly disclose data and methodology to support accuracy claims relating to health measurements, and if the level of accuracy or methodology cannot be validated, we will reject your app. For example, apps that claim to take x-rays, measure blood pressure, body temperature, blood glucose levels, or blood oxygen levels using only the sensors on the device are not permitted.
> - Apps should remind users to check with a doctor in addition to using the app and before making medical decisions. If your medical app has received regulatory clearance, please submit a link to that documentation with your app.

**Virra status:** ⚠ Needs attention (no in-app disclaimer present today)

**Evidence:**

*Health measurement accuracy:* Virra does not claim to measure x-rays, blood pressure, body temperature, glucose, or SpO2 using device sensors. All physiological readings come from Apple Health (workouts, HR, HRV, sleep, weight) — i.e., the user's Watch or third-party app provides the values; Virra reads them. The cycle phase engine is a deterministic calendar calculation (period start + average length + today's date → menstrual / follicular / ovulatory / luteal), which is well-established physiology, not a "measurement" claim. ✅ Not at risk here.

*Training pace recommendations and phase-aware claims:* Virra adjusts pace targets, fuelling targets, and intervals based on cycle phase × training history. These are training-program recommendations, not medical diagnoses. This is analogous to Runna, TrainingPeaks, etc. ✅ Defensible.

*Education Library:* `mobile/app/(app)/library/[slug].tsx` renders articles from the `articles` Supabase table. Articles cover phase physiology, fuelling, recovery, perimenopause. Per the reviewer notes draft (`docs/app-store-submission.md` lines 183–184): *"Cycle-aware claims are framed as informational and education, not medical advice. All articles in our Education Library reference that we aren't a replacement for medical professionals."* — **However, a grep across `mobile/app/`, `mobile/src/` and the migrations folder returned zero matches for "medical", "doctor", "consult", "disclaim", or "professional".** The reviewer notes describe a state that does not exist in code today. Article body content lives server-side and could not be verified from the repo.

**Action needed:**
1. Add a global medical disclaimer surface. Lowest-friction implementation: an "About / Medical" row in `mobile/app/(app)/(tabs)/profile.tsx` that opens a short modal:
   > Virra provides training and nutrition guidance based on cycle phase and activity data. It is not a substitute for professional medical advice, diagnosis, or treatment. Consult a healthcare professional before making decisions about exercise, nutrition, or your cycle — especially if pregnant, post-partum, or managing a medical condition.
2. Audit every article in the `articles` table for an inline disclaimer footer (or render one programmatically in `library/[slug].tsx` so every article carries it for free).
3. If the cycle phase engine ever surfaces predictive claims (e.g., "your period will start in 3 days") add per-screen disclaimer text. Today the engine reports current phase + day-of-cycle, which is descriptive — lower risk.

This is **not a guaranteed rejection**, but Apple HK app reviews routinely ask for this language. Adding it pre-submission removes the friction.

---

### 1.4.2 Drug Dosage Calculators

**Virra status:** ✅ Not applicable. Virra has no dosage calculator features.

---

### 1.4.3 Tobacco / Drugs / Alcohol

**Virra status:** ✅ Compliant. No tobacco, vape, drug, or alcohol facilitation. No consumption encouragement in any copy.

---

### 1.4.4 DUI Checkpoints

**Virra status:** ✅ Not applicable.

---

### 1.4.5 Risky Activity Encouragement

**Quote (verbatim):**
> Apps should not urge customers to participate in activities (like bets, challenges, etc.) or use their devices in a way that risks physical harm to themselves or others.

**Virra status:** ✅ Compliant (with one note for review)

**Evidence:**
- No betting, no daring challenges, no "outdo your friends" social pressure mechanics.
- Run-tracker (`app/(app)/run.tsx`) uses GPS while user is presumably running — it does not push users to interact with the screen mid-run. The map and live stats render passively. Acceptable per the typical run-tracker design.
- Notifications cancel themselves when the action is done — they do not nag the user into pushing through fatigue or injury.

**Note:** The progressive season engine (`src/lib/seasonEngine.ts`) auto-builds multi-race blocks. If a user enters an unrealistic event sequence (e.g., back-to-back marathons two weeks apart), the engine produces a plan with reduced volume but still expects the user to run both. No safeguard text discourages physically risky scheduling. Consider adding a soft warning at AddEventModal when events are <4 weeks apart and both ≥21.1km. **Low priority — not a 1.4.5 trigger today**, but a thoughtful guardrail.

---

### 1.5 Developer Information

**Quote (verbatim):**
> People need to know how to reach you with questions and support issues. Make sure your app and its Support URL include an easy way to contact you; this is particularly important for apps that may be used in the classroom.

**Virra status:** ⚠ Needs attention

**Evidence:**
- `docs/app-store-submission.md` line 15: `- [ ] Support URL` — outstanding.
- `mobile/app/(app)/settings.tsx` reviewed in full — no support row, no contact email, no "Get help" link.
- `mobile/app/(app)/(tabs)/profile.tsx` reviewed in full — no support row.
- The reviewer-notes draft (`docs/app-store-submission.md` line 185) provides a contact email (`dickenson.ps@gmail.com`) for App Review only; this is not surfaced inside the app.

**Action needed:**
1. Publish a support page at `virra.app/support` — or provide a `mailto:` link. Per the submission doc (line 63): *"Support can be a mailto: link or a single page with a contact form."*
2. Add a "Support" row to the Profile screen (and/or Settings) that opens the support URL or a `mailto:` link in the default mail client.
3. Enter the Support URL into App Store Connect metadata before submission.

---

### 1.6 Data Security

**Quote (verbatim):**
> Apps should implement appropriate security measures to ensure proper handling of user information collected pursuant to the Apple Developer Program License Agreement and these Guidelines (see Guideline 5.1 for more information) and prevent its unauthorized use, disclosure, or access by third parties.

**Virra status:** ✅ Compliant (with one recommendation)

**Evidence:**
- **Transport security:** All Supabase + Anthropic + Apple Health + RevenueCat traffic is HTTPS by default. No ATS exceptions in `app.json`.
- **Row-Level Security:** Every user-scoped table enables RLS, verified via grep across the migrations folder. `001_initial_schema.sql` enables RLS on 12 tables; subsequent migrations (`003`, `006`, `008`, `009`, `012`, `013`) enable RLS on each new table they create. Every policy keys on `auth.uid() = user_id`.
- **Service role isolation:** Service-role key is only used inside Supabase Edge Functions (`generate-insights/index.ts`, `delete-account/index.ts`) — never bundled into the mobile app.
- **No third-party trackers:** No Firebase, no Sentry, no analytics SDKs, no advertising SDKs. Crash data and performance data go to nothing today — `docs/app-store-5.1.1-review.md` privacy questionnaire row "anonymous diagnostics" should be re-checked since there is no diagnostics SDK wired in. (Recommendation: drop those rows from the privacy questionnaire unless one is added before submission.)
- **HK data:** Raw HealthKit reads stay on-device. Only derived aggregate metrics (weekly km, adherence %, energy averages) are sent to Anthropic's Haiku via the `generate-insights` Edge Function — covered under 5.1.1(i).

**Recommendation R-1.6:** Auth tokens are stored in `AsyncStorage` (`mobile/src/lib/supabase.ts` line 10: `storage: AsyncStorage`). iOS encrypts the app sandbox by default (Data Protection class C), so this is not non-compliant — but for an app handling sensitive cycle and health data, moving the Supabase session to the iOS Keychain via `expo-secure-store` is best practice. The swap is mechanical:
```ts
import * as SecureStore from 'expo-secure-store';
const ExpoSecureStoreAdapter = {
  getItem:    (k: string) => SecureStore.getItemAsync(k),
  setItem:    (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};
// pass as `storage: ExpoSecureStoreAdapter`
```
Not a blocker. Worth doing pre-launch given the data category.

---

### 1.7 Reporting Criminal Activity

**Virra status:** ✅ Not applicable.

---

## Blockers to Fix Before Submission

| # | Blocker | Clause | File(s) to Change | Priority |
|---|---------|--------|-------------------|----------|
| 1 | No in-app medical disclaimer surface anywhere — reviewer notes claim one exists in the Library but no such text is present in code | 1.4.1 | Add disclaimer modal accessible from `profile.tsx`; render disclaimer footer in `library/[slug].tsx` | P0 |
| 2 | No in-app Support contact path; ASC Support URL outstanding | 1.5 | Add Support row to `profile.tsx` or `settings.tsx`; create `virra.app/support` or use `mailto:` | P0 |

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R-1.4.5 | Soft warning in AddEventModal when two ≥half-marathon events are <4 weeks apart | 1.4.5 | Forward-defends against "encourages physically risky scheduling" interpretation |
| R-1.6 | Move Supabase session storage from AsyncStorage to `expo-secure-store` (iOS Keychain) | 1.6 | Stronger at-rest protection for health-category data |
| R-priv | Drop "Crash data / Performance data" rows from the App Privacy questionnaire unless a diagnostics SDK is actually wired in | 1.6 / 5.1 | Avoid a documented data collection that doesn't actually occur (an inverse-misrepresentation risk) |
| R-kids | Verify Kids Category is NOT selected in App Store Connect; the obligation sticks across future updates if it ever gets toggled on | 1.3 | One-line check during submission |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/app/(app)/(tabs)/profile.tsx` | entire | No medical disclaimer row; no Support row |
| `mobile/app/(app)/settings.tsx` | entire | No Support row |
| `mobile/app/(app)/library/[slug].tsx` | render path | No global disclaimer footer rendered per article |
| `mobile/src/lib/supabase.ts` | 2, 10 | Session token in AsyncStorage rather than Keychain |
| `docs/app-store-submission.md` | 15, 63 | Support URL still outstanding |
| `docs/app-store-5.1.1-review.md` | privacy table | "Anonymous diagnostics" rows declared without an SDK to back them |
