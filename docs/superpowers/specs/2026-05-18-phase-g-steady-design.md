# Phase G Sub-project Gc — Steady Weight Tracking Design

**Date:** 2026-05-18
**Status:** Approved, ready for implementation plan
**Phase:** G (Cycle-Narrated Weight) — Sub-project Gc (non-cycle path)
**Companion specs:** `docs/superpowers/specs/2026-05-17-phase-g-foundation-design.md` (Ga, cycle path)

## Purpose

Ship the non-cycle path for weight tracking so users with `cycleProfile ∈ {hormonal, perimenopause, menopause}` get a coherent, opt-in experience instead of a permanently-calibrating, mis-framed surface. Gc reuses Ga's plumbing (toggle, HK observer, manual entry, glance card layout) and branches internally to the steady-mode framing: rolling 30-day baseline, fixed ±0.5 kg band, neutral copy that frames day-to-day variation as noise rather than narrative.

Gb (cycle-aware rationale engine + insight cards) is still deferred. Gc closes Ga's coverage gap before that work begins.

## Architectural principles

Ga's five principles carry forward. Gc adds two:

1. **Opt-in only.** Default OFF (already shipped in Ga). One toggle for everyone.
2. **Silence is the default.** Surfaces appear only when toggle is on AND data exists.
3. **Delta from baseline, never absolute weight.** Hero number on the glance is `+1.5 kg`, not `67.3 kg`. Absolute kg shows only inside `AddWeightModal` and as a small caption in calibrating states.
4. **Predictive over reactive.** Ga's reactive insight cards belong to Gb; same applies here.
5. **No streaks, no trends, no targets, no goal weight.**
6. **Steady, not cyclical (Gc-specific).** No phase pills, no phase-tinted columns, no expected envelope shaped by hormones. The band is normal daily variation around a steady line.
7. **One day isn't a trend (Gc-specific).** Without cycle structure, single-reading framing leans on noise-aware copy ("Above your steady line. One day isn't a trend.") rather than diagnostic copy.

## Out of scope

Hard-deferred to a later phase:

- Per-user calibration of the steady band (fixed ±0.5 kg in Gc; refine post-launch once we have variance data per cohort)
- Trend detection ("you've drifted +0.8 kg over 4 weeks") — that's an insight-engine concern (Gb)
- Phase-aware hormonal contraception (some hormonal users have predictable monthly hormone phases; treated as non-cycle for Gc)
- Menopause-specific framing around muscle mass / visceral fat — Gc treats all non-cycle users uniformly
- Animated mode-switch transition — re-render on profile change is sufficient
- "Delete my weight history" affordance — defer until requested

## Activation rules

The same `BODY METRICS` toggle in Profile works for everyone. The branch is internal:

| `cycleProfile` | Path |
|---|---|
| `natural`, `irregular` | Ga (cycle-aware) |
| `hormonal`, `perimenopause`, `menopause` | Gc (steady) |

If a user changes their `cycleProfile` later (e.g. starts the pill), the weight surfaces re-render with the other mode's framing on the next render — no data migration, no toggle reset. Existing `body_weights` rows retain whatever `cycle_phase_at_time` they had at write time, which may be a mix of values and nulls. Both modes tolerate this.

## Schema

One additive migration via the Supabase MCP (`project_ref: elebuieojodsjmghwjub`):

```sql
alter table user_profiles
  add column weight_steady_baseline_kg          numeric,
  add column weight_steady_baseline_computed_at timestamptz;
```

`weight_baseline_kg` (cycle, from Ga) and `weight_steady_baseline_kg` (Gc) coexist. The mode-appropriate column is read/written; the other stays whatever it was last set to. Both default null.

No changes to `body_weights`. Existing rows are valid as-is.

## Steady baseline computation

`mobile/src/lib/weightBaselineSteady.ts`:

- `computeSteadyBaseline(userId): Promise<number | null>`
- Reads `body_weights` rows for the user from the last **30 days** (no phase filter)
- Returns the **median** if at least **7 readings** exist; otherwise null
- Writes the result + `now()` to `user_profiles.weight_steady_baseline_kg` and `weight_steady_baseline_computed_at`

Why 30 days: long enough to smooth daily noise (water, hydration, food timing, time-of-day), short enough to track real changes. Hormonal users on a 28-day pill pack get a full hormonal cycle's worth of variance averaged in, which is the desired smoothing.

Why median: robust to a single outlier reading. Same rationale as Ga.

Why 7 readings minimum: matches roughly twice-weekly logging cadence over a month — enough to make the median meaningful without making the calibration period feel punitive.

## Steady band

A fixed **±0.5 kg** around the baseline. Not phase-derived, not user-derived. The band conveys "this is normal daily noise; beyond this is noteworthy."

`mobile/src/lib/weightBand.ts` (extended):

```ts
export const STEADY_BAND: WeightBand = { lower: -0.5, upper: 0.5 };

export function classifySteady(delta: number): BandPosition {
  if (delta < STEADY_BAND.lower) return 'below';
  if (delta > STEADY_BAND.upper) return 'above';
  return 'in_band';
}
```

The existing `BandPosition` type is reused — same `'below' | 'in_band' | 'above'` enum.

## Baseline dispatcher

Single helper that hides the cycle/steady branching from every caller:

`mobile/src/lib/weightBaselineDispatcher.ts`:

```ts
import { useCycleStore } from '@/store/cycle';
import { computeBaseline } from '@/lib/weightBaseline';
import { computeSteadyBaseline } from '@/lib/weightBaselineSteady';

export async function recomputeBaseline(userId: string): Promise<void> {
  const profile = useCycleStore.getState().cycleProfile;
  if (profile === 'natural' || profile === 'irregular') {
    await computeBaseline(userId);
  } else {
    await computeSteadyBaseline(userId);
  }
}
```

`AddWeightModal`, `importNewWeightSamples`, and the foreground poll all call `recomputeBaseline` instead of `computeBaseline` directly. Mode lives in one place.

## Glance card

The existing `WeightGlanceCard` branches internally on `cycleProfile`:

| Element | Cycle (Ga) | Steady (Gc) |
|---|---|---|
| Kicker | `WEIGHT · LUTEAL` | `WEIGHT · TODAY` |
| Status pill | `LUTEAL · IN BAND` (pulse) / `· ABOVE BAND` / `· BELOW BAND` (dawn) | `STEADY` (pulse) / `ABOVE LINE` / `BELOW LINE` (dawn) |
| Delta number | `+1.5 kg` (display 32, pulse) | `+1.5 kg` (display 32, pulse) |
| Subtext | `FROM YOUR FOLLICULAR BASELINE` | `FROM YOUR STEADY BASELINE` |
| Mini-band rail | Phase-shaped band fill | Fixed ±0.5 kg band fill (left/right computed from baseline + STEADY_BAND) |
| Editorial copy | Phase + position keyed (8 maps from Ga) | Position keyed only (3 strings — below) |

Steady copy maps:

```ts
const STEADY_IN_BAND = 'Within your usual daily range.';
const STEADY_ABOVE   = 'A touch above your steady line. One day isn\'t a trend — water, salt, or food timing can do this.';
const STEADY_BELOW   = 'A touch below your steady line. If training has been heavy, check fuelling.';
```

Routing on tap:

- Cycle users → `router.push('/(app)/cycle-detail')` (unchanged)
- Steady users → `router.push('/(app)/weight')` (new)

Same component file. No duplication of layout primitives — just a branch around copy + which baseline to read + which route to push.

## Detail screen (steady)

New route: `mobile/app/(app)/weight.tsx`.

Follows the sub-menu screen pattern from `CLAUDE.md`:

- `SafeAreaView edges={['top']}` root, header row: `chevron.left` (back) ← centred `Your Weight` (display 24, pulse) → spacer
- Below the header, scrolling content:

1. **Hero card** — today's reading absolute (e.g. `61.5 kg` display 32, breath), `STEADY` / `ABOVE LINE` / `BELOW LINE` pill, big delta (`+1.5 kg` display 32 pulse), `FROM YOUR STEADY BASELINE` mono caption, mini-band rail (reuse the existing rail component from glance card)
2. **Chart card** — `WeightSteadyChart` (see below). Header row contains `WEIGHT · KG FROM BASELINE` kicker and a top-right `+ ADD WEIGHT` link that opens the existing `AddWeightModal`.
3. **Reasoning card** — `WHAT TO EXPECT` kicker, one-line editorial copy keyed by current position (the same three strings as the glance card, but with slightly fuller framing for the detail context):
   ```
   in_band: 'Day-to-day weight bounces from water, food timing, and hydration. Yours is moving inside the noise band — exactly what a healthy line looks like.'
   above:   'A touch above your steady line. This happens — sodium, alcohol, GI fullness, a harder week of training. Watch what happens over the next few days.'
   below:   'A touch below your steady line. If training has been heavy, check fuelling: every 1g of glycogen stores 3g of water, so a single hard session can show as a 1+ kg dip.'
   ```
4. **How this works** — collapsible card, closed by default. When expanded, shows:
   - "Your steady line is the median of your last 30 days of readings."
   - "Daily fluctuation of ±0.5 kg is normal noise."
   - "Beyond the band? Look at the last few days, not just one."
   - "We don't track streaks, goal weight, or progress towards a target."
5. **Calibrating** state — if `weight_steady_baseline_kg` is null: hero shows latest absolute kg only (no pill, no delta), chart renders dots without baseline/band, ribbon at top of chart reads `CALIBRATING — N/7 READINGS LOGGED`.

## WeightSteadyChart

New component `mobile/src/components/ui/WeightSteadyChart.tsx`. Different from `CycleWeightChart`:

- Renderer: `react-native-svg` (same as Ga chart)
- X-axis: calendar dates over **last 90 days** (or shorter if less data available)
- Y-axis: kg delta from steady baseline, auto-scaled to the user's actual data range, padded by ±0.3 kg above/below extremes for headroom. Floor / ceiling no smaller than ±1 kg either side of zero so the band is always visible.
- Horizontal **baseline line** at delta = 0 (dashed pulse, opacity 0.5)
- Shaded **steady band** ±0.5 kg around baseline (pulse fill 0.18, pulse stroke 0.4) — same visual language as Ga's expected band, just rectangular instead of phase-shaped
- **Dots** for each reading: today's dot at r=6 ringed in breath; readings within the last 7 days at r=4 pulse; older readings at r=3 in cream 0.5
- No phase tinting, no three-cycle overlay, no today day-of-cycle marker (the chart is time-linear, not phase-linear)
- Calibrating state: render dots only, suppress the baseline line and band path
- Auto-scale formula:
  ```
  yMin = floor(min(deltas, 0) - 0.3, -1)
  yMax = ceil(max(deltas, 0) + 0.3, +1)
  ```
- Legend underneath: `STEADY LINE` (dashed swatch), `±0.5 KG BAND` (filled swatch), `READING` (dot)

## First-run explainer

The existing `WeightExplainerModal` becomes mode-aware via a new prop:

```ts
interface Props {
  visible:   boolean;
  mode:      'cycle' | 'steady';
  onDismiss: () => void;
}
```

The `cycle` mode copy is the existing Ga copy (unchanged). The `steady` mode copy:

- Kicker: `THIS ISN'T A WEIGHT LOSS FEATURE` (same, both modes)
- Editorial: "Your weight bounces day-to-day from water, food timing, and hydration. We track the trend, not the day-to-day — so you can see what's noise and what's real."
- Body: "No goal weight. No streaks. No daily prompt.\nCalibrating — we need ~30 days of readings before the steady line becomes reliable."

`profile.tsx` selects the right mode at toggle-on time based on the current `cycleProfile`.

## Profile store

Two new fields, same pattern as Ga's:

```ts
weightSteadyBaselineKg:         number | null;
weightSteadyBaselineComputedAt: string | null;
```

Added to `ProfilePatch`, `load`'s select clause, `save`'s update mapping, and the default state object. The select column list adds `weight_steady_baseline_kg, weight_steady_baseline_computed_at`.

## Component branching summary

| Component | Behaviour |
|---|---|
| `WeightExplainerModal` | Accepts `mode: 'cycle' \| 'steady'` — swaps copy |
| `WeightGlanceCard` | Branches on `cycleProfile`; cycle layout for natural/irregular, steady layout for the rest. Reads `weightBaselineKg` (cycle) or `weightSteadyBaselineKg` (steady) accordingly. Routes to `/cycle-detail` or `/weight`. |
| `AddWeightModal` | Unchanged surface; calls `recomputeBaseline(userId)` instead of `computeBaseline(userId)` |
| `WeightSteadyChart` | New |
| `weight.tsx` (route) | New |
| Profile toggle | No longer gated by future plans; pass current `cycleProfile` to explainer mode |
| `cycleProfile` change → glance/chart re-renders | Implicit — Zustand selectors trigger re-render |
| `healthKitWeight.importNewWeightSamples` | Calls `recomputeBaseline` instead of `computeBaseline` |

## Files touched

**New**

| Path | Responsibility |
|---|---|
| `mobile/src/lib/weightBaselineSteady.ts` | `computeSteadyBaseline` — rolling 30-day median |
| `mobile/src/lib/weightBaselineDispatcher.ts` | `recomputeBaseline` — single branching point |
| `mobile/src/components/ui/WeightSteadyChart.tsx` | SVG line + band chart, no phase structure |
| `mobile/app/(app)/weight.tsx` | Sub-menu detail screen for steady users |

**Edited**

| Path | Why |
|---|---|
| `mobile/src/lib/weightBand.ts` | Add `STEADY_BAND` + `classifySteady` |
| `mobile/src/components/ui/WeightGlanceCard.tsx` | Branch on `cycleProfile`; route accordingly |
| `mobile/src/components/ui/WeightExplainerModal.tsx` | Accept `mode` prop; swap copy |
| `mobile/src/components/ui/AddWeightModal.tsx` | Call `recomputeBaseline` instead of `computeBaseline` |
| `mobile/src/lib/healthKitWeight.ts` | Call `recomputeBaseline` instead of `computeBaseline` |
| `mobile/app/(app)/(tabs)/profile.tsx` | Pass `mode` to explainer based on `cycleProfile` |
| `mobile/src/store/profile.ts` | Add steady-baseline fields |
| `mobile/app/(app)/_layout.tsx` | Register the new `weight` route in the Stack screens list |

**Migration**

| Action | Detail |
|---|---|
| Supabase migration via MCP | `add_phase_g_steady_baseline` — two new columns on `user_profiles` |

## Data flow

1. **Activation:** User with `cycleProfile = 'hormonal'` toggles BODY METRICS on → first-run explainer fires in **steady mode** → dismiss → observer starts. `weightExplainerDismissedAt` set so it doesn't fire again on future toggles.
2. **Daily reading:** HK observer / manual entry writes a `body_weights` row → `recomputeBaseline(userId)` picks the steady branch → median of last-30-days computed → `user_profiles.weight_steady_baseline_kg` updated → glance + chart re-fetch and re-render via Zustand subscription.
3. **Profile change:** User switches `cycleProfile` from `hormonal` to `natural` → next foreground (or on next reading) → `recomputeBaseline` now picks the cycle branch → cycle baseline (which may be null) computed → glance card swaps framing on next render. Steady baseline column retains its previous value; no destructive cleanup.
4. **Toggle off:** `track_weight = false` → glance + detail return null → observer stops. Rows preserved.

## Error handling

| Failure mode | Handling |
|---|---|
| `computeSteadyBaseline` query error | Throws; caller catches and logs |
| Insert error in `AddWeightModal` | Already handled (Alert.alert), unchanged |
| HK permission denied | Already handled in Ga, unchanged |
| Profile switch while observer firing | Idempotent — `recomputeBaseline` reads the current profile at call time |
| Baseline NULL after recompute (insufficient data) | UI shows calibrating state — not an error |

## Testing

**Unit**
- `weightBand.classifySteady` — at -0.5, just below, in middle, at +0.5, just above
- `computeSteadyBaseline` —
  - returns null with < 7 readings in the 30-day window
  - returns median of in-window readings, ignoring older readings
  - writes null when not enough data, writes median when sufficient
- `recomputeBaseline` dispatcher —
  - calls `computeBaseline` when `cycleProfile = 'natural'`
  - calls `computeBaseline` when `cycleProfile = 'irregular'`
  - calls `computeSteadyBaseline` when `cycleProfile = 'hormonal'`
  - calls `computeSteadyBaseline` when `cycleProfile = 'perimenopause'`
  - calls `computeSteadyBaseline` when `cycleProfile = 'menopause'`

**Component**
- `WeightExplainerModal` — renders cycle copy when `mode='cycle'`, steady copy when `mode='steady'`, calls `onDismiss` on button press in both modes
- `WeightGlanceCard` — when `cycleProfile = 'hormonal'`: renders `WEIGHT · TODAY` kicker, `STEADY` pill, `FROM YOUR STEADY BASELINE` subtext, no phase reference
- `WeightGlanceCard` — when `cycleProfile = 'hormonal'` and steady baseline is null: renders calibrating state
- `WeightGlanceCard` — when `trackWeight` is false: returns null regardless of profile
- `WeightSteadyChart` — auto-scales y-axis to data, renders baseline line + band when baseline set, hides them when calibrating, renders today's dot ringed

**Integration / manual (simulator)**
- Toggle profile from `natural` → `hormonal` in Cycle Settings → return to Dashboard → glance card immediately swaps framing from cycle to steady (or stays calibrating if no steady baseline yet)
- Toggle ON for the first time as a hormonal user → steady explainer copy appears (not cycle copy) → dismiss → marker persists
- From dashboard glance (steady mode), tap → routes to `/weight` (not `/cycle-detail`)
- Manual entry on `/weight` works → chart refreshes
- Switch back to `natural` → next render shows cycle glance (with cycle baseline if it had one previously, otherwise calibrating)

## Risks / open items

- **Default ±0.5 kg band:** Fixed for Gc; some users (especially perimenopause with hot flushes / sleep disruption) may have wider daily variance. Risk: above-line copy fires when it's actually just noise. Mitigation: per-user variance is on the post-launch roadmap.
- **Profile switching:** Users who change their cycle profile mid-tracking get a mode swap without onboarding into the new mode. The first-run explainer only fires once. Acceptable — the framing change is small and silent is the default anyway.
- **Empty baseline column on mode swap:** A user switching from cycle to steady will see calibrating until the steady baseline computes (and vice-versa). Acceptable — silence is the default and the calibrating state is honest about what's happening.
- **Hormonal cyclic pill users with predictable hormone phases:** Treated as non-cycle in Gc. Future work could add a hormonal-aware mode, but the spec defers it.
