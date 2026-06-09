# Dashboard Redesign — Design Spec
**Date:** 2026-06-09  
**Status:** Approved (visual mockups reviewed and confirmed)

---

## Problem

The dashboard is text-heavy and low on data density. Key information (today's session, nutrition progress, momentum stats) is either buried in other tabs or absent entirely. Several Trello feature cards have been languishing in App Backlog because there was no coherent layout to place them into.

Specific gaps:
- No today's session card on dashboard — user must navigate to Training tab
- No nutrition summary visible without opening Nutrition tab
- Check-in tile is static — never reflects whether you've already checked in
- No streak or adherence signal anywhere on the dashboard
- Phase tips carousel (Trello: Feature | Dashboard - Scrollable Tips) never built
- AI guidance text cards at the bottom make the dashboard text-heavy and slow to scan
- Weight glance missing for natural/irregular cycle users after being moved to YOUR CYCLE

---

## Design Direction — Option C (Phase-Led)

Cycle phase remains the emotional anchor (Virra's core differentiator). Everything else is infographic-first: arcs, bars, and numbers rather than paragraphs. Editorial content (AI guidance) moves to the Insights screen; the dashboard becomes a data-at-a-glance surface.

---

## Layout (top → bottom scroll)

### 1. Narrative line
One italic serif sentence synthesising cycle phase + today's training + nutrition tone.  
Generated client-side from existing data — no new API call.

> *"Luteal Day 3 · Long run today · Fuel hard, rest after."*

Generation logic (deterministic, no AI):
- Segment 1 — phase: `"{phase} Day {dayOfCycle}"` e.g. "Luteal Day 3"
- Segment 2 — training: today's session label + "today" (e.g. "Long run today"), or "Rest day"
- Segment 3 — cue: derived from `phase × inferredLoad`:
  - luteal + hard/moderate → "Fuel hard, rest after."
  - luteal + easy/rest → "Keep it easy. Your body is working hard."
  - follicular + hard → "Your adaptation window — make it count."
  - menstrual + any → "Listen to your body today."
  - ovulatory + any → "Peak week. Go for it."
  - default → "Stay fuelled."

Fallbacks: no cycle data → omit segment 1; no training plan → omit segment 2, replace cue with "Fuel well today."; no data at all → hide narrative line entirely.

---

### 2. Phase hero card
**Existing content, no new data:**
- Phase pill (phase label, phase colour)
- Italic serif tagline (from `PHASE_META`)
- Progress bar (existing `CycleProgressBar`)
- Three stats: DAY · DAYS LEFT · DAY CYCLE (existing)

**New inline section at base of card:**
- Session count this month (from `activities` table, `COUNT` where `started_at >= start of month`)
- Adherence % this month: `completed / (completed + planned + dropped) × 100` where all three statuses come from `planned_sessions` with `scheduled_date >= start of current month`. Sessions with `status = 'moved'` are excluded (they were rescheduled, not missed). Integer, clamped to 0–100.
- Displayed as: `11` (large display number, dawn colour) + `sessions this month` label · `87% ON PLAN` pill (right-aligned, phase colour)

Tapping the card navigates to `/(app)/cycle-detail` (existing behaviour).

---

### 3. Today's session + Activity rings row (side by side)

**Left — Today's session card** (`TodaysSessionHero` already exists — surface it here)
- Kicker: "TODAY" in pulse mono
- Session name (e.g. "Long Run", "Strength", "Yoga")
- Three stats: Distance · Target pace · Estimated duration
- `▶ START RUN` / `▶ START SESSION` button → routes to `SessionDetailModal` (Phase I Sub-project 2 will upgrade this to a live execution screen; for now the modal is the correct destination)
- **Rest day state:** italic serif copy ("Rest day. Let your body absorb the week's work."), no CTA button, muted card styling
- **No active plan state:** serif prompt ("Select a training plan to see your schedule here") + "SET UP PLAN" button

**Right — Activity rings card** (existing `ActivityRings` component, no changes)

---

### 4. Nutrition arc card

**New component: `NutritionArcCard`**

Data source: today's `nutrition_logs` row joined with `food_entries`. Reads `targets_json` for targets. Falls back to phase × load defaults if no log exists yet.

Layout:
- Kicker: "FUELLING TODAY"
- Arc: `<svg>` circle showing calories logged as % of daily target. Colour: dawn (`#FF6B3D`). Centre label: `68%` (display font) + `KCAL` (mono sub-label).
- Macro bars (3 rows): CARB · PRO · FAT. Each row: label + progress track + value in grams. Colours: pulse (carb), dawn (protein), muted cream (fat).
- If no entries yet: arc shows 0%, bars empty, copy: "Log your first meal to track today's fuel."
- Tapping the card navigates to `/(app)/(tabs)/nutrition`.

---

### 5. Quick log row

**New component: `QuickLogRow`**

Three equal icon-button tiles in a flex row:
- 🍽 FOOD → opens food entry modal (`/(app)/food-search`)
- ⚡ ACTIVITY → opens manual activity modal (`/(app)/manual-activity`)
- ⚖️ WEIGHT → opens `AddWeightModal` (only rendered if `trackWeight === true`; otherwise hidden, gap redistributed)

Styling: muted border, low-opacity fill, Space Mono label beneath icon. No active/inactive states — always available.

---

### 6. This Week strip card (existing `WeekStrip`)

No changes to the component. Wrap in the consistent card container with 8px gap above and below. Tapping navigates to Training tab (existing behaviour).

---

### 7. Phase tips carousel

**New component: `TipsCarousel`**

**Supabase schema addition:**
```sql
create table tips (
  id           uuid primary key default gen_random_uuid(),
  phase        text not null check (phase in ('menstrual','follicular','ovulatory','luteal','all')),
  category     text not null check (category in ('training','nutrition','lifestyle')),
  tip_text     text not null,
  detail_text  text,           -- optional expanded copy shown on tap
  active       boolean default true,
  sort_order   integer,
  created_at   timestamptz default now()
);
-- RLS: read-only for authenticated users
```

Emma manages content directly in Supabase. No dev work needed to add/edit tips.

**Component behaviour:**
- Fetches tips filtered by `phase = currentPhase OR phase = 'all'`, `active = true`
- Randomises order per session (shuffle on mount)
- Renders as a horizontal `ScrollView` with `pagingEnabled: false` (peek at next card)
- Each tip card: category label (phase colour) + tip text (body font, 14px)
- Tapping a card is a no-op at launch (expand behaviour is V2, see Out of Scope)
- Falls back to generic tips (`phase = 'all'`) if no cycle data set
- Minimum viable tip bank: 3 per phase per category = 36 tips at launch (Emma to populate)

Card width: 65% of screen width. Show ~1.4 cards visible at a time (peek pattern).

---

### 8. Action tiles — Insights + Check In

**Insights tile** — unchanged from current. Pulse border, navigates to `/(app)/insights`.

**Check In tile — new adaptive states:**

State A — not yet checked in today:
```
◯  CHECK IN
   30 seconds
```
Dawn border. Tapping opens `/(app)/checkin` modal.

State B — checked in today (new):
```
✅  ✓ CHECKED IN   [Tap to edit]
    ─────────────────────────────
    4         3         5
  ENERGY    MOOD     SLEEP
```
Pulse border + subtle pulse background. Shows the three scale values logged today. "Tap to edit" opens the same checkin modal pre-populated with today's values.

Data: query `symptom_logs` for `recorded_on = today` and `user_id = current user`. If row exists, show State B.

---

## What's removed from the dashboard

| Removed | Rationale |
|---|---|
| `GuidanceCard` (Training AI text) | Moves to Insights screen. Dashboard is data-first; editorial lives in Insights. |
| `GuidanceCard` (Nutrition AI text) | Same — Insights screen. |
| `WeightGlanceCard` (dashboard, steady users) | Kept in YOUR CYCLE for all users. Weight tracking is opt-in and not primary dashboard content. |

The AI guidance cards remain on the Insights screen and continue to be generated and cached as before. Nothing is deleted from the backend.

---

## Weight glance fix (cycle-detail.tsx)

Separate from the dashboard redesign but resolved in the same pass:

In `cycle-detail.tsx` line 159, `WeightGlanceCard` is rendered without `onPress`. This means the card is inert — users can't tap it to navigate to the weight detail screen.

**Fix:** pass `onPress={() => router.push('/(app)/weight' as any)}` to the `WeightGlanceCard` in `cycle-detail.tsx`.

---

## New Supabase migration

```sql
-- Migration: add tips table
create table tips (
  id           uuid primary key default gen_random_uuid(),
  phase        text not null check (phase in ('menstrual','follicular','ovulatory','luteal','all')),
  category     text not null check (category in ('training','nutrition','lifestyle')),
  tip_text     text not null,
  detail_text  text,
  active       boolean default true,
  sort_order   integer,
  created_at   timestamptz default now()
);

alter table tips enable row level security;
create policy "tips_read" on tips for select to authenticated using (true);

-- Seed: 3 tips per phase per category (36 total — to be populated by Emma)
-- Insert placeholder rows so the component renders on day one:
insert into tips (phase, category, tip_text, active) values
  ('menstrual',  'training',   'Bleed days call for gentler effort. Walk, stretch, or a short easy run — honour how you feel.',  true),
  ('menstrual',  'nutrition',  'Iron-rich foods support what your body loses during your period. Red meat, lentils, spinach.',   true),
  ('menstrual',  'lifestyle',  'Rest is training. Your body is doing a lot right now — sleep and warmth are your tools.',         true),
  ('follicular', 'training',   'Your peak adaptation window. Hard sessions pay dividends now — your body is primed.',             true),
  ('follicular', 'nutrition',  'Oestrogen suppresses appetite in follicular phase. Hit protein targets even when not hungry.',    true),
  ('follicular', 'lifestyle',  'Social energy peaks in follicular. Use it — a group run or a class can lift performance.',       true),
  ('ovulatory',  'training',   'Strength and power peak around ovulation. A good week for PBs and race efforts.',                true),
  ('ovulatory',  'nutrition',  'A brief water lift around ovulation is normal. Stay hydrated — it supports performance.',        true),
  ('ovulatory',  'lifestyle',  'Confidence is high right now. Set intentions, have the hard conversations, lead the run.',       true),
  ('luteal',     'training',   'Effort feels harder now. That''s real — not weakness. Run to feel, not to pace.',                true),
  ('luteal',     'nutrition',  'Carb cravings are hormonal signals. Honour them with quality fuel before long efforts.',         true),
  ('luteal',     'lifestyle',  'Sleep quality dips in luteal. Aim for 8h and lower screen time before bed.',                     true);
```

---

## Trello cards addressed

| Card | Status after this work |
|---|---|
| Feature \| Dashboard - Today Training | ✅ Addressed by Today's session card |
| Feature \| Dashboard - This Week's Training | ✅ Already existed as WeekStrip — stays |
| Feature \| Dashboard - Scrollable Tips | ✅ Addressed by TipsCarousel + tips table |
| Feature \| Dashboard - Activity Widget | ✅ Already existed as ActivityRings — stays |
| Feature \| Dashboard - Check-In | ✅ Addressed by adaptive Check-in tile |
| App \| Feature - Dashboard / Weekly Overview | ✅ Covered by Today's session card |
| App \| Bug - Remove Weight Insights from Dashboard | ✅ Already moved to YOUR CYCLE; WeightGlanceCard onPress fix |

---

## Components summary

| Component | Action | Notes |
|---|---|---|
| `DashboardScreen` (index.tsx) | Rewrite | New layout, new data hooks |
| `NutritionArcCard` | New | SVG arc + macro bars |
| `TipsCarousel` | New | Horizontal scroll, Supabase `tips` query |
| `QuickLogRow` | New | 3 icon log shortcut buttons |
| `PhaseNarrative` | New (inline fn or small component) | Generates narrative line from existing state |
| `TodaysSessionHero` | Exists — surface on dashboard | Already in Training tab; reuse as-is |
| `WeekStrip` | Exists — no changes | Card wrapper only |
| `ActivityRings` | Exists — no changes | Card wrapper only |
| `GuidanceCard` | Remove from dashboard | Stays on Insights screen |
| `cycle-detail.tsx` | One-line fix | Add `onPress` to `WeightGlanceCard` |
| Supabase `tips` table | New migration | Seed with 12 initial tips |

---

## Out of scope

- "Dashboard / Cycle Info" QA card — awaiting clarification from Emma
- Phase tips expanded detail bottom sheet — tip cards tap-to-expand is V2; launch with static cards
- Weight compact glance on dashboard — not selected during brainstorm; stays in YOUR CYCLE
