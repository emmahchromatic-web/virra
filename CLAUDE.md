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
| Food database | Nutritionix API | 800k+ foods, barcode scan, natural language |
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
cycle_logs          (user_id, period_start, cycle_length, phase_overrides)
symptom_logs        (user_id, date, energy, mood, sleep, symptoms[])

-- Training — generic activity type supports multi-sport from day one
plan_templates      (sport_type, weeks, sessions_json)   -- sport_type extensible
user_plans          (user_id, template_id, start_date, goal_date)
activities          (user_id, type, duration, distance, notes, phase_at_time, hk_uuid)
                    -- type: run | swim | strength | yoga | other
run_details         (activity_id, gps_trace, avg_pace, splits, hr_avg)

-- Nutrition
nutrition_logs      (user_id, date, phase_at_time, training_load, targets_json)
food_entries        (log_id, meal_type, nutritionix_id, qty, macros)

-- Content + Auth
articles            (title, body_md, tags[], linked_feature)
user_profiles       (user_id, fitness_level, goal, dietary_prefs, baseline_pace, assessment_history[])
fitness_assessments (user_id, date, stated_level, actual_pace, trigger, celebrated_at)
subscriptions       (user_id, rc_customer_id, status, trial_end, activated_at)
```

---

## Build sequence (scaffold-first)

### Phase A — Foundation (before any feature)
- Expo + expo-router project init
- Supabase project + full schema
- Design system tokens + shared component library
- Auth flow (email + Apple Sign-In)
- Navigation shell (4 tabs + Profile drawer)
- RevenueCat paywall
- Zustand store
- HealthKit permissions + observer setup

### Phase B — Core VIRRA features
- Cycle phase engine (on-device)
- Onboarding flow (all 7 steps)
- Dashboard home screen
- Training plan templates + active plan view
- Nutrition daily log (cycle × training matrix)
- Education Library + Article viewer
- Daily check-in modal
- Fitness assessment dynamic logic

### Phase C — Data collection
- HealthKit background import pipeline (HKObserverQuery + HKAnchoredObjectQuery)
- GPS run tracker (in-app)
- Activity Timeline screen
- Nutritionix food search + barcode scan
- Manual activity log (fallback)
- Smart notification cancellation logic

### Phase D — Intelligence + Polish
- On-device insight metrics
- Haiku narrative insights (weekly + monthly, cached)
- Insights screen
- Push notification scheduling
- Profile + subscription management screens
- App Store submission prep

---

## Phase 2 (post-launch — not in scope for MVP)

- Multi-sport structured plans (schema already ready — just needs plan content)
- Community & social features
- Route planning & mapping
- Coach-to-client portal
- Perimenopause & menopause track
- Strava integration
- Race day planning tool
- Android (React Native supports it — launch 2-3 months post iOS)
- Wearable expansion (direct Garmin Connect IQ + Wahoo API beyond HealthKit bridge)

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
