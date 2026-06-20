# VIRRA — Claude Code Project Guide



---

## Supabase MCP

The Supabase MCP server is configured for this project (`project_ref: elebuieojodsjmghwjub`). Use it to inspect tables, run queries, and apply migrations directly rather than asking the user to run SQL manually.

```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=elebuieojodsjmghwjub"
```

---

## Trello (project tracker)

Work is tracked on the Trello board **Virra.app** — board URL `https://trello.com/b/M7tjcDl3/virraapp` (short id `M7tjcDl3`). Lists: Backlog [Day Two] · Web Backlog · App Backlog · In Progress · In Code Review · In Staging · Done · Abandoned. Members: Paul (`pauldickenson4`), Emma (`emmaharrison120`).

Access is via the **Trello REST API directly** (no MCP, no browser automation). Credentials live in a gitignored local file `~/.trello.env` (never commit them, never echo them):

```bash
# ~/.trello.env  (export TRELLO_KEY=... and TRELLO_TOKEN=...)
source ~/.trello.env
# read: board lists + cards
curl -s "https://api.trello.com/1/boards/M7tjcDl3?fields=name,url&lists=open&cards=open&card_fields=name,idList&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
# read ONE card in full — its DESCRIPTION *and* its COMMENTS (read both, always):
curl -s "https://api.trello.com/1/cards/{id}?fields=name,desc&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
curl -s "https://api.trello.com/1/cards/{id}/actions?filter=commentCard&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
# move a card to a list:   PUT  /1/cards/{id}?idList={listId}
# comment on a card:       POST /1/cards/{id}/actions/comments  (text=...)  — @emmaharrison120 mentions notify her
```

**Always read both the card description AND its comments before acting on a card.** Comments carry decisions, scope changes, context and feedback that the description alone misses — these have been overlooked in the past and must not be ignored. Never act on a card from its title/description alone; pull its comment thread first.

Keep secrets in env vars in the command (`$TRELLO_KEY`/`$TRELLO_TOKEN`) so they never appear in transcripts. Moving cards / commenting are shared, visible actions on a board Paul doesn't own — confirm intent before writing, and tag `@emmaharrison120` when a card needs her review.

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
| Food database | Open Food Facts API | Free, open source, strong UK/global coverage. Barcode scan + food search shipped — replaces Nutritionix entirely. |
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

### Sub-menu screen pattern (card-presentation screens)

Every card-presentation screen reached from Dashboard, Training, Profile, etc. uses the **same inline header** — never `AppHeader`. `AppHeader` is reserved for the top-level tab screens (Dashboard, Training, Nutrition, Library) where it shows the VIRRA logo and the profile/bell buttons.

Sub-menu header is a single flex row, three columns:

```tsx
<View style={s.header}>
  <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
    <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
  </Pressable>
  <VirraText variant="display" size={24} color={colors.pulse}>Title</VirraText>
  <View style={s.headerBtn} />   {/* spacer, or a right-side action icon */}
</View>
```

```ts
header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
```

Rules:
- Title is **Title Case**, never SCREAMING — the `display` variant uppercases via CSS. Passing "NOTIFICATIONS" double-uppercases conceptually and reads wrong in code review.
- Left slot is always `chevron.left`, muted tint — back/close action. Even modal-feeling utility screens (subscription, notifications, breaks) use chevron, not `xmark`, to stay consistent. `xmark` is reserved for true full-screen modals (run, food-search, manual-activity).
- Right slot is a spacer (same `headerBtn` style with no children) when there's no top-level action, or a single `SymbolView` action icon (`plus`, `ellipsis`, etc.) when there is.
- Use `SafeAreaView edges={['top']}` from `react-native-safe-area-context` as the screen root.
- Examples to copy from: `app/(app)/subscription.tsx`, `app/(app)/breaks.tsx`, `app/(app)/insights.tsx`, `app/(app)/cycle-settings.tsx`, `app/(app)/notifications.tsx`.

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
- ✅ Fitness assessment — onboarding self-report + schema. (Dynamic baseline self-correction — the Fitness Update detection + modal — was NOT built here despite this earlier ✅; it shipped in Phase F3a, 2026-05-28.)

### Phase C — Data collection ✅ complete
- ✅ HealthKit background import pipeline (HKObserverQuery + HKAnchoredObjectQuery)
- ✅ GPS run tracker (in-app)
- ✅ Activity Timeline screen
- ✅ Open Food Facts food search + barcode scan — `food-search.tsx`, repurposed `nutritionix_id` column as `off_barcode`
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

### Phase G — Cycle-Narrated Weight (deferred, opt-in only)

Banded weight tracking that interprets every reading through three lenses — cycle, training, fuelling — and surfaces an insight *only* when a reading diverges from what other data predicted AND there's something specific to say about it. The framing principle: **Virra doesn't track weight, it narrates it.**

Visual design mockup: [`docs/design/phase-g-weight-tracking.html`](docs/design/phase-g-weight-tracking.html). Brainstorming for this phase happened 2026-05-14; full design captured in the mockup.

**Core architectural principles (do not lose during implementation):**

1. **Opt-in only.** Default OFF on `user_profiles.track_weight`. Until the user explicitly enables it, nothing about weight surfaces anywhere — no card, no flag, no insight, no HK pull. First-run activation shows a one-shot explainer ("This isn't a weight loss feature…") + a calibrating state until baseline stabilises (~3 cycles).
2. **Silence is the default state.** Most readings produce no insight. A user might go weeks without seeing a card, and that's correct — their body is doing what bodies do. Insights are *only* generated when |actual − expected| > threshold AND the engine can compose a meaningful explanation.
3. **Explain before flag.** When a reading diverges, the engine first searches for rationale across training (long run / race / inflammation in last 72h), nutrition (sodium / alcohol / TDEE-intake variance), cycle (phase edges, irregular cycles), and symptom logs. If rationale found → pulse-bordered "expected" card with supportive copy. If not → dawn-bordered "watch this" card with cautious framing. Never heat-coloured (no moral judgement).
4. **Predictive over reactive.** Surface forecasts the *morning of* a hard session ("tomorrow you'll likely see +1.2–1.8kg from glycogen restoration") rather than reacting to the reading after. Foresight defuses the diet-culture reflex; surprise triggers it.
5. **Delta from baseline, never absolute weight.** Baseline is the rolling median of follicular-phase readings over the last 2-3 cycles (follicular = least water, most stable). The user never sets a goal weight; it emerges from data. The hero number is "+1.5 kg from baseline," not "67.3 kg."
6. **No streaks, no trends, no targets.** These are diet-culture mechanics. Explicitly excluded.

**Surfaces:**

| Surface | Behaviour |
|---|---|
| Profile toggle | Default OFF. Toggle ON triggers explainer + HK observer + calibration state |
| Dashboard daily glance | Phrase + band-position indicator. Anticipatory copy. Gated on `track_weight` |
| Detail chart (Insights tab) | 3-cycle band visualisation, deltas not absolutes, annotated dots showing training event causes (long runs, races) |
| Insights flags | Cards only when engine has something specific to say (rapid change with rationale, projection variance, post-session water forecast) |

**Schema additions:**

```sql
alter table user_profiles
  add column track_weight                boolean default false,
  add column weight_baseline_kg          numeric,
  add column weight_baseline_computed_at timestamptz;

create table body_weights (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  recorded_on         date not null,
  weight_kg           numeric not null,
  source              text not null check (source in ('healthkit','manual')),
  cycle_day_at_time   integer,
  cycle_phase_at_time text,
  created_at          timestamptz default now()
);

-- Insights persisted per reading so the engine doesn't recompute on every Insights refresh
create table weight_insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  weight_id    uuid references body_weights(id) on delete cascade,
  variant      text not null,   -- 'post_session'|'outlier'|'rapid_loss'|'rapid_gain'|'projection_variance'
  rationale    text not null,
  data_sources text[] not null, -- ['training','nutrition','cycle','symptoms']
  surfaced_at  timestamptz default now(),
  dismissed_at timestamptz
);
```

**Training feedback loop:** Sustained underfuelling signal (down > projected for 2+ weeks while training high) → SeasonEngine downgrades upcoming hard sessions via the existing `buildVolumeAdjustmentNote` infrastructure with a new trigger source.

**Why deferred:** App Store submission is the next gate; Phase G is meaningful feature surface (schema, HK pipe, baseline computation, 4 UI surfaces, insight engine) and not blocking launch. Activates post-launch when usage data + cycle-completion patterns are available to validate the band defaults per cohort.

**How to apply:** When this phase activates, run a fresh brainstorm covering the rationale-search algorithm (which training/nutrition signals get checked in what order, what their thresholds are), then a writing-plans session. Two likely sub-projects: **Ga** ingestion + chart + glance (the foundation), **Gb** rationale-engine + insight cards + season feedback loop (the intelligence layer). The mockup is design-locked; copy iteration is fine but the architecture should hold.

### Phase H — Nutrition Input Expansion (deferred)

Two complementary additions to nutrition logging that reduce friction for foods OFF's barcode database doesn't cover well:

1. **Expanded curated common-foods list** — a designed library of UK-common items with sensible default portions (banana, slice of toast with butter, flat white, pint, generic restaurant items). Sits alongside OFF search as the first surface user sees when adding food. Higher hit rate for everyday inputs than searching OFF.

2. **Haiku-powered meal description** — a "describe a meal" entry point where the user types or speaks natural language ("Pret tuna baguette and a flat white", "Wagamama chicken katsu curry") and a Haiku edge function returns structured items with macro/calorie estimates. Critical for restaurants, takeaways, and ad-hoc meals.

**Core architectural principles:**

1. **Estimates are estimates, never truth.** Haiku-derived entries carry a `confidence` field and visually display as "estimated" — small caveat label on the entry row, not a quiet write. Users see at a glance which entries came from a precise source (barcode) vs a fuzzy one (Haiku).
2. **Edit affordance is loud, not hidden.** Long-press / tap-to-edit (already in place from the 2026-05-13 portion editing work) extends to the Haiku result modal — every parsed item is adjustable before save. The original natural-language input is stored alongside so the user can re-parse later if the estimate was wrong.
3. **Fuelling language survives the cost data.** A 1200 kcal restaurant meal is never framed as "high" — it's framed against the user's target for that day's training load. The same diet-culture discipline that governs the rest of the app applies here.
4. **Privacy disclosure on first use.** A one-shot explainer on first "describe meal" tap: "Your description goes to AI for estimation. No identifying info is sent. The text + result is stored on your account for future reference."
5. **Cost-aware.** Estimated <$0.10/user/month at typical use even uncached. Caching by description-hash is cheap to add and reduces calls further. Not blocking — ship without cache, add if cost shows up.

**Schema additions:**

```sql
-- Tag every food_entries row with how it got there
alter table food_entries
  add column source       text default 'manual'
    check (source in ('manual','off_search','off_barcode','haiku_estimate','common_food')),
  add column confidence   numeric,    -- 0..1, only set for haiku_estimate
  add column haiku_input  text;       -- the original NL description, only for haiku_estimate

-- Curated UK common-foods library (or ship as a static JSON asset — decide at brainstorm)
create table common_foods (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        text not null,      -- 'breakfast'|'lunch'|'snack'|'drink'|'restaurant_chain'
  default_grams   numeric not null,
  calories        numeric not null,
  carbs_g         numeric not null,
  protein_g       numeric not null,
  fat_g           numeric not null,
  fibre_g         numeric not null,
  sort_order      integer
);
```

**Surfaces:**

| Surface | Behaviour |
|---|---|
| Meal section "+" tap | Shows three choices: Common foods · Describe a meal · Scan barcode (existing) · Search OFF (existing) |
| Common foods picker | Categorised grid (breakfast / lunch / drink / restaurant). One tap → adjust portion → save |
| Describe a meal | Multi-line textbox, voice-input enabled. Submit → spinner ~2s → review modal |
| Review modal | Parsed items list, confidence badge per item, edit affordance, "Save" / "These aren't right — retry" |
| Entry rows | Haiku-sourced rows show a small "EST." badge in muted mono so source provenance is visible |

**Edge function:**

`estimate-meal` Supabase Edge Function calls Anthropic API with a system prompt that constrains output to strict JSON (items with name, quantity_g, kcal, carbs_g, protein_g, fat_g, fibre_g, confidence). Includes UK chain heuristics in the prompt. Graceful fallback on parse failure: surface the raw description as a single manual entry with macros = null, prompting user to fill in.

**Why deferred:** Pre-launch nutrition input is functional via OFF (barcode + search) and manual entry. Phase H is meaningful UX uplift but the gap it closes isn't blocking the first cycle of usage. Activates after launch when usage data shows the "friction events" — every time a user opens food search and gives up without saving an entry.

**How to apply:** Brainstorm first, splitting into two likely sub-projects: **Ha** common-foods library + picker UI (no AI dependency, ships fast, immediate friction reduction), **Hb** Haiku describe-meal + edge function + review modal (AI integration, more complex). Ha foundational; Hb additive. The Ha curated list could be seeded from a one-time analytics review of OFF searches that returned no results — those are the foods to add manually.

---

### Phase I — Active Workout Engine (in progress)
- ✅ Sub-project 1 (Data Foundation): plan-owned `run_structure` and `strength_structure` JSONB on `planned_sessions`, per-modality pure generators (`runWorkoutGenerator.ts`, `strengthWorkoutGenerator.ts`), `scheduleGenerator` writes structure on insert, `moveSession` preserves it, lazy backfill (`hydratePlannedSessions.ts`), cycle modulation per step at read time via `modulateRunStructure`, structure summaries surfaced on dashboard hero / SessionDetailModal step-by-step / Insights lookahead with predicted-phase
- [ ] Sub-project 2 (Active Surfaces): pre-workout preview screen, Play CTA routing (Ia), structured run live execution (Ib live), strength live screen (Ic)
- [ ] Sub-project 3 (Substitution): workout swap mechanics (Id)

### Phase J — Local Cache + Offline Resilience (deferred)

Two coupled aims: (1) cut cold-start time so screens paint immediately on launch instead of waiting on Supabase round-trips, and (2) keep the app usable on low/no signal — runs in the park, tube journeys, holiday travel. Most of Virra's value is daily decisions (today's session, today's targets, current cycle phase) — all of which the user already saw yesterday. There's no good reason for them to wait on the network to see them again.

**Core architectural principles:**

1. **Write-through cache via Zustand `persist` middleware over AsyncStorage.** Each store that holds screen-driving state (`auth`, `profile`, `cycle`, today's `planned_sessions`, active `training_blocks`, `seasons`, latest `nutrition_log`, `insights_cache`) wraps its state in `persist()`. First render hydrates from local storage synchronously — UI paints immediately. A background fetch then refreshes the store, which auto-persists. No spinner, no splash hang, no network dependency for the warm path. MMKV is the upgrade target if AsyncStorage hydration ever measures as a real bottleneck; not worth the native module for v1.

2. **Cache-first rendering, network-after refresh.** The pattern everywhere: render from store immediately, kick off the network fetch in parallel, let it update the store when it returns. Never block the UI on a fetch when stale data exists.

3. **Stale-data discipline.** Cache is safe to render for visual state (cycle phase, today's plan, profile name, this week's sessions, last known weight band). Cache is NOT authoritative for: subscription gating (RevenueCat is source of truth, always hit fresh), HealthKit (always observe), money flows, and conflict-prone writes. Each store declares its safety class so we never accidentally gate a paywall on stale data.

4. **Write queue for offline mutations.** When the user logs food, completes a session, marks a check-in, or drops/moves a planned session offline, the mutation is enqueued to AsyncStorage with a monotonic ID + payload + retry count. On next foreground with network, the queue drains in order. Each mutation type has a server-side idempotency key (e.g., the local UUID) so retries don't double-write. Conflicts (server says session already completed) resolve by trusting the server.

5. **Hydration-first routing.** The boot-blocking `user_profiles` round-trip in `app/_layout.tsx` is replaced by reading the persisted `profile` store. If hydrated profile says `onboarding_complete: true`, route straight to `(app)/(tabs)`. The network fetch still runs but no longer blocks the route decision. Cold start should drop from 2-5s to <500ms on a warm install.

6. **Offline state surfacing.** When the device is offline, a subtle banner ("OFFLINE — changes will sync when you reconnect") appears on screens that accept writes. No modal blocks, no error toasts. The user keeps working; the queue handles the rest.

**Surfaces / store changes:**

| Store | Persist | Safety class | Notes |
|---|---|---|---|
| `auth` | ✅ already (Supabase handles JWT in AsyncStorage) | — | No change needed; just verify warm-path |
| `profile` | new | safe-cache | Persist `onboarding_complete`, `fitness_level`, `running_goal`, `track_weight`, name, avatar |
| `cycle` | new | safe-cache | `periodStart`, `cycleLength`, current phase — already in Zustand, just add persist middleware |
| `subscription` | new | **NOT cacheable for gating** | Persist `status` for display only; always hit RevenueCat for gates |
| `notifications` | ✅ already | safe-cache | Existing pattern is the template |
| new `today` store | new | safe-cache | Today's planned sessions + nutrition targets + check-in status |
| new `week` store | new | safe-cache | This week's planned sessions for dashboard week-strip + training tab |
| new `season` store | new | safe-cache | Active season + upcoming events (rarely changes) |
| new `mutationQueue` store | new | write-queue | Offline writes + drain logic |

**Schema additions:** None on Supabase. All persistence is client-side AsyncStorage. Optionally a `mutation_log` table server-side if we want a server-visible audit of queued offline mutations — defer until/unless we see real conflicts in practice.

**Why deferred:** This is meaningful surface area (every store touched, every fetch path audited for cache-first rendering, the offline write-queue from scratch) and the app currently works fine when online. Splash latency is a real but tractable problem we've already mitigated via the routed-not-ready hold. Phase J becomes load-bearing once: (a) users start travelling/training in low-signal environments enough that offline writes drop, or (b) cold-start measurement shows the user_profiles fetch as the dominant cost. Activate it post-launch when those signals are clear.

**How to apply:** When this phase activates, run brainstorming first. Likely three sub-projects: **Ja** persist middleware on boot-critical stores + hydration-first routing (the cold-start win); **Jb** new today/week/season stores with cache-first rendering pattern across Dashboard, Training, Insights (the offline-read win); **Jc** mutation queue + offline banner + drain-on-foreground (the offline-write win). Ja is the foundation and ships fast; Jb extends the pattern; Jc is the most architecturally novel piece. Don't try to land all three in one plan — the write-queue alone deserves its own spec.

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
- ~~**Food database — Open Food Facts integration**~~ ✅ shipped pre-launch — barcode scan + food search live; `nutritionix_id` column repurposed as `off_barcode`

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
