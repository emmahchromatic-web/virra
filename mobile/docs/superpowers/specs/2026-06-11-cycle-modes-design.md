# Cycle Modes — Design Spec
**Cards:** 019 (cycle profile expansion) + 019.1 (hormonal contraception sub-picker)
**Date:** 2026-06-11

---

## Overview

Expands the cycle profile from 5 options to 7, introduces three named cycle modes (Flow / Pack / Steady), and adds a hormonal contraception sub-picker that routes users into the correct mode. Both the onboarding cycle screen and the post-onboarding cycle settings screen receive identical changes.

---

## Cycle Modes

| Mode | Profiles | Behaviour |
|---|---|---|
| **Flow** | `natural`, `irregular` | Full phase modulation via `getCycleInfo`. `irregular` uses half-magnitude modulation (existing). |
| **Pack** | `hormonal` + `has_placebo_week: true` | Full phase modulation using `current_pack_start` as synthetic period start. Same engine as Flow. |
| **Steady** | All others | Training-load targets only. No phase modulation. |

---

## Data Model

### New columns on `user_profiles`

```sql
contraception_type  text     -- nullable; see ContraceptionType enum below
has_placebo_week    boolean  -- nullable; only meaningful for combined_pill | ring | patch
current_pack_start  date     -- nullable; Pack mode only
```

### Updated `cycle_profile` check constraint

```sql
check (cycle_profile in (
  'natural', 'hormonal', 'irregular',
  'perimenopause', 'menopause',
  'pregnant_postpartum', 'prefer_not_to_say'
))
```

No new tables.

---

## TypeScript Types

### `cycleEngine.ts`

```ts
export type CycleProfile =
  | 'natural' | 'hormonal' | 'irregular'
  | 'perimenopause' | 'menopause'
  | 'pregnant_postpartum' | 'prefer_not_to_say';

export type CycleMode = 'flow' | 'pack' | 'steady';

export type ContraceptionType =
  | 'combined_pill' | 'ring' | 'patch'
  | 'mini_pill' | 'hormonal_iud' | 'implant'
  | 'injection' | 'other';

export function deriveCycleMode(
  profile: CycleProfile,
  hasPlaceboWeek: boolean | null,
): CycleMode {
  if (profile === 'natural' || profile === 'irregular') return 'flow';
  if (profile === 'hormonal' && hasPlaceboWeek === true) return 'pack';
  return 'steady';
}
```

### `cycleModulation.ts`

Replace the profile-based bail-out guard with a mode-based one:

```ts
// Before
if (cycle_profile === 'hormonal' || cycle_profile === 'perimenopause' || ...) return noModulation;

// After
const mode = deriveCycleMode(cycle_profile, has_placebo_week);
if (mode === 'steady') return noModulation;
// flow and pack both proceed through the MATRIX
```

`modulateForCycle` and `modulateRunStructure` gain a `hasPlaceboWeek: boolean | null` parameter. All call sites (`scheduleGenerator`, `SessionDetailModal`, plan preview) pass this through.

### `cycle.ts` Zustand store

Three new fields added to state and `loadFromSupabase`:

```ts
contraceptionType:  ContraceptionType | null   // loaded from user_profiles
hasPlaceboWeek:     boolean | null             // loaded from user_profiles
currentPackStart:   Date | null                // loaded from user_profiles
cycleMode:          CycleMode                  // derived via deriveCycleMode, not persisted
```

**Phase computation for Pack users:** `loadFromSupabase` uses `currentPackStart` (not `cycle_logs.period_start`) when `cycleMode === 'pack'`. The `getCycleInfo` call is unchanged — only the date fed into it differs.

**Defensive guard — Pack with no start date:** If `cycleMode === 'pack'` but `currentPackStart` is null, the store sets `cycleInfo` to null (same as Steady). The UI prevents this state by defaulting the date stepper to today and disabling Save until a date is set, but the engine guard is the safety net.

---

## UI

### Profile options (both screens)

Seven options in this order:

| Value | Label | Sub-label | Notes |
|---|---|---|---|
| `natural` | Regular cycle | I can roughly predict it | Shows date pickers |
| `hormonal` | Hormonal contraception | Pill, IUD, implant, patch | Shows `HormonalSubPicker` |
| `irregular` | Irregular cycle | Unpredictable or recently changed | Shows date pickers + RED-S link (passive, tappable) |
| `pregnant_postpartum` | Pregnant or postpartum | In the last 12 months | Shows disclaimer + Steady badge |
| `perimenopause` | Perimenopause | Cycles changing or stopping | Shows existing note |
| `menopause` | Menopause | No period for 12+ months | Shows existing note |
| `prefer_not_to_say` | Prefer not to say | Set this up later | Shows existing note |

### Inline expansions

All expansions render immediately below the selected card in the same scroll view. No navigation push.

**`hormonal` →** `HormonalSubPicker` component (see below)

**`pregnant_postpartum` →** Dawn-coloured disclaimer card:
> *Pregnancy and postpartum aren't a fitness question — they're a healing one.*
> Before we build you a training plan, get cleared to exercise by your midwife, GP, or a women's health physio.
> *Saving confirms you've had that conversation.*

Plus Steady mode badge (dawn colour).

**`perimenopause` / `menopause` / `prefer_not_to_say` →** existing note card (training-load only). `prefer_not_to_say` note: "Your targets are based on training load. You can update this at any time in your profile."

### `HormonalSubPicker` component

New shared component at `src/components/cycle/HormonalSubPicker.tsx`. Controlled — takes props, fires callbacks.

**Props:**
```ts
contraceptionType:    ContraceptionType | null
hasPlaceboWeek:       boolean | null
currentPackStart:     Date | null
onChange: (patch: {
  contraceptionType: ContraceptionType;
  hasPlaceboWeek: boolean | null;
  currentPackStart: Date | null;
}) => void
```

**Render logic:**

1. Type picker — 8 options (combined_pill, ring, patch, mini_pill, hormonal_iud, implant, injection, other)
2. Placebo-week sub-question — visible only when `contraceptionType` is `combined_pill | ring | patch`
   - Yes → Pack mode → pack start date stepper appears
   - No → Steady mode
3. Pack start date stepper — day-by-day arrows, same pattern as existing period-start stepper
4. Mode badge — lime for Pack, dawn for Steady
5. Copper IUD escape link — tapping resets `cycleProfile` to `'natural'` and clears all hormonal sub-fields

### Save logic (both screens)

On save, write to `user_profiles`:
- `cycle_profile`
- `contraception_type` (null if not hormonal)
- `has_placebo_week` (null if not combined/ring/patch)
- `current_pack_start` (null if not Pack)

For Pack users, do **not** write to `cycle_logs` — `current_pack_start` on `user_profiles` is the source of truth for phase computation.

For `natural` and `irregular` users, existing `cycle_logs` write behaviour is unchanged.

### Onboarding context

`OnboardingContext` gains three fields: `contraceptionType`, `hasPlaceboWeek`, `currentPackStart`. These are passed to the Supabase `user_profiles` insert on onboarding completion alongside `cycle_profile`.

---

## Edge Cases

**Copper IUD escape link** — resets `cycleProfile` to `'natural'`, clears `contraceptionType`, `hasPlaceboWeek`, `currentPackStart`. All local state only until Save is tapped.

**Switching away from hormonal** — on save with any non-hormonal profile, the three sub-fields are written as null to `user_profiles`.

**Existing `hormonal` users (pre-migration)** — `contraception_type` will be null, `has_placebo_week` will be null. `deriveCycleMode` returns `'steady'` — identical to their previous behaviour. They see the sub-picker on next visit to cycle settings and can fill it in at their own pace. No forced migration flow.

**`modulateRunStructure` callers** — `scheduleGenerator`, `SessionDetailModal`, plan preview all currently pass `cycle_profile`. They gain a `hasPlaceboWeek` parameter to allow `deriveCycleMode` to run inside the modulation layer.

---

## Out of Scope

- **Safeguarding / amenorrhea engine** — `contraception_type` stored now; engine wired in a future card. Steady users on IUD/implant/Depo must not trigger RED-S alerts, but the alert logic doesn't exist yet.
- **Depo bone-health content flag** — `injection` stored as `contraception_type`; tip-filter tag `depo_bone_health` wired in a future content card.
- **Plan load revision for `pregnant_postpartum`** — Steady mode is set here; the training engine changes that revise volume down are a separate card.
- **RED-S article content** — the link points to an existing article slug. No new content needed in this card.
