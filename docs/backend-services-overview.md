# Virra — Backend Services Overview

A reference for Emma covering the external services the app and website depend on, what each one does, and why it was chosen.

---

## App — Backend Services

### Supabase

The core backend for everything. Handles:

- **Postgres database** — all user data: cycle logs, activities, nutrition entries, training plans, seasons, insights cache, subscriptions, and more
- **Row-level security (RLS)** — every database query is automatically scoped to the signed-in user; no user can read or write another's data
- **Auth** — email + Apple Sign-In session management, JWT tokens
- **Edge Functions** — the `generate-insights` function calls Anthropic (Haiku) to produce weekly narrative insights and writes the result back to `insights_cache`
- **Postgres triggers** — 5 triggers invalidate the insights cache automatically whenever the user's activity, nutrition, or cycle data changes, so the next app open regenerates the narrative

**Project ref:** `elebuieojodsjmghwjub`

---

### RevenueCat

Subscription and in-app purchase management. Handles:

- 14-day free trial → paid conversion flow
- Apple in-app purchase processing (Apple takes 15% via Small Business Programme)
- `managementURL` for users to cancel or upgrade directly in-app
- Trial-end reminder scheduling — reminders fire on days 11 and 13 of the trial
- **Source of truth for all subscription gating** — this is never cached on-device; the app always queries RevenueCat live before unlocking premium features

---

### Anthropic (Claude Haiku)

The AI narrative layer. Not called directly from the app — only invoked via the Supabase Edge Function. Generates the weekly insight narrative that synthesises cycle phase, training load, and nutrition signals into a human-readable summary.

Results are cached per user in `insights_cache` with an expiry timestamp. The Postgres triggers reset that expiry whenever relevant data changes, so Haiku is only called when there's actually something new to say (not on every app open).

Estimated cost: ~$0.25 per million tokens. Typical user cost is negligible.

---

### Open Food Facts API

Free, open-source food database. Handles:

- Food name search
- Barcode lookup (scan a product, get its macros)
- Strong UK and global product coverage

No API key required. No cost. Replaced a planned Nutritionix integration before launch — OFF has broader coverage and no usage limits.

---

### Apple HealthKit

Primary source of activity data. The app does not ask users to manually log runs if HealthKit already has them. The integration works in two parts:

- **`HKObserverQuery`** — a background listener that fires silently whenever a new workout lands in Apple Health (from Apple Watch, iPhone GPS, or third-party apps like Garmin or Wahoo writing through Apple Health)
- **`HKAnchoredObjectQuery`** — fetches any new or changed samples since the last sync

Results are written into the `activities` table in Supabase. The user never needs to do anything; workouts appear automatically.

---

### APNs (via Expo Notifications)

Push notifications for training reminders, nutrition check-ins, and trial-end alerts. Key behaviour:

- Notifications are **scheduled on-device**, not pushed from a server
- Before each notification fires, the app checks whether the action has already been completed
- If it has (e.g. workout logged, food entered, check-in submitted), the notification is **cancelled permanently** — not suppressed, removed from the queue entirely
- This prevents the "reminder that fires even though you already did the thing" problem

---

## Website (virra.app) — Backend Services

### Vercel

Hosting and deployment for the Astro marketing site (`virra.app`). Auto-deploys from the main branch via GitHub Actions. Hosted under Paul's Vercel account. Domain auto-renews 2027-03-31.

### GitHub Actions

CI/CD pipeline. Triggers a Vercel build on every push to the main branch.

---

## What's notably absent (by design)

| Thing | Why it's not here |
|---|---|
| Custom API server | Supabase's auto-generated REST API covers all data access — no Express/Node backend to maintain or scale |
| Push server | Notifications are scheduled entirely on-device; no server-side push infrastructure needed |
| Nutritionix | Was planned originally, replaced by Open Food Facts before launch — better coverage, no cost |
| Server-side subscription cache | RevenueCat is always queried live for gating decisions; stale subscription state could unlock features incorrectly |

---

*Last updated: June 2026*
