# VIRRA — Beta Gaps Analysis

**Date:** 2026-07-10
**Target:** September 2026 beta. Gate = MUST-HAVE features working end to end.
**Method:** Static analysis of the `mobile/` React Native (Expo) app + Supabase migrations. Six parallel domain audits, load-bearing findings independently re-verified against source. **No code was changed.**

---

## TL;DR

The build is **far more mature than a pre-beta skeleton** — it's a substantially complete, well-tested app (150+ source files, 66 test files, 23 migrations). The competitive moat — the cycle-phase engine — is **genuinely wired end to end**: logging a period drives training paces, workout structure, nutrition targets, and recovery/readiness. That is the hardest thing to build and it is done.

The beta is **not blocked by missing engines. It is blocked by missing *content and seed data* in two must-haves**, plus a handful of data-integrity bugs:

- **Adaptive training plans** have a complete generation engine but **zero running plan templates seeded** — a user picks "marathon" and gets an empty plan browser. This is the single hardest beta blocker.
- **Education library** is fully built UI + schema but the `articles` table is **empty** and there are **no contextual links** from training/nutrition.
- **Nutrition** is deep and correct, but **fibre is silently dropped** (no DB column) and a **`meal_combos` table is referenced in code but never created** (crash risk).

Everything else on the MUST-HAVE list (cycle, run/GPS, dashboard, subscription plumbing, onboarding) is beta-ready or nearly so.

> **Important confidence caveat on the two biggest blockers:** "No running plan templates" and "empty articles table" are **HIGH confidence for the git repo** (no seed migration exists) but only **MEDIUM confidence for the live hosted Supabase DB** — rows could have been inserted directly via the dashboard/MCP outside version control. **Verify against the live project (`elebuieojodsjmghwjub`) before acting.** If the live DB is also empty, these are hard blockers.

---

## Status table — MUST-HAVE (the beta gate)

| # | Feature | Status | Location | What's missing for beta | Beta-ready? |
|---|---------|--------|----------|-------------------------|:-----------:|
| 1 | **Cycle phase tracking** (drives training/nutrition/recovery) | **Built** | `src/lib/cycleEngine.ts`, `cycleModulation.ts`, `nutritionTargets.ts`, `readinessEngine.ts`, `src/store/cycle.ts`, `app/(onboarding)/cycle.tsx`, `supabase/migrations/004,020` | Nothing structural. Phase genuinely modulates pace, workout structure, macro targets & readiness — not cosmetic. | **Yes** |
| 2 | **Adaptive training plans** (5K→marathon, phase-adjusted) | **Partial** | `src/lib/scheduleGenerator.ts`, `seasonEngine.ts`, `runWorkoutGenerator.ts`, `trainingBlocks.ts`, `app/(app)/plans/browse.tsx`, `plan/[id].tsx`, `app/(onboarding)/goal.tsx` | **No running plan templates seeded** (only 1 strength template in `migration 005`). Engine is built; there is nothing to generate *from*. Goal selection is currently vestigial. | **No** |
| 3 | **Run logging & GPS tracking** | **Built** (HR gap) | `app/(app)/run.tsx` (real `expo-location` GPS), `app/(app)/manual-activity.tsx`, tables `activities` / `run_details` | Real GPS pace/distance/splits/route ✅. **HR never captured** (`run_details.hr_avg/hr_max` columns exist, never written); elevation not stored. HR is an advertised metric — decide capture vs. descope. | **Yes** (with HR caveat) |
| 4 | **Nutrition tracking** (female-first, phase targets) | **Built** (2 bugs) | `src/lib/nutritionTargets.ts`, `commonFoods.ts`, `openFoodFacts.ts`, `app/(app)/(tabs)/nutrition.tsx`, `food-search.tsx`, `describe-meal.tsx`, `supabase/functions/estimate-meal` | Phase×load target matrix confirmed ✅, language is clean fuelling-first ✅. **Bug: `fibre_g` computed & displayed but no DB column → intake silently discarded.** **Bug: `meal_combos` table referenced in 3 places, never created → crash on "save combo".** | **Yes**, after 2 fixes |
| 5 | **Daily dashboard** | **Built** | `app/(app)/(tabs)/index.tsx`, `src/lib/dashboardData.ts` | All 5 required elements present & wired: today's training, cycle phase, fuelling cue, last activity, weekly rings. | **Yes** |
| 6 | **Female health education library** | **Partial** | `app/(app)/(tabs)/library.tsx`, `library/[slug].tsx`, `articles` table (`migration 001`) | UI + schema + phase-tag filtering built. **`articles` table is empty** ("No articles yet."). **No contextual links** from training/nutrition (`linked_feature` column never read). No full-text search (chip filter only). | **No** (content) |
| 7 | **Subscription & payments** (RevenueCat) | **Built** enough for bar | `src/lib/revenuecat.ts`, `src/store/subscription.ts`, `app/(auth)/paywall.tsx`, `app/(app)/subscription.tsx`, `subscriptions` table | SDK initialized, entitlement `virra_pro`, live paywall, 14-day trial, trial-end reminders ✅. **Gap: no server-side RevenueCat→Supabase webhook sync** (gating is client-side only; `subscriptions` table gets no writes from app). Beta bar = "plumbing must exist" → met. | **Yes** (harden post-beta) |
| 8 | **Profile & onboarding** | **Built** | `app/(onboarding)/*`, `src/context/OnboardingContext.tsx`, `src/store/profile.ts`, tables `user_profiles` / `fitness_assessments` / `cycle_logs` | 7-step flow. Every field (fitness level, weekly mileage, 5K PB, goal, **period start + avg length**, contraception sub-data, dietary prefs, name/avatar) is captured **and persisted** — verified column-by-column. | **Yes** |

## Status table — SHOULD-HAVE (strong beta, cuttable)

| Feature | Status | Location | Notes | Beta-ready? |
|---------|--------|----------|-------|:-----------:|
| **Wearable sync** | **Built (Apple only)** | `src/lib/healthKit*.ts`, `modules/menstrual-health/` (real native Swift module), `app.json` entitlements | Apple HealthKit fully integrated incl. native menstrual read/write. Garmin/Wahoo/Strava = **indirect** (users sync to Apple Health first — matches documented architecture). No direct 3rd-party APIs (that's Phase 2). | Yes (Apple) |
| **Progress & insights** | **Partial** | `app/(app)/insights.tsx`, `src/lib/insightMetrics.ts`, `supabase/functions/generate-insight(s)` | On-device metrics + Claude Haiku narratives, cache-invalidated by triggers. **Cycle-performance correlation is shallow** (avg pace per phase, no multi-factor). Edge-fn deployment/`ANTHROPIC_API_KEY` unverifiable from code. | Yes (basic) |
| **Push notifications** | **Built** | `src/lib/notifications.ts`, `src/store/notifications.ts`, `app/(app)/notifications.tsx` | 7 reminder slots, state-aware cancellation (removed not suppressed), idempotent daily rescheduling, prefs persisted. Strong. | Yes |
| **Food database & barcode** | **Built** | `src/lib/openFoodFacts.ts`, `commonFoods.ts` (~233 foods), `food-search.tsx` (live `expo-camera` barcode) | Open Food Facts API + barcode scan + local list + Haiku describe-meal. Replaces Nutritionix per design. | Yes |
| **Symptom & wellbeing logging** | **Built** | `app/(app)/checkin.tsx`, `src/store/readiness.ts`, `readinessEngine.ts`, `symptom_logs` table | Energy/mood/sleep/symptoms/notes logged, feed readiness score. **Gaps:** symptoms not fed back into training; `checkin-trends.tsx` exists but has **no navigation link**. | Yes |

---

## Must fix before September beta — prioritised by how hard it blocks

**P0 — blocks a MUST-HAVE from functioning at all**

1. **Seed running plan templates (5K / 10K / half / marathon).**
   The entire plan-generation engine (`scheduleGenerator.ts`, `runWorkoutGenerator.ts`, `seasonEngine.ts`) is built and tested, but `plan_templates` contains only one *strength* row (`migration 005`). A user completes onboarding, picks "marathon," and the plan browser is empty. **This is the hardest blocker — must-have #2 is non-functional without it.**
   *Effort: author `sessions_json` for 2–4 running plans.* *Confidence: HIGH in repo / verify live DB first.*

2. **Populate the education library + wire contextual links.**
   Must-have #6 ships showing "No articles yet." Seed the `articles` table (the Sanity `article` schema on the web side is a natural content source), and use the existing `linked_feature` column to surface "learn more" links from training/nutrition. Full-text search is a nice-to-have; phase-tag filtering already works.
   *Confidence: HIGH in repo / verify live DB first.*

**P1 — data-integrity bugs in a MUST-HAVE**

3. **Fix nutrition data loss.**
   (a) Add `fibre_g` to `food_entries` — it is summed and rendered but never persisted, so logged fibre is silently lost and the fibre bar always reads 0.
   (b) Create the `meal_combos` table — referenced at `food-search.tsx:290,437` and `nutrition.tsx:321` with no migration; "save meal combo" will error at runtime.
   *Confidence: HIGH — no such column/table in any migration.*

**P2 — advertised-but-absent, and launch-hygiene**

4. **Decide on HR capture during GPS runs.** Brief lists "pace, distance, HR"; `run.tsx` captures no heart rate. Either wire HealthKit HR into the run save, or descope HR for beta and adjust messaging.

5. **Subscription server-of-record.** Add a RevenueCat webhook → Supabase Edge Function to sync purchase/renewal/cancellation into `subscriptions`. Clears the "plumbing exists" bar today, but gating is client-side only, which is fragile for a paid beta.

6. **Launch hygiene:**
   - Replace the placeholder `REDS_URL` (`cycle-settings.tsx:37`, `onboarding/cycle.tsx` — carries a `// TODO ... before launch`).
   - Confirm `virra.app/privacy` and `/terms` exist (linked from paywall/profile).
   - Ensure `EXPO_PUBLIC_INTERNAL_BUILD` is **off** for the store build (it bypasses the RevenueCat entitlement gate).
   - Verify the `generate-insight(s)` edge functions are deployed with `ANTHROPIC_API_KEY` set.

---

## Built but unexpected (on the code, not on the brief)

None of these are problems — they show the build is ahead of the MVP in places. Flagged for scope awareness.

- **Weight tracking (large, opt-in).** `app/(app)/weight.tsx`, `src/lib/weight*.ts`, 8 dedicated test files. Cycle-aware "steady line" (median-of-30-days baseline, deltas not absolute weight, **no goal weight / no streaks** — deliberately non-diet-culture). Not on the MVP list; the project's own docs mark it "Phase G, deferred," yet it's shipped and heavily tested. **Confirm it's intended for beta or feature-flag it off.**
- **Training breaks** — illness/holiday reschedule with skip/shift modes (`app/(app)/breaks.tsx`, `training_breaks`).
- **Season timeline / multi-event periodisation** (`app/(app)/timeline.tsx`, `seasonEngine.ts`, `seasons`) — progressive planning across multiple races.
- **Fitness auto-calibration** — detects when recent runs beat the baseline and prompts to update it (`FitnessUpdateModal`, `fitness_assessments`, `migration 2026-05-28`).
- **Cycle modes** — hormonal-contraception sub-profiles + peri/menopause "steady" mode that correctly *disables* phase modulation (`migration 020`, `deriveCycleMode()`). Peri/menopause is nominally Phase 2; here it's handled as a graceful no-cycle fallback, not a full track.
- **Describe-meal AI** — Claude Haiku natural-language meal estimation with disclosure gate, rate limiting, and global cache (`describe-meal.tsx`, `estimate-meal` fn). Arguably part of the nutrition should-have.
- **App-review demo account seed** (`supabase/seeds/app_review_demo_account.sql`) — tooling for App Store review.

---

## Half-wired inventory (UI↔backend mismatches, orphans, placeholders)

| Item | Symptom | Location |
|------|---------|----------|
| `articles` table | Schema + UI built, **no content** | `migration 001`, `library.tsx:114` |
| `articles.linked_feature` | Column exists, **never read** — no contextual linking | grep: 0 usages |
| `meal_combos` table | **Referenced in code, no migration** → runtime error on save | `food-search.tsx:290,437`, `nutrition.tsx:321` |
| `food_entries.fibre_g` | Fibre computed/displayed but **no column** → silently dropped | `nutritionTargets.ts` vs. `migration 001/017` |
| `run_details.hr_avg` / `hr_max` | Columns exist, **never written** | `run.tsx` save path |
| `subscriptions` table | Exists, **no writes from app** (client-side RC gating only) | `migration 001` vs. app code |
| `checkin-trends.tsx` | Screen built, **no navigation entry point** | `app/(app)/checkin-trends.tsx` |
| `REDS_URL` | Placeholder URL with `// TODO ... before launch` | `cycle-settings.tsx:37` |
| `EXPO_PUBLIC_INTERNAL_BUILD` | Dev flag **bypasses paywall entitlement** — must be off in prod | `app/(app)/_layout.tsx`, `paywall.tsx` |

---

## Cross-cutting checks (answered)

- **Does onboarding capture & store cycle data, goal, level, dietary prefs?** **Yes — all of it.** Verified column-by-column: `user_profiles` (fitness level, goal, dietary prefs, contraception), `fitness_assessments` (5K PB pace), `cycle_logs` (period start, avg length). Nothing is collected then dropped.
- **Is cycle-phase logic wired into training AND nutrition, or cosmetic?** **Wired, not cosmetic.** Training: `modulateForCycle()`/`modulateRunStructure()` shift pace targets and workout structure per phase; strength set schemes and block load also vary by phase. Nutrition: `getNutritionTargets(phase, load)` returns a phase×load macro matrix consumed by the nutrition screen and dashboard. Recovery: `readinessEngine.ts` applies per-phase HRV/RHR offsets.
- **Supabase tables for profile/cycle/runs/plans/nutrition/symptoms?** **All present** (20 tables). **Orphans/empties:** `articles` (empty), `meal_combos` (missing entirely), `subscriptions` (written only by a not-yet-built webhook), missing `fibre_g` column. Tips table **is** seeded (12 rows).
- **Health/cycle data storage & HealthKit permissions?** Cycle data in `cycle_logs` + optionally mirrored to Apple Health via a **real native Swift menstrual module** (`modules/menstrual-health/`). HealthKit entitlements + usage strings configured in `app.json`; permission "why" screens precede every iOS dialog.
- **Disclaimers / privacy for health data?** **Present and reasonably thorough** — comprehensive "not a medical service" modal in profile, article-level disclaimers, pregnancy/postpartum warning with required confirmation, privacy/terms links, and a working `delete-account` edge function (GDPR right-to-deletion) with RLS across all user tables. Gap: the RED-S educational link is still a placeholder.

## Nutrition phase-target confirmation (per the brief's note)

As requested, not flagging unfinished body-recomposition macro numbers as a gap. **Confirmed the plumbing holds phase-based targets:** `nutritionTargets.ts` defines `TARGETS: Record<CyclePhase, Record<TrainingLoad, NutritionTargets>>` and `getNutritionTargets(phase, load)` returns per-phase macros (with a `FLAT_TARGETS` fallback for no-cycle users). Dropping in finalised numbers requires no structural change.

---

## Confidence notes

- **HIGH:** cycle engine wiring; onboarding persistence; GPS realness; nutrition language & phase plumbing; the fibre/`meal_combos` bugs; auth (email + Apple); dashboard completeness.
- **MEDIUM → verify against live DB:** "no running plan templates" and "empty articles table" are certain in the git repo but the hosted Supabase project may have been seeded directly. **Check the live DB before scheduling this work** — it swings whether P0 items are true blockers or already done.
- **MEDIUM → verify against deployment:** edge-function deployment status (`estimate-meal`, `generate-insight(s)`) and RevenueCat dashboard offerings (monthly/annual/trial products) can't be confirmed from source.
- **Not run:** the 66-file Jest suite was inventoried, not executed — pass/fail not asserted here.
