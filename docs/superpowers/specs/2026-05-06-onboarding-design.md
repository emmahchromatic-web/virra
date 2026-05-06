# Onboarding Flow — Design Spec
**Date:** 2026-05-06  
**Status:** Approved for implementation

---

## Overview

7-step linear wizard shown to new users only, immediately after auth. Permissions are requested at step 2 (before data collection) so HealthKit data can pre-fill Fitness Assessment, Running Goal, and Cycle Data steps. Ends at the existing paywall screen.

---

## Route Structure

New route group: `mobile/app/(onboarding)/`

```
(onboarding)/
  _layout.tsx       — shared header + progress bar, no tab bar
  welcome.tsx       — step 1
  permissions.tsx   — step 2
  fitness.tsx       — step 3
  goal.tsx          — step 4
  cycle.tsx         — step 5
  diet.tsx          — step 6
  (paywall already exists at (auth)/paywall.tsx — step 7)
```

Navigation uses `router.push` throughout steps 1–6. Step 6 → paywall uses `router.replace` to prevent back-stack pollution into the app.

---

## New User Detection

After successful auth, `(auth)/index.tsx` checks Supabase `user_profiles` for the current user:
- No profile row → `router.replace('/(onboarding)/welcome')`
- Profile row exists → `router.replace('/(app)')`

Onboarding is considered complete when step 6 (diet) is submitted: the `user_profiles` row is written at that point.

---

## Progress Indicator

Shown in the shared `_layout.tsx` header on all 7 steps.

- 7 equal-width pill segments (`height: 3px`, `border-radius: 2px`)
- Filled pills: `#D4FF26` (pulse)
- Unfilled pills: `rgba(212,255,38,0.15)`
- No step numbers, no labels — clean and minimal
- Pills reflect the current step number (advance on forward, decrement on back)

---

## Back Navigation

- **Step 1 (Welcome):** No back arrow (first step)
- **Steps 2–6:** Back arrow visible top-left. On the permissions screen, back navigates to Welcome before any iOS dialog has fired; after dialogs fire, back still works but dialogs won't re-fire.
- **Step 7 (Paywall):** No back arrow — only hard no-back gate.

---

## Step Details

### Step 1 — Welcome
**Purpose:** Value prop. Why Virra is different.

**Content:**
- Large `VIRRA` display wordmark
- Headline: *"Training that works with your cycle, not against it."*
- 3 short benefit bullets (cycle-adjusted plans / phase-aware nutrition / seamless HealthKit sync)
- CTA: "Get started"

**Data collected:** None  
**Navigation:** No back · Continue → step 2

---

### Step 2 — Permissions
**Purpose:** Request Location, HealthKit, Notifications, and Camera early so subsequent steps can pre-fill from HealthKit data.

**Rationale for early placement:** HealthKit grants access to workout history (pace, distance, best times), menstrual flow logs, and activity patterns — data that directly pre-populates steps 3, 4, and 5. Requesting permissions here makes the rest of onboarding smarter and reduces manual input.

**Pattern (per permission):**
```
[PERMISSION NAME]           ← lime label (Space Mono, 10px, uppercase)
[Editorial headline]        ← Big Shoulders 900, 24px
[Plain explanation copy]    ← Inter 400, rgba(244,237,224,0.6)
┌─────────────────────┐
│ WHY THIS MATTERS    │  ← #1C1C24 card
│ [consequence copy]  │
└─────────────────────┘
[Continue]                  ← fires iOS dialog
[Skip for now]              ← ghost link, Camera only
```

**Permissions in order:**
1. **HealthKit** — "HEALTH + ACTIVITY" / *"Your health data, working for you."* / Required  
   WHY: Virra reads your workout history to pre-fill your fitness baseline and pulls cycle data if you've logged it in Apple Health. Your data never leaves your device.
2. **Location** — "GPS + LOCATION" / *"Track every run, automatically."* / Required  
   WHY: Without this, Virra can't track runs live. Your Watch data still syncs automatically.
3. **Notifications** — "REMINDERS + ALERTS" / *"Stay on track without checking the app."* / Required  
   WHY: Virra only sends reminders when the action hasn't been done. Training reminders cancel when your workout is logged; nutrition reminders cancel when you've logged a meal.
4. **Camera** — "BARCODE SCANNER" / *"Log food in seconds."* / Optional (Skip for now available)  
   WHY: Scan any barcode to log food instantly. You can always add this later in Settings.

Each permission uses `react-native-health`, `expo-location`, `expo-notifications`, `expo-camera` request APIs respectively.

**Navigation:** Back to step 1 · After last permission → step 3

---

### Step 3 — Fitness Assessment
**Purpose:** Self-reported baseline for plan generation. Pre-filled from HealthKit where available.

**HealthKit pre-fill logic (runs after permissions granted):**
- **Fitness level:** Derive from average pace of last 90 days of running workouts (sub-5:00/km → Advanced, 5–6:30 → Intermediate, 6:30–8:00 → Recreational, slower/none → Beginner)
- **Weekly mileage:** Average weekly distance across last 8 weeks of HK workouts, snapped to nearest bracket
- **Recent 5K time:** Find HK workouts closest to 5km, surface best time

Pre-filled values are shown selected but editable. A "From Apple Health" badge appears next to any pre-filled field. If no HealthKit data is available, fields default to empty/middle values.

**Fields:**
1. **Fitness level** — 4-option card selector: Beginner / Recreational / Intermediate / Advanced
2. **Weekly mileage** — segmented control: `<5 / 5–15 / 15–30 / 30+` (km)
3. **Recent 5K time** — optional text input (MM:SS), labelled "Leave blank if you haven't raced"

**Data collected:** `fitness_level`, `weekly_mileage_bracket`, `recent_5k_time`  
**Writes to:** `fitness_assessments` row, reflected in `user_profiles.fitness_level`  
**Navigation:** Back to step 2 · Continue → step 4

---

### Step 4 — Running Goal
**Purpose:** Sets the active training plan type from day one.

**HealthKit pre-fill logic:**
- Find best recorded times in HK for each distance (5K, 10K, 21.1K, 42.2K)
- Surface the furthest distance with a recorded time as the suggested goal
- If marathon time exists → default to Marathon; if only 5K exists → default to 5K; if nothing → no default

Pre-filled selection shown highlighted with "Based on your best times" label above the grid.

**Fields:**
- Single-select card grid: 5K / 10K / Half Marathon / Marathon / General Fitness

**Data collected:** `running_goal`  
**Writes to:** `user_profiles.goal`  
**Navigation:** Back to step 3 · Continue → step 5

---

### Step 5 — Cycle Data
**Purpose:** Activates the cycle phase engine immediately after this step.

**HealthKit pre-fill logic:**
- Query `HKCategoryTypeIdentifierMenstrualFlow` for most recent period start date
- If 2+ period entries exist, estimate average cycle length from interval between them
- Pre-fill date picker and cycle length stepper; show "From Apple Health" badge

**Fields:**
1. **Last period start date** — date picker, defaults to HealthKit value or ~28 days ago
2. **Average cycle length** — stepper: 21–40 days, default from HealthKit estimate or 28

**Data collected:** `period_start`, `cycle_length`  
**Writes to:** `cycle_logs` row · triggers `useCycleStore.setPeriodStart()` locally  
**Navigation:** Back to step 4 · Continue → step 6

---

### Step 6 — Dietary Preferences
**Purpose:** Shapes nutrition guidance and food suggestions. No HealthKit equivalent — always manual.

**Fields:**
- Multi-select chip grid (none selected = no restrictions):  
  Vegan / Vegetarian / Gluten-free / Dairy-free / Nut-free / Halal

**Data collected:** `dietary_prefs[]`  
**Writes to:** `user_profiles.dietary_prefs` + creates the full `user_profiles` row (marks onboarding complete)  
**Navigation:** Back to step 5 · Continue → `router.replace('/(auth)/paywall')`

---

## Shared Layout (`_layout.tsx`)

- Background: `colors.mile` (`#0A0A0F`)
- No tab bar
- Progress pills top-centre
- Back arrow top-left (hidden on step 1 and paywall only)
- Step index passed via a shared context or Zustand slice (not route params — avoids URL exposure)

---

## HealthKit Pre-fill — Implementation Notes

- All HK queries run in a `useEffect` in the relevant step screen, after the permissions step completes
- Pre-fill is best-effort: any HK query failure silently falls back to manual defaults
- Pre-filled values are always overridable — user is never locked into a derived value
- "From Apple Health" badge: `Space Mono`, 10px, `rgba(212,255,38,0.5)`, shown inline next to pre-filled fields

---

## State

No dedicated onboarding store — data is written to Supabase and existing stores as each step completes. No draft/resume: if the user exits mid-onboarding before step 6, the `user_profiles` row is not yet written and they restart from step 1 on next launch.

---

## Design Tokens Applied

- Headlines: `Big Shoulders Display 900`
- Permission / field labels: `Space Mono`, uppercase, `#D4FF26`, 10px
- Body: `Inter 400`, `rgba(244,237,224,0.6)`
- CTA buttons: `VirraButton` (existing component), full-width
- Cards/selectors: `VirraCard` with `accent` prop for selected state
- Background: `#0A0A0F` · Card backgrounds: `#1C1C24`
