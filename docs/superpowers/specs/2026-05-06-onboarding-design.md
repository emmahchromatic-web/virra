# Onboarding Flow — Design Spec
**Date:** 2026-05-06  
**Status:** Approved for implementation

---

## Overview

7-step linear wizard shown to new users only, immediately after auth. Collects the data the cycle phase engine and training/nutrition features need to function from day one. Ends at the existing paywall screen.

---

## Route Structure

New route group: `mobile/app/(onboarding)/`

```
(onboarding)/
  _layout.tsx       — shared header + progress bar, no tab bar
  welcome.tsx       — step 1
  fitness.tsx       — step 2
  goal.tsx          — step 3
  cycle.tsx         — step 4
  diet.tsx          — step 5
  permissions.tsx   — step 6
  (paywall already exists at (auth)/paywall.tsx — step 7)
```

Navigation uses `router.push` for steps 1–5 and `router.replace` for step 6 → paywall to prevent back-stack pollution.

---

## New User Detection

After successful auth, `(auth)/index.tsx` checks Supabase `user_profiles` for the current user:
- No profile row → `router.replace('/(onboarding)/welcome')`
- Profile row exists → `router.replace('/(app)')`

Onboarding is considered complete when step 5 (diet) is submitted: a `user_profiles` row is written at that point. Permissions and paywall are post-completion gates.

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

- **Steps 1–5:** Back arrow visible top-left. Step 1 (Welcome) has no back arrow (first step).
- **Steps 6–7:** No back arrow. These are the "commitment zone" — permissions and paywall. Grouping them at the end means the no-back transition is natural rather than jarring.

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

### Step 2 — Fitness Assessment
**Purpose:** Self-reported baseline for plan generation. Stored in `fitness_assessments` and `user_profiles`.

**Fields:**
1. **Fitness level** — 4-option card selector: Beginner / Recreational / Intermediate / Advanced
2. **Weekly mileage** — stepper or segmented control: `<5 / 5–15 / 15–30 / 30+` (km)
3. **Recent 5K time** — optional text input (MM:SS), labelled "Leave blank if you haven't raced"

**Data collected:** `fitness_level`, `weekly_mileage_bracket`, `recent_5k_time`  
**Writes to:** `fitness_assessments` row, reflected in `user_profiles.fitness_level`  
**Navigation:** Back to step 1 · Continue → step 3

---

### Step 3 — Running Goal
**Purpose:** Sets the active training plan type from day one.

**Fields:**
- Single-select card grid: 5K / 10K / Half Marathon / Marathon / General Fitness

**Data collected:** `running_goal`  
**Writes to:** `user_profiles.goal`  
**Navigation:** Back to step 2 · Continue → step 4

---

### Step 4 — Cycle Data
**Purpose:** Activates the cycle phase engine immediately after this step.

**Fields:**
1. **Last period start date** — date picker, defaults to ~28 days ago
2. **Average cycle length** — stepper: 21–40 days, default 28

**Data collected:** `period_start`, `cycle_length`  
**Writes to:** `cycle_logs` row · triggers `useCycleStore.setPeriodStart()` locally  
**Navigation:** Back to step 3 · Continue → step 5

---

### Step 5 — Dietary Preferences
**Purpose:** Shapes nutrition guidance and food suggestions.

**Fields:**
- Multi-select chip grid (none selected = no restrictions):
  Vegan / Vegetarian / Gluten-free / Dairy-free / Nut-free / Halal

**Data collected:** `dietary_prefs[]`  
**Writes to:** `user_profiles.dietary_prefs` + creates the `user_profiles` row (marks onboarding complete)  
**Navigation:** Back to step 4 · Continue → step 6

---

### Step 6 — Permissions
**Purpose:** Request Location, HealthKit, Notifications, and Camera. Each sub-step shows a context screen before the iOS dialog fires.

**Pattern (per permission):**
```
[PERMISSION NAME]           ← lime label (Space Mono, 10px)
[Editorial headline]        ← Big Shoulders, 24px
[Plain explanation copy]    ← Inter, body
┌─────────────────────┐
│ WHY THIS MATTERS    │  ← #1C1C24 card
│ [consequence copy]  │
└─────────────────────┘
[Continue]                  ← fires iOS dialog
[Skip for now]              ← ghost link, only on Camera (required: Location, HealthKit, Notifications)
```

**Permissions in order:**
1. **Location** — "GPS + LOCATION" / *"Track every run, automatically."* / Required
2. **HealthKit** — "HEALTH + ACTIVITY" / *"Your Watch. Your runs. All in one place."* / Required
3. **Notifications** — "REMINDERS + ALERTS" / *"Stay on track without checking the app."* / Required
4. **Camera** — "BARCODE SCANNER" / *"Log food in seconds."* / Optional (Skip for now available)

Each permission uses `expo-location`, `react-native-health`, `expo-notifications`, `expo-camera` request APIs respectively.

**Navigation:** No back arrow · After last permission → `router.replace('/(auth)/paywall')`

---

## Shared Layout (`_layout.tsx`)

- Background: `colors.mile` (`#0A0A0F`)
- No tab bar
- Progress pills top-centre
- Back arrow top-left (hidden on steps 1, 6, 7)
- Step prop passed via route params or context

---

## State

No new store needed for onboarding itself — data is written directly to Supabase and to existing stores (`useCycleStore`, `useAuthStore`) as each step completes. No draft/resume state; if the user exits mid-onboarding, they restart from step 1 (profile row not yet written until step 5).

---

## Design Tokens Applied

- Headlines: `Big Shoulders Display 900`
- Permission labels: `Space Mono`, uppercase, `#D4FF26`, 10px
- Body: `Inter 400`, `rgba(244,237,224,0.6)`
- CTA buttons: `VirraButton` (existing component), full-width
- Cards/selectors: `VirraCard` with `accent` prop for selected state
- Background: `#0A0A0F` · Card backgrounds: `#1C1C24`
