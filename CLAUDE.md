# VIRRA — Claude Code Project Guide

## Supabase MCP

The Supabase MCP server is configured for this project (`project_ref: elebuieojodsjmghwjub`). Use it to inspect tables, run queries, and apply migrations directly rather than asking the user to run SQL manually.

```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=elebuieojodsjmghwjub"
```

---

## What this project is

A subscription mobile app (React Native, iOS-first) that replaces Runna + MyFitnessPal + a cycle tracker for women runners. Female health is woven through every feature — not bolted on. The cycle phase engine is the primary competitive moat.

Full design reference: `docs/design/virra-mvp-master.html` (open in browser).

---

## The one-line brief

> A subscription app that replaces Runna + MyFitnessPal + a cycle tracker for women runners — with female health woven through every feature, not bolted on.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile framework | Expo + expo-router | File-based routing, EAS Build for App Store |
| Backend / DB / auth | Supabase (Postgres + RLS) | Row-level security scoped per user |
| Subscriptions | RevenueCat | 14-day trial → paid. Apple SBP = 15% cut |
| Food database | Open Food Facts API (future phase) | Free, open source, strong UK/global coverage. Barcode scan + food search deferred until post-launch revenue. Manual macro entry + bundled common-foods list in MVP. |
| Health data | Apple HealthKit (`react-native-health`) | Primary activity source |
| State | Zustand | Local, synced to Supabase |
| Notifications | Expo Notifications + APNs | State-aware — cancelled when action completed |
| AI insights | Claude Haiku | Weekly/monthly narrative, cached |
| Marketing site | Astro (existing, `virra.app`) | Completely independent — no shared code |

---

## Design system (Vol. 02 — authoritative)

Reference file: `virra_guidelines.html`

**Colours**
```
--pulse:   #D4FF26   /* lime — primary accent */
--heat:    #FF2E7E   /* hot pink — energy, CTAs */
--mile:    #0A0A0F   /* near-black — primary bg */
--breath:  #F4EDE0   /* warm cream — primary text */
--dawn:    #FF6B3D   /* orange — warnings, revenue */
--mist:    #1C1C24   /* dark navy — card bg */
```

**Typography**
- `Big Shoulders Display` — headlines, display, all-caps (weight 900)
- `Fraunces` — italic serif, editorial/emotional moments
- `Inter` — body text, UI labels (weight 300–600)
- `Space Mono` — metadata, tags, technical labels (monospace)

**Tone**
- Fuelling language only — never calorie restriction, never diet culture
- Speak directly to the runner, not about her
- Celebrate improvements, never shame

---

## Architecture decisions (locked in)

### Cycle phase engine
- Runs **on-device**, offline, no network round trip
- Input: period start date + average cycle length + today's date
- Output: phase (`menstrual` | `follicular` | `ovulatory` | `luteal`)
- This feeds training load, nutrition targets, recovery cues, and insights across every feature

### Activity data hierarchy (HealthKit-first)
1. **Apple Watch** → HKObserverQuery background import, silent, zero user action
2. **iPhone GPS** → in-app run tracker, writes to HealthKit on save, same observer picks it up
3. **Garmin / Wahoo** → write to Apple Health via their apps → Virra catches via HealthKit bridge
4. **Manual log** → explicit fallback only, positioned as "didn't have your watch?"

Never surface Manual Log as a primary CTA. It is a last resort.

### Notification intelligence
Every notification **checks current state before delivery**. If the action is already done, the notification is cancelled — not suppressed, permanently removed from the queue.

Cancellation map:
- HealthKit workout detected → cancel training reminder for that day
- Food entry added → cancel nutrition reminder for that meal slot
- Check-in submitted → cancel check-in reminder for today
- Subscription activated → cancel all trial-end reminders
- Fitness profile updated → cancel pending baseline update notification

This prevents the Renpho anti-pattern (blind reminders that fire regardless of state).

### Nutrition targets
Targets are the product of **cycle phase × training load** — not cycle phase alone.
- Rest day luteal ≠ long run day luteal
- Follicular long run day = highest adaptation window — fuel it hard
- Luteal gets highest carb targets overall (cravings are real, honour them with quality fuel)

### Fitness assessment
- Self-reported at onboarding (fitness level, weekly mileage, recent race times)
- Stored in `fitness_assessments` table with full history
- **Trigger:** 3+ logged activities consistently faster/more than stated baseline
- **Action:** Fitness Update modal fires — celebrate improvement, confirm new baseline
- Plans adapt in real-time as baseline updates

### Insights split
- **On-device (free, offline):** all quantitative metrics — streak, distances, adherence %, phase-pace averages, consistency scores
- **Haiku (cached, ~$0.25/1M tokens):** weekly/monthly narrative insights synthesising multiple signals. Not regenerated every session.
- **Apple Intelligence (enhancement only):** notification summarisation, Siri integration. Don't architect core features around it.

---

## Navigation structure

**4 tabs:** Dashboard · Training · Nutrition · Library

**Profile** → top-right drawer button on Dashboard (not a tab)

**Modals (global):** Run Tracker · Manual Activity (fallback) · Food Entry · Daily Check-in · Fitness Update (engine-triggered)

### Onboarding (7 steps, new users only)
1. Welcome — value prop
2. Fitness Assessment — self-reported baseline, dynamically revised
3. Running Goal — 5K → marathon
4. Cycle Data — period start, avg cycle length
5. Dietary Preferences
6. Permissions — each explained with WHY before iOS dialog fires (Location, HealthKit, Notifications, Camera)
7. Paywall — 14-day free trial, explicit opt-in action, trial-end reminders day 11 + 13

---

## Supabase schema (key tables)

```sql
-- Cycle
cycle_logs          (id, user_id, period_start, cycle_length_days, phase_overrides)
symptom_logs        (id, user_id, recorded_on, energy, mood, sleep_quality, symptoms[])

-- Training — generic activity type supports multi-sport from day one
plan_templates      (id, name, sport_type, distance_goal, duration_weeks, sessions_json)
user_plans          (id, user_id, template_id, start_date, goal_date, is_active)
                    -- superseded by training_blocks for new users; kept for backwards compat
training_blocks     (id, user_id, template_id, starts_on, ends_on, load_modifier, modality, event_id)
                    -- modality: run | strength | swim | yoga | other
                    -- overlapping blocks supported (e.g. run plan + gym 2×/wk simultaneously)
planned_sessions    (id, user_id, block_id, scheduled_date, week_number, day_of_week,
                     modality, session_label, status, moved_to_id, activity_id, created_at)
                    -- status: planned | completed | dropped | moved
                    -- day_of_week: 0=Mon … 6=Sun
                    -- auto-generated by scheduleGenerator when a block starts
activities          (id, user_id, activity_type, started_at, duration_seconds, distance_meters,
                     notes, phase_at_time, hk_uuid, planned_session_id)
                    -- activity_type: run | swim | strength | yoga | other
run_details         (id, activity_id, avg_pace_seconds_per_km, splits_json, hr_avg, hr_max,
                     elevation_gain_meters, gps_trace)
strength_details    (id, activity_id, session_type, exercises_json)
                    -- session_type: lower | upper | general
                    -- exercises_json: [{name, sets:[{reps,weight_kg,rpe?}], notes?}]

-- Nutrition
nutrition_logs      (id, user_id, recorded_on, phase_at_time, training_load, inferred_load, targets_json)
                    -- inferred_load: system-recommended load from planned_sessions (may differ from training_load if user overrode)
food_entries        (id, log_id, meal_type, nutritionix_id, food_name, quantity_g,
                     carbs_g, protein_g, fat_g, calories)

-- Intelligence
insights_cache      (id, user_id, insight_type, phase, training_text, nutrition_text, overall_text,
                     generated_at, expires_at, input_tokens, output_tokens)
                    -- insight_type: dashboard | weekly. UNIQUE (user_id, insight_type)
                    -- expires_at set to now() by 5 Postgres triggers on data change (lazy Haiku regen)

-- Content + Auth
articles            (id, title, slug, body_md, tags[], linked_feature, published_at)
user_profiles       (id [FK→auth.users], fitness_level, running_goal, dietary_prefs,
                     baseline_pace_seconds_per_km, weekly_mileage_km,
                     assessment_history, onboarding_complete)
                    -- fitness_level: beginner | recreational | intermediate | advanced
                    -- running_goal: 5k | 10k | half_marathon | marathon | general
fitness_assessments (id, user_id, assessed_on, stated_level, actual_pace_seconds_per_km,
                     trigger_description, celebrated_at)
subscriptions       (id, user_id, rc_customer_id, sub_status, trial_end, activated_at)
                    -- sub_status: trial | active | expired | cancelled
```

---

## Build sequence (scaffold-first)

### Phase A — Foundation ✅ complete
- ✅ Expo + expo-router project init
- ✅ Supabase project + full schema
- ✅ Design system tokens + shared component library
- ✅ Auth flow (email + Apple Sign-In)
- ✅ Navigation shell (4 tabs + Profile drawer)
- ✅ RevenueCat paywall
- ✅ Zustand store
- ✅ HealthKit permissions + observer setup

### Phase B — Core VIRRA features ✅ complete
- ✅ Cycle phase engine (on-device)
- ✅ Onboarding flow (all 7 steps)
- ✅ Dashboard home screen
- ✅ Training plan templates + active plan view
- ✅ Nutrition daily log (cycle × training matrix)
- ✅ Education Library + Article viewer
- ✅ Daily check-in modal
- ✅ Fitness assessment dynamic logic

### Phase C — Data collection ✅ complete
- ✅ HealthKit background import pipeline (HKObserverQuery + HKAnchoredObjectQuery)
- ✅ GPS run tracker (in-app)
- ✅ Activity Timeline screen
- ~~Nutritionix food search + barcode scan~~ — deferred (see Phase 2)
- ✅ Manual activity log (fallback) — run, swim, strength, yoga, other
- ✅ Strength workout recording — `strength_details` table, 57-exercise library (lower/upper/general), RPE tracking
- ✅ Smart notification cancellation logic

### Phase D — Intelligence + Polish (in progress)
- ✅ On-device insight metrics — `insightMetrics.ts` (adherence %, nutrition compliance %, symptom trend, fuelling alignment)
- ✅ Haiku narrative insights — `generate-insights` Edge Function, `insights_cache` table, 5 Postgres event-driven triggers
- ✅ Insights screen — THIS WEEK narrative, metric grid, Recovery (symptom bars), Upcoming 14-day (sessions + user events), AddEventModal, FUELLING alignment card
- ✅ Training context → nutrition intelligence — `dailyTrainingContext.ts` infers load from planned sessions; Nutrition screen auto-sets chip + stores `inferred_load`; WeekStrip shows load-tier label on today; `fuellingAlignment` metric in Insights
- ✅ Push notification intelligence — `inferTrainingHour(userId)` (mode hour from last 30 activities), rest-day gate (skips training notif when no planned sessions), `scheduleTrialReminders` wired in `_layout.tsx`, `getEntitlementInfo()` for trial detection
- ✅ Profile — cycle settings screen (update cycle profile post-onboarding)
- ✅ Subscription management screen — `app/(app)/subscription.tsx` (status badge colour-coded by plan, trial countdown + days remaining, upgrade CTA, manage link via RC `managementURL`, restore purchases)
- ✅ Dashboard week strip (WeekStrip — Mon–Sun session view, SF icons, colour-coded by modality, today's load-tier label)
- ✅ Training calendar (MonthCalendar in Training tab — coloured dots, drop/move/catch-up sessions)
- [ ] App Store submission prep

### Phase E — Dynamic Planning Engine ✅ complete

Four sub-projects, all shipped:

- ✅ **Sub-project 1** — Volume Intelligence + Session Detail + Smart Scheduling + Race Markers (`volumePlan.ts`, `SessionDetailModal`, race markers on `MonthCalendar`, partial unique constraint on `planned_sessions`)
- ✅ **Sub-project 2** — Plan Stacking Load-Balancing + Insights Surfacing (`buildVolumeAdjustmentNote`, `RunSessionDetail.base_distance_km`, `loadScale` per block, dropped-session breakdown in Insights)
- ✅ **Sub-project 3a** — Holiday/Illness Break Handling (`training_breaks` table, `computeBreakDays`/`applyBreak`, `BreakModal`, MonthCalendar long-press, profile break history)
- ✅ **Sub-project 3b** — Multi-Event Progressive Planning (`seasons` aggregate, `seasonEngine` with phase-based periodisation, `cycleModulation` matrix + day-anchoring, SessionDetailModal "WHY THIS PACE" card, TodaysSessionHero adjustment badge, MY SEASON timeline on Training tab)

### Phase F — Plan Editability (deferred)

Editable-season UX so users can manage their progressive training season after it's been auto-created. Tracked as a future phase (not pre-launch) but elevated from a memory note so it's visible in the roadmap.

**Scope:**
- [ ] Add an event to an existing active season — currently `recomputeSeasonForUser` is idempotent and skips a 3rd+ event insert. Needs either append-only chain extension or a destructive rebuild path that preserves completed/dropped session history. (See [`project_season_event_addition.md`](.) memory.)
- [ ] Manual priority overrides — user can demote/promote A/B/C race priority after the engine's default assignment
- [ ] Manual phase-boundary adjustments — drag a phase divider to shorten taper, lengthen build, etc.
- [ ] Recovery duration tuning — override the default `RECOVERY_WEEKS` per modality per event
- [ ] "Rebuild season" affordance — destructive button on MY SEASON timeline with confirm dialog
- [ ] Retire / archive a completed season — currently season `status` field exists (`active`/`completed`/`abandoned`) but no UX flips it
- [ ] Season recap UX — post-completion summary screen surfacing the arc the user just finished

**Why deferred:** Phase E ships a system-driven season that produces sensible defaults across the three primary scenarios (back-to-back, progressive ladder, conflict). Editability is the retention loop deepening — high value once users are 2-3 seasons in, but not blocking the first season's value delivery. Defer until post-launch usage data shows which edit affordances users actually reach for.

**How to apply:** When this phase activates, run a brainstorm session covering the seven items above. They cluster naturally — "structural edits" (events, priorities, phase boundaries) vs. "lifecycle edits" (rebuild, retire, recap). Two sub-projects (Fa / Fb) are likely.

---

## Phase 2 (post-launch — not in scope for MVP)

- Multi-sport structured plans (schema already ready — just needs plan content)
- Community & social features
- Route planning & mapping — BRouter (open-source, offline-capable routing engine) for pre-run route planning; saved routes stored in a `routes` table (user_id, name, distance_meters, gps_polyline, elevation_json, created_at); Phase C GPS tracker lays the foundation by recording `gps_trace` on every run
- Coach-to-client portal
- Perimenopause & menopause track
- Strava integration
- Race day planning tool
- Android (React Native supports it — launch 2-3 months post iOS)
- Wearable expansion (direct Garmin Connect IQ + Wahoo API beyond HealthKit bridge)
- **Food database — Open Food Facts integration:** barcode scanning + food search via the free OFF API. Strong UK/global coverage. Replace the MVP manual-entry + common-foods approach. Schema already uses `food_name`, `quantity_g`, macro fields — `nutritionix_id` column can be repurposed as `off_barcode`. Build once there's post-launch revenue to absorb any API changes.

---

## Key principles for every feature

1. **Cycle phase first** — every feature that involves training, nutrition, or recovery must be phase-aware
2. **Fuelling language only** — never use calorie restriction framing, never diet culture
3. **HealthKit-first** — check HealthKit before prompting a user to log anything manually
4. **Notifications earn their place** — every notification must cancel itself when its action is completed
5. **Build generically** — activity types, plan templates, and nutrition targets should be structured to extend, not rewrite
6. **Scaffold before features** — never add a feature to an unstable foundation

---

## Existing codebase (Astro marketing site)

The `src/` directory contains an Astro web project (holding page + blog) deployed to `virra.app`. This is the **marketing site only** — completely separate from the React Native app. No shared code. Keep it maintained as the public face of Virra during app development.

Current Astro stack: Astro + sitemap, deployed via GitHub Actions, domain `virra.app`.

Note: the Astro site uses slightly different design tokens (Cormorant + Outfit fonts) from the Vol. 02 brand guidelines. Update these to match Vol. 02 when time allows, but it is not blocking the app build.
