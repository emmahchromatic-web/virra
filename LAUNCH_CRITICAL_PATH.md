# VIRRA — Critical Path to Launch

**Date:** 2026-08-06 (day after website launch)
**Companion to:** `virra_mvp.html` (MVP Feature Strategy v1.0) and `GAPS_ANALYSIS.md` (2026-07-10 audit, re-verified against the repo today)
**Rendered version:** Claude artifact "VIRRA — Critical Path to Launch"

---

## TL;DR

> **UPDATE 2026-08-07 — live DB verified (by Emma, dashboard SQL):** `plan_templates` holds **5 run/fitness templates** (Beginner 5K, Intermediate 10K, Half Marathon Build, Marathon Foundation, General Fitness) + 5 strength; `articles` has **6 rows**. The repo-derived "zero plans / zero articles" conclusion was wrong for the live DB — both were seeded directly via the dashboard. **The two content blockers are now REVIEW jobs, not authoring jobs:** (1) generate a plan at each distance in-app and have Emma quality-gate the programming; (2) check the 6 articles are published/rendering and top up from the site's 13 if wanted. Remaining hard P0s: sign-up no-session fix + email confirmation, RevenueCat products, branch merges.

The engineering is largely done. The cycle-phase moat is real and wired end-to-end; **6 of 8 MVP must-haves are beta-ready**. The app is blocked on **content, not code**: no running plan templates and no education articles exist, so the two remaining must-haves render empty screens. *(← superseded by the 7 Aug update above)*

**Path: finalise build by ~22 Aug → internal UAT wk of 24 Aug → closed TestFlight beta from ~7 Sept (4 weeks) → submit wk of 5 Oct → App Store launch mid-to-late October.**

---

## 1 · Scoreboard vs MVP

| Must-have | Status | Note |
|---|---|---|
| Cycle phase tracking | ✅ Ready | Genuinely drives training, nutrition, readiness. Contraception + peri/meno modes too. |
| Adaptive training plans | 🚫 **Blocked — content** | Engine built & tested; **zero running templates** (5K/10K/half/marathon). Hardest blocker; needs Emma's programme content. |
| Run logging & GPS | ✅ Ready | HR advertised but never captured → Decision 2. |
| Nutrition (female-first) | ✅ Ready | ~~fibre_g/meal_combos bugs~~ — **verified already fixed in live DB 2026-08-07** (applied via dashboard, outside the repo). Personalised engine on branch. Follow-up: commit matching migration files to the repo for reproducibility. |
| Daily dashboard | ✅ Ready | All 5 elements wired. |
| Education library | 🚫 **Blocked — content** | UI + schema built; `articles` table empty. Seed from the 13 live site articles. |
| Subscription (RevenueCat) | ⚠️ Ready — needs products | Paywall reachable end-to-end (keychain fixed 3 Aug). **No products/offerings in RC dashboard yet**; no server webhook (client-only gating — OK for beta, not launch). |
| Profile & onboarding | ✅ Ready | 8 steps incl. body metrics + 'Returning' level, all persisted. **Bug:** sign-up ignores no-session → silent dead-end; email confirmation temporarily OFF as workaround. |

Should-haves: **all 5 built** — Apple Watch/HealthKit sync (Garmin/Wahoo indirect via Apple Health by design), insights + AI narratives, push notifications, food DB + barcode, check-ins → readiness.

## 2 · Scope creep (built, not on the MVP plan)

Weight tracking, strength training system + set/rep logger, personalised nutrition engine, season timeline, training breaks, fitness auto-calibration, AI describe-meal. None are junk — most reinforce the moat — but they explain where the weeks went while the content blockers sat open.

**Call: feature freeze.** Everything above ships in the beta as-is; nothing net-new starts until the beta is live.

## 3 · Remaining build (priority order)

**P0 — before internal UAT**
1. **[Content — Emma]** Author & seed running plan templates for 5K/10K/half/marathon. Start day one; long pole.
2. **[Dev]** Seed `articles` from the 13 live website articles; wire `linked_feature` contextual links from training/nutrition.
3. ~~**[Dev]** Fix sign-up no-session handling~~ **DONE on main (`839df06`, found 2026-08-07)** — full "check your email" flow + onboarding save error surfacing. Remaining: verify once with confirmation ON, then **[Emma]** re-enable Supabase email confirmation in the dashboard (still off — must not launch that way).
4. ~~**[Dev]** Migrations: add `food_entries.fibre_g`; create `meal_combos`.~~ **DONE — verified live 2026-08-07** (applied direct to DB; still owed: matching migration files committed to the repo).
5. **[Dev]** RevenueCat products/offerings (monthly + annual + 14-day trial) + StoreKit config for sim testing.
6. **[Dev]** Merge `personalised-nutrition-engine` and `strength-session-logging` after Emma's device UAT.

**P1 — can overlap the beta**
7. **[Content — Emma]** RED-S article — `REDS_URL` points at `virra.app/advice/reds`, which 307s to the advice index (dead link).
8. **[Dev]** RevenueCat → Supabase webhook (server-of-record before paid launch).
9. **[Dev]** Verify edge functions deployed with `ANTHROPIC_API_KEY`; re-verify `EXPO_PUBLIC_INTERNAL_BUILD` off in production profile at submission (correct in `eas.json` today).
10. **[Dev]** Fix "Bench Press on a Pull day" (`normalizeStrengthSessionType` collapses push+pull → upper pool).

**Verify first (~30 min, dashboard SQL editor):** confirm live DB really has no running `plan_templates` rows and no `articles` rows. Near-certain (5 Aug dump showed strength-only templates; RLS blocked anon re-check today) but it swings the two biggest work items.

## 4 · Decisions — ALL MADE 2026-08-07 (Emma)

1. **Strength programmes → B: AUTHORED BEFORE BETA** (against rec). Emma finalises her programming, then a dedicated session designs the `exercises`/`programme_exercises` tables, seeds her real programmes, and rewires the generator. Now a pre-beta P0.
2. **Heart rate → B: BUILD NOW** (against rec). Wire HealthKit HR into the GPS run save (`hr_avg`/`hr_max`) before beta. Pre-beta P0.
3. **Beta paywall → B: REAL TRIAL FLOW** (against rec). Testers go through the genuine trial/purchase path. TestFlight IAPs run in sandbox — nobody gets charged — but RevenueCat products/offerings + StoreKit config + end-to-end purchase testing are now hard pre-beta blockers, not UAT-week nice-to-haves.
4. **Platform → A: iOS-first** confirmed.
5. **Beta community → WhatsApp group.** 6. **Founding offer → 50% off annual year 1** (free until launch).

**Timeline impact:** the three scope-adds spend the slack the DB check freed up. Revised: build-finish **~29 Aug** → UAT **wk of 31 Aug** → TestFlight upload **~4 Sept** → recruit **7–11 Sept** → **beta kickoff ~14 Sept** → 4 weeks → submit **wk of 12 Oct** → **launch late Oct** (unchanged window, slack now spent — further slips move launch into Nov).

**Pricing — DECIDED 2026-08-08 (Emma):** **£9.99/month · £99/year** ("two months free" framing), 14-day free trial, single tier gating everything via the existing `virra_pro` entitlement. Founding-member offer for beta testers = 50% off year one → **£49.50**. Strategy: anchor high, use offers (founding, launch-week, promos) as the annual-acquisition engine — decreasing prices/offers is frictionless on the App Store, raising them isn't. Explicitly parked: nutrition-only cheap tier and lifetime SKU — re-decide post-launch with beta exit-survey pricing data. **RevenueCat setup for Paul: 2 products (monthly £9.99, annual £99), 14-day trial on both, entitlement `virra_pro`.**

**Content workstream (revised):** education library = **10 AI-drafted articles per category** based on the top-10 real female-runner queries per area (Emma reviews/edits all; categories TBD — proposal: cycle phases / fuelling / training / health). The 6 seeded articles fold into this.

## 5 · Runway

| When | Milestone |
|---|---|
| Now → 22 Aug | **Finalise build.** Feature freeze; Emma authors 4 running plans; dev closes P0s. Exit bar: fresh account can onboard, generate a plan at any distance, open a populated library. |
| 24–30 Aug | **Internal UAT** (Emma + Paul, real iPhones). Scripted pass: sign-up both ways, full onboarding, plan gen each distance, outdoor GPS run, nutrition end-to-end, check-in → readiness, phase transition, strength logging, sandbox purchase + restore, notifications, account deletion. |
| 31 Aug – 6 Sept | **TestFlight build + recruit.** First upload (beta review takes days). Recruit 30–50 women runners from Run Hot newsletter + IG; entry survey for cycle-status + distance mix. |
| 7 Sept – 2 Oct | **Closed beta, 4 wks.** Weekly builds; weekly 3-question pulse. Targets: onboarding completion >85%, crash-free >99%, week-1 return, plan adherence. Parallel: authored strength programmes, RC webhook, App Store assets (tooling/drafts in `docs/`). |
| 5–11 Oct | **Submission.** Exit bar: no P0/P1 open 1 wk, purchase proven, email confirmation on, internal flag off, edge fns live, **privacy + legal pack complete (§6)**. Demo-account seed exists. Buffer one rejection. |
| Mid–late Oct | **Launch.** Convert beta testers → announce to full list → flip website app-download CTA (the planned "day-2" feature). Weekly fixes for the first month. |

## 6 · Privacy & legal pack — submission week (added 2026-09-16)

**Timing decision (Emma, 16 Sept):** none of this is needed while the app is TestFlight-only. TestFlight's privacy-policy URL is optional. It all becomes a hard requirement at the 5–11 Oct submission, so do it as one job in that week, not before.

**Controller decision (Emma, 16 Sept):** **Paul Dickenson is the data controller for the app** (developer, holds the ASC account). **Emma Harrison stays the controller for the website** (as the live Terms already say). Every legal page names both, per section.

**Audit of 16 Sept — what App Review checks, and where we stand:**

| Requirement | Enforced by | Status |
|---|---|---|
| Privacy Policy URL in ASC metadata | Hard field | ❌ `virra.app/privacy` exists but is **website-only** (26 May). The app already links to it from Profile + paywall, so the page must gain an app section, no app change needed. |
| Privacy policy link inside the app | 5.1.1(i) | ✅ Profile + paywall |
| App Privacy questionnaire ("nutrition label") | Must be complete before first submission | ❌ Draft in `docs/app-store-submission.md` §"Privacy questionnaire" — **its "do not declare crash data" line is stale**: Sentry is ON since build 15 |
| In-app account deletion | 5.1.1(v) | ✅ Two-step Delete Account → `delete-account` edge fn |
| Purpose strings (Health / Location / Camera) | Info.plist | ✅ |
| Privacy manifest | Upload check | ✅ Expo-generated; Sentry + RevenueCat ship their own |
| Specific HealthKit types disclosed | 5.1.3(i) | ⚠️ Enumerate read + write types from `permissionsConfig.ts` in both the policy and the questionnaire |
| Third-party AI disclosed | 5.1.2(i) | ⚠️ Anthropic: weekly insights (aggregate metrics) **and** describe-a-meal (free-text meal descriptions via `estimate-meal`) |
| Open Food Facts attribution | 5.2.2 | ✅ food-search footer + Profile credits |

**Tasks (one session, submission week):**

1. **[Dev]** Rewrite `docs/privacy-policy.md` (May draft, never published) against the current app: controller = Paul; add Sentry crash reporting (health fields scrubbed, `mobile/src/lib/sentry.ts`); add describe-a-meal → Anthropic; add body weights, strength set logs, mobility, recipe favourites, dietary prefs, training breaks, seasons, user events; state RevenueCat retains receipt records after account deletion; verify the "Supabase EU region" claim in the dashboard before printing it.
2. **[Dev]** Publish it as one combined page at `virra.app/privacy`: website section (Emma, keep current text + name Vercel Web Analytics) and app section (Paul). Sanity `legalPage` slug `privacy`, paste via Studio, bump `lastUpdated`.
3. **[Dev]** Same for `virra.app/terms`: currently "This Site is a blog" under Emma, and the app links to it from Profile. Add an app section under Paul: subscription terms, health/medical disclaimer, acceptable use; reference Apple's standard EULA for the rest.
4. **[Paul, ASC]** Complete the App Privacy questionnaire. Collected + linked to identity: email, name, photos (avatar), health & fitness (specific HK types), precise location, purchase history, user ID, user content. Collected, not linked: **crash data** (Sentry). Tracking: none, no ATT prompt.
5. **[Paul, ASC]** Age rating questionnaire — answer the health/medical question honestly; still lands on 4+.
6. **[Paul, ASC]** If selling on EU storefronts: Digital Services Act trader declaration. Paul's name, address, email and phone become public on the EU product page.
7. **[Dev]** Reviewer notes: keep the existing Anthropic paragraph; add the two-tile activity-rings rationale (5.2.5) from `docs/app-store-section-5-legal-review.md`.
8. **[Dev, before promising it]** The policy's "email us for a JSON export" depends on `mobile/supabase/queries/subject-access-request.sql` (card 249), never run against prod. Run §1 once so the promise is real.
