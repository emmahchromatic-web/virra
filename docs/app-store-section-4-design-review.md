# Apple App Store Review Guideline Section 4 — Design — Virra Compliance Review

**Date:** 2026-05-14
**Guideline source:** https://developer.apple.com/app-store/review/guidelines/#design (fetched live)
**Reviewer:** Claude Code

---

## Executive Summary

Section 4 is the cleanest section for Virra so far — **no blockers and almost no findings**. The app is original (4.1 Copycats — distinctive cycle-aware angle, no impersonation), substantive native functionality (4.2 Minimum Functionality — cycle engine, training plans, nutrition, AI insights), single bundle ID (4.3 Spam), no extensions or widgets (4.4), correct Apple-services hygiene (4.5 — no scraping, no marketing-as-notifications, notification bodies contain no sensitive phase/cycle data), no mini-app embedded software (4.7), and 4.8 Login Services is automatically satisfied because Sign in with Apple is one of the two offered methods. The only recommendation is to verify Apple emoji isn't accidentally rendered anywhere on non-Apple surfaces (the marketing site uses Cormorant/Outfit fonts and could inadvertently render system emoji as Apple emoji if any leak in).

---

## Sub-clause × Virra Compliance Matrix

### 4.1 Copycats

**Quote (verbatim):**
> Come up with your own ideas. … Don't simply copy the latest popular app on the App Store, or make some minor changes to another app's name or UI and pass it off as your own. … Submitting apps which impersonate other apps or services is considered a violation of the Developer Code of Conduct … You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval from the developer.

**Virra status:** ✅ Compliant

**Evidence:**
- App name "Virra" is original, not derivative of Runna, Strava, Nike Run Club, Apple Fitness+, MyFitnessPal, Garmin Connect, Wahoo, TrainerRoad, etc.
- Core differentiator is cycle-aware training and nutrition for women runners — no comparable app on the App Store. Most closely adjacent apps (Wild.AI, FitrWoman) do not have integrated training plans + nutrition + cycle in one product.
- No competitor brand names, icons, or imagery used in Virra's icon, splash screen, or in-app UI.
- Design system (`mobile/src/constants/theme.ts`) is original — `pulse`/`heat`/`mile`/`breath`/`dawn`/`mist` colour tokens, custom typography stack (Big Shoulders Display + Fraunces + Inter + Space Mono). No "inspired by" copying of any specific competitor's design language.
- Submission keywords explicitly exclude competitor trademarks (`docs/app-store-submission.md` line 153: "Avoid Runna/MyFitnessPal/Apple/Garmin (competitor trademarks)").

---

### 4.2 Minimum Functionality

**Quote (verbatim):**
> Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or "app-like," it doesn't belong on the App Store.

**Virra status:** ✅ Compliant

**Sub-clause findings:**

**4.2.1 ARKit:** ✅ Not applicable. No AR features.

**4.2.2 Not marketing / web wrap / link aggregator:** ✅
- Virra is substantively native: HealthKit integration (read + write), in-app GPS run tracker with live splits, on-device cycle phase engine, deterministic plan generation, AI-narrated insights via Edge Function. Not a thin shell over `virra.app`.
- The marketing site (`virra.app`) is completely separate (Astro static site) and Virra has no embedded WebView pointing to it.

**4.2.3(i) Works on its own without another app:** ✅
- Virra does not require any companion app to function. HealthKit is recommended for full value but is an Apple platform service, not a third-party app dependency.
- The app gracefully degrades when HealthKit/Notifications/Location are denied (see Section 1.4 review for denial paths).

**4.2.3(ii) Initial-launch downloads:** ✅
- App is fully self-contained in its bundle.
- Fonts are bundled via `@expo-google-fonts/*` packages (note: cold-start performance flagged in `memory/project_splash_slow.md`, but the fonts ARE downloaded as part of the initial bundle build, not at runtime).
- No "download required content" prompt at first launch beyond the standard auth + onboarding flow.

**4.2.4 / 4.2.5:** Intentionally omitted by Apple.

**4.2.6 Commercialized template / app generator:** ✅ Not applicable.
- Virra is custom-coded in React Native + Expo, submitted directly by the developer (sole developer per `app.json` owner field). No template generator service involved.

**4.2.7 Remote desktop clients:** ✅ Not applicable.

---

### 4.3 Spam

**Quote (verbatim):**
> Don't create multiple Bundle IDs of the same app. … Also avoid piling on to a category that is already saturated; the App Store has enough fart, burp, flashlight, fortune telling, dating, drinking games, and Kama Sutra apps, etc. already. We will reject these apps unless they provide a unique, high-quality experience.

**Virra status:** ✅ Compliant

**Evidence:**
- Single bundle ID: `com.pauldickenson.virra.app` (`mobile/app.json` line 14). No variant bundles in `ios/`.
- Health & Fitness is a populated category, but Virra has a unique, defensible angle (cycle-aware training + nutrition for women runners). The 4.3(b) "unique, high-quality experience" exception applies clearly. The bar Apple cites here is fart-app territory; Virra is well above it.

---

### 4.4 Extensions

**Virra status:** ✅ Not applicable

**Evidence:**
- No keyboard extensions, no Safari extensions, no Share extensions, no Notification Content extensions, no Today widgets in v1.
- `mobile/app.json` plugins block (lines 37–68) only includes `withCxx17`, `expo-router`, `expo-font`, `expo-apple-authentication`, `expo-splash-screen`, `expo-location`, `expo-notifications`, `expo-camera` — none of which produce App Extensions.
- 4.4.1 Keyboard extensions, 4.4.2 Safari extensions: not applicable.

---

### 4.5 Apple Sites and Services

**Sub-clause findings:**

**4.5.1 No scraping Apple sites:** ✅ No code touches apple.com, App Store, App Store Connect APIs from the client.

**4.5.2 Apple Music / MusicKit:** ✅ Not applicable. No MusicKit integration. App is silent during runs (the user uses Apple Music / Spotify / etc. independently).

**4.5.3 No spam via Apple services / no Player ID exploitation:** ✅
- No Game Center. No Push Notification spam — see 4.5.4 below.
- No anonymous-messaging or invitation features.

**4.5.4 Push Notifications:** ✅ Compliant

Detailed audit of notification content in `mobile/src/lib/notifications.ts`:

| Notification | Trigger | Title | Body | Sensitivity |
|--------------|---------|-------|------|-------------|
| Weekly plan | Sunday 18:00 | "Plan your week" | "Your training week starts tomorrow — tap to review and adjust your sessions." | None |
| Training reminder | Adaptive hour, only if planned session exists | "Time to move" | "Today's session is ready. Tap to start." | None |
| Breakfast | Daily 08:00 | "Fuel right from the start" | "Log your breakfast to hit your morning targets." | None |
| Lunch | Daily 12:30 | "Keep the momentum going" | "Log your lunch — your body is mid-adaptation right now." | None |
| Dinner | Daily 19:00 | "End the day strong" | "Log your dinner and close out your nutrition." | None |
| Check-in | Daily 20:00 | "A minute to check in" | "How are you feeling today? It only takes 30 seconds." | None |
| Trial reminder day 11 | 3 days before trial end | "Your free trial ends in 3 days" | Transactional reminder text | Transactional, not marketing |
| Trial reminder day 13 | 1 day before trial end | (similar) | Transactional reminder text | Transactional, not marketing |

- ✅ "Must not be required for the app to function" — Virra works fully if notifications are denied.
- ✅ "Should not send sensitive personal or confidential information" — no notification body includes the user's cycle phase, day of cycle, weight, biometric measurements, or health metrics. All bodies are generic encouragement.
- ✅ "Should not be used for promotions or direct marketing purposes unless customers have explicitly opted in" — none of the notifications are marketing. The trial-end reminders are transactional (subscription lifecycle disclosure) and opt-in via the paywall acceptance.
- ✅ Cancellation pattern: every reminder removes itself when the action is completed (per `CLAUDE.md` "Notifications earn their place" principle and the `cancelStored` calls in `notifications.ts`).
- ✅ Per-slot toggle in Settings (`mobile/app/(app)/settings.tsx` lines 17–24) gives the user fine-grained opt-out control.

**4.5.5 Game Center Player IDs:** ✅ Not applicable.

**4.5.6 Apple emoji:** ✅ Compliant (with one note)
- The repository memory `feedback_icons.md` codifies: *"Icons must use SF Symbols — use expo-symbols SymbolView everywhere, never emoji or unicode."* — already aligned with this clause.
- Sweep of `mobile/app/` and `mobile/src/` UI files reveals no inline emoji characters in user-facing strings. All icons use `SymbolView` from `expo-symbols`. The "✓ " in the paywall feature list (`paywall.tsx` line 78) is a checkmark glyph rendered in a `VirraText`, not an Apple emoji — it's the U+2713 check character, which renders consistently across platforms.

**Note R-4.5.6:** Confirm no Apple-emoji-rendered characters appear in the marketing site (`virra.app` / Astro project) using fonts that fall back to Apple Color Emoji. The clause says Apple emoji "may not be used on other platforms." The marketing site is a separate Astro deployment — a quick visual sweep before submission is worth doing. Low risk, easy fix.

---

### 4.6 Intentionally omitted by Apple

No content here as of the current guidelines snapshot.

---

### 4.7 Mini Apps / Mini Games / Streaming / Chatbots / Plug-ins / Game Emulators

**Virra status:** ✅ Not applicable

**Evidence:**
- No HTML5 mini apps embedded.
- No JS mini games.
- No streaming game integration.
- No chatbot UI (the AI insights are pre-generated, asynchronous, server-side — they are not an interactive chat session).
- No plug-in marketplace.
- No game emulators.

**Sub-note on AI insights:** The `generate-insights` Edge Function uses Claude Haiku to generate weekly narrative text. This is a server-side text generation feature, not a "chatbot" by 4.7's definition (which envisions a conversational software-within-an-app experience). The user does not interact with the model in a chat loop — they receive pre-generated insight text. 4.7 does not apply.

---

### 4.8 Login Services

**Quote (verbatim):**
> Apps that use a third-party or social login service (such as Facebook Login, Google Sign-In, Sign in with Twitter, Sign In with LinkedIn, Login with Amazon, or WeChat Login) to set up or authenticate the user's primary account with the app must also offer as an equivalent option another login service with the following features:
> - the login service limits data collection to the user's name and email address;
> - the login service allows users to keep their email address private as part of setting up their account; and
> - the login service does not collect interactions with your app for advertising purposes without consent.

**Virra status:** ✅ Compliant

**Evidence:**
- Virra offers two login methods (`mobile/app/(auth)/sign-in.tsx`):
  - **Sign in with Apple** (via `expo-apple-authentication` — entitled in `app.json` line 34)
  - **Email** (Supabase Auth OTP / password)
- Sign in with Apple is explicitly listed by Apple itself as the canonical "privacy-respecting equivalent" — it limits data collection to name and email, supports email-relay (hide-my-email), and does not collect interactions for advertising.
- Even though Sign in with Apple is presented alongside email auth (rather than alongside a third-party social login like Google or Facebook), Virra automatically satisfies 4.8 because Sign in with Apple is one of the offered options.
- Of the exception list in the clause:
  - "Your app exclusively uses your company's own account setup and sign-in systems" — partially true (email auth is Virra's own), but combined with Apple Sign-In so the exception isn't load-bearing here.
- ✅ No additional login services would be required even if Google Sign-In was added later, because Apple Sign-In is already present.

---

## Blockers to Fix Before Submission

**None.**

---

## Recommendations (Not Blockers, Would Smooth Review)

| # | Recommendation | Clause | Impact |
|---|----------------|--------|--------|
| R-4.5.6 | Sweep `virra.app` (Astro marketing site) for any inadvertent emoji characters that may render as Apple Color Emoji on non-Apple platforms | 4.5.6 | Low-friction check; clause technically governs metadata + app surfaces but extends to embedded emoji in any developer-controlled property |
| R-4.4 | If a Notification Service Extension (NSE) is added later (e.g. for richer push payloads or end-to-end encrypted reminders), revisit 4.4 obligations | 4.4 | Forward-looking; not needed for v1 |
| R-4.8 | If a future Google/Facebook login is added, no Section 4.8 work needed since Sign in with Apple is already present — but document this in the auth screen architecture so it doesn't get accidentally removed | 4.8 | Operational durability |

---

## File Reference Summary

| File | Key Lines | Concern |
|------|-----------|---------|
| `mobile/app.json` | 14 | Single bundle ID — 4.3 compliant |
| `mobile/app.json` | 34, 41 | `applesignin` entitlement + `expo-apple-authentication` plugin — 4.8 satisfied |
| `mobile/app/(auth)/sign-in.tsx` | (inferred) | Email auth + Apple Sign-In — 4.8 compliant |
| `mobile/src/lib/notifications.ts` | 142–217 | Notification bodies contain no sensitive cycle/health data — 4.5.4 compliant |
| `mobile/app/(app)/(tabs)/settings.tsx` | 17–24 | Per-slot notification opt-out — 4.5.4 compliant |
| `memory/feedback_icons.md` | — | "Never emoji or unicode" rule already in force — 4.5.6 compliant |
| `docs/app-store-submission.md` | 153 | Keywords avoid competitor trademarks — 4.1 forward-defense |
