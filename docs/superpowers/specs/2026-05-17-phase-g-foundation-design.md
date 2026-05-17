# Phase G Sub-project Ga — Foundation Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation plan
**Phase:** G (Cycle-Narrated Weight) — Sub-project Ga (foundation)
**Mockup:** `docs/design/phase-g-weight-tracking.html` (design-locked)

## Purpose

Ship the foundation of Virra's cycle-narrated weight feature: opt-in toggle, HealthKit ingestion + manual entry, baseline computation, the detail chart (band + dots), and the Dashboard daily-glance card. The output is a working, silent-by-default surface that turns weight into a cycle-aware band the user can read at a glance.

Gb (insight cards + rationale engine + season feedback loop) lands in a separate spec once Ga is in users' hands.

## Architectural principles

Inherited verbatim from `CLAUDE.md` Phase G entry and the mockup. Restated here so this spec is self-contained:

1. **Opt-in only.** Default OFF on `user_profiles.track_weight`. Until the user explicitly enables it, no weight data syncs, no card renders, no permission prompt fires. First-run activation shows a one-shot explainer card framing the feature ("This isn't a weight loss feature…").
2. **Silence is the default.** The Dashboard glance card and the cycle-detail chart only appear when `track_weight = true`. Most readings produce no insight surface at all — that lives in Gb. Ga's UI is the band itself, not commentary on it.
3. **Delta from baseline, never absolute weight.** Hero numbers throughout are `+1.5 kg`, not `67.3 kg`. Absolute kg shows only inside the AddWeightModal and as a small caption in the calibrating state.
4. **Predictive over reactive.** The expected band is shown *before* the reading lands, so luteal water gain is framed as expected rather than surprising. Reactive insight cards land in Gb.
5. **No streaks, no trends, no targets, no goal weight.** Explicitly excluded.

## Out of scope

Hard-deferred to Gb or later:

- All four insight card variants in the mockup (`POST-SESSION`, `OUTLIER`, `RAPID_LOSS_HEAVY_TRAINING`, `BEYOND_BAND`, `PROJECTION_VARIANCE`)
- `weight_insights` table and rationale engine
- Season feedback loop (sustained underfuelling → SeasonEngine `loadScale` downgrade)
- Per-user calibration of expected-band ranges (cohort-tuning post-launch)
- "Delete my weight history" affordance
- BMI / body fat % / lean mass — Ga is weight only
- Apple Watch direct integration beyond what HK already routes

## Schema

One Supabase migration applied via the MCP server (`project_ref: elebuieojodsjmghwjub`):

```sql
alter table user_profiles
  add column track_weight                  boolean not null default false,
  add column weight_baseline_kg            numeric,
  add column weight_baseline_computed_at   timestamptz,
  add column weight_explainer_dismissed_at timestamptz;

create table body_weights (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  recorded_on         date not null,
  weight_kg           numeric not null check (weight_kg > 0 and weight_kg < 500),
  source              text not null check (source in ('healthkit','manual')),
  cycle_day_at_time   integer,
  cycle_phase_at_time text check (cycle_phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  created_at          timestamptz default now(),
  unique (user_id, recorded_on, source)
);

create index body_weights_user_recorded_idx on body_weights (user_id, recorded_on desc);

alter table body_weights enable row level security;
create policy body_weights_own on body_weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`(user_id, recorded_on, source)` unique constraint lets the HK observer idempotently upsert: a same-day HK weight import never duplicates, and a manual entry on a day that already has an HK reading is still possible (different source).

The `weight_insights` table is added by Gb, not Ga.

## Expected-band defaults

Stored as a constant module so band logic is testable and visible without a DB round-trip. Per-user calibration is a Gb concern.

`mobile/src/lib/weightBand.ts`:

```ts
import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightBand {
  lower: number; // kg delta from baseline
  upper: number;
}

export const EXPECTED_BAND: Record<CyclePhase, WeightBand> = {
  menstrual:  { lower: -0.3, upper: 0.6 },
  follicular: { lower: -0.2, upper: 0.5 },
  ovulatory:  { lower:  0.0, upper: 1.0 },
  luteal:     { lower:  0.5, upper: 2.0 },
};

export type BandPosition = 'below' | 'in_band' | 'above';

export function classifyReading(delta: number, phase: CyclePhase): BandPosition {
  const { lower, upper } = EXPECTED_BAND[phase];
  if (delta < lower) return 'below';
  if (delta > upper) return 'above';
  return 'in_band';
}
```

## Baseline computation

`mobile/src/lib/weightBaseline.ts`:

- `computeBaseline(userId: string): Promise<number | null>`
- Reads `body_weights` rows for the user from the last two completed cycles where `cycle_phase_at_time = 'follicular'`.
- Returns the median weight, or `null` if fewer than 5 such readings exist.
- Writes the result + `now()` to `user_profiles.weight_baseline_kg` and `weight_baseline_computed_at`.
- Triggered on every successful `body_weights` insert from either the HK observer or the AddWeightModal. Client-side trigger keeps the moving parts visible in one repo and avoids a new edge function in Ga.

Why follicular only: cycle-related fluid retention is at its lowest, so follicular readings are the steadiest signal of long-term mass. Using the median (not the mean) makes the baseline robust to a single outlier reading.

## Calibration gate

A user is "calibrating" when either:

- `weight_baseline_kg IS NULL`, or
- Fewer than 3 distinct cycles' worth of readings exist (`select count(distinct ...) ...` on cycle-week buckets)

Calibration UX:

- Dashboard glance: shows the latest reading absolute (kg), the wording "Calibrating — we need a few more cycles before the band becomes reliable.", and no band visual.
- Detail chart: dots render, the band path is omitted, a small `CALIBRATING — N/3 CYCLES` ribbon sits above the chart.
- The opt-in explainer ends with the same calibration framing so the user knows to expect silence at first.

## HealthKit ingestion

`mobile/src/lib/healthKitWeight.ts`:

- `requestWeightPermission(): Promise<boolean>` — adds `BodyMass` (read) to the HK permission set. Folded into the existing onboarding HK request bundle if the user is opting in during onboarding; called explicitly when the toggle is first switched on outside onboarding.
- `startWeightObserver(userId: string): () => void` — registers `HKObserverQuery` for `Weight`; returns the unsubscribe function. On callback, runs `HKAnchoredObjectQueryDescriptor`-equivalent (the `react-native-health` `getWeightSamples` with a stored anchor) to pull new samples since the last anchor.
- Anchor persistence: stored in AsyncStorage under `virra:hk:weight:anchor:<userId>`, same pattern the existing activity import uses.
- Each ingested sample's `cycle_day_at_time` + `cycle_phase_at_time` are computed from the current `useCycleStore` state at write time. The sample is upserted via the unique constraint — same-day re-imports are idempotent.
- Library: existing `react-native-health` (`getWeightSamples`, `getLatestWeight` already exposed at v1.19). The Phase G work does *not* require the deferred `@kingstinct/react-native-healthkit` swap — that swap remains a separate concern for menstrual flow.

Observer lifecycle:

- Started when `track_weight = true` and the user is authenticated, in `app/(app)/_layout.tsx` alongside the existing activity observer.
- Stopped when `track_weight` flips to false.

## Manual entry

`mobile/src/components/ui/AddWeightModal.tsx`:

- Triggered by an "Add weight" inline button at the top of the chart card on `cycle-detail.tsx`.
- Numeric input: kg, one decimal place. Validated against the schema check (0 < x < 500).
- Date picker: defaults to today, allows back-dating up to 30 days.
- Save:
  - Insert row with `source = 'manual'`, `cycle_day_at_time` + `cycle_phase_at_time` computed at insert time from `useCycleStore` *at the recorded_on date* (not today's date).
  - Trigger `computeBaseline(userId)` post-insert.
  - Dismiss the modal; chart re-fetches.
- On constraint conflict (same user/date/source already exists): present an inline "Replace existing entry?" confirm; on confirm, delete-then-insert.

## Profile toggle + first-run explainer

In `app/(app)/(tabs)/profile.tsx`, add a `BODY METRICS` section above existing sections. Layout:

```
─── BODY METRICS ───────────────────────
  Track weight                    [ ◯ ]
  Off — no weight data syncs or displays
```

Toggling ON for the first time (`weight_explainer_dismissed_at IS NULL`):

1. Set `track_weight = true` in `user_profiles`.
2. If `BodyMass` HK permission not yet granted, request it. If the user denies, the toggle still stays ON — manual entry remains a path — but a small note appears: "Apple Health didn't share weight access. You can still log manually."
3. Present the first-run explainer modal (pulse-bordered card with the mockup's framing copy + the calibration note).
4. On dismiss: write `weight_explainer_dismissed_at = now()`.
5. Start the weight observer.

Toggling ON when the explainer has been dismissed before: skip the modal, just set the flag and restart the observer.

Toggling OFF:

- Set `track_weight = false`.
- Stop the observer.
- The Dashboard glance and detail chart disappear immediately (re-render).
- Existing `body_weights` rows are preserved. No destructive action without explicit "delete my data" UI (deferred).

## Detail chart

`mobile/src/components/ui/CycleWeightChart.tsx`:

- Pure `react-native-svg` rendering. Existing project dependency (already used in `ActivityRing.tsx`).
- Card body matches the mockup card 1:1:
  - Header row: `WEIGHT · KG FROM BASELINE` kicker, `LAST 3 CYCLES` mono caption
  - SVG chart with:
    - Phase-tinted background columns (menstrual heat 0.04, follicular pulse 0.03, ovulatory breath 0.04, luteal dawn 0.05)
    - Expected band shaded path (pulse fill 0.18, pulse stroke 0.4) — band path interpolated from `EXPECTED_BAND` ranges plus a smoothing pass between phase boundaries
    - Three cycles of dots: current cycle at full pulse opacity, prior at 0.55, oldest at 0.35
    - Today's reading: pulse dot with breath stroke ring (r=6)
    - Dashed today marker line + `TODAY · D<n>` label
    - X-axis: day numbers (1, 6, 14, 17, 28) and phase labels under the chart
    - Y-axis: -1, 0, +1, +2, +3 kg deltas
  - Legend row underneath
  - One-line editorial line at the bottom — phase-keyed, simple fallback copy in Ga (Gb upgrades this to the rich rationale)
- Calibrating state: dots only, no band, `CALIBRATING — N/3 CYCLES` ribbon above the chart.
- "Add weight" inline button (small) in the top-right of the card.
- Replaces the existing weight scaffold card on `app/(app)/cycle-detail.tsx`. Card position remains the same (between the cycle calendar card and the WHAT TO EXPECT reasoning card).

## Dashboard glance card

`mobile/src/components/ui/WeightGlanceCard.tsx`:

- Renders on `app/(app)/(tabs)/index.tsx` between the cycle hero row and the WeekStrip card.
- Renders only when `track_weight = true` AND at least one `body_weights` row exists. Otherwise: returns null. Silent.
- Tapping it routes to `/(app)/cycle-detail` so the user lands on the chart.

States:

| State | Visual |
|---|---|
| Calibrating (baseline null or < 3 cycles of data) | Latest absolute kg as small display, label `CALIBRATING`, copy "We need a few more cycles before the band becomes reliable." |
| In band | Phase pill `LUTEAL · IN BAND` (pulse), big delta `+1.5 kg`, label `FROM YOUR FOLLICULAR BASELINE`, mini-rail with band fill + dot marker, fallback copy from a phase-keyed map |
| Above band | Phase pill colour swaps to dawn, copy from above-band map |
| Below band | Phase pill colour swaps to dawn, copy from below-band map |

Fallback copy maps (Ga only — Gb replaces these with rationale-derived text):

```ts
const IN_BAND: Record<CyclePhase, string> = {
  menstrual:  'Right where your body wants to be today.',
  follicular: 'This is your body\'s natural floor — the number to anchor to.',
  ovulatory:  'A small lift around ovulation is normal hormonal water.',
  luteal:     'Right where your body wants to be today. This is water, not fat. It\'ll resolve in 5–7 days.',
};
// Plus ABOVE_BAND and BELOW_BAND maps, similar structure.
```

The mini-rail mirrors the mockup's `.glance-band` element: a thin track, a phase-coloured fill marking the expected band's left/right edges, and a marker dot at the user's current delta position.

## Files touched

**New**

| Path | Responsibility |
|---|---|
| `mobile/src/lib/weightBand.ts` | Expected-band constants + `classifyReading` |
| `mobile/src/lib/weightBaseline.ts` | `computeBaseline` (median of follicular readings, writes to user_profiles) |
| `mobile/src/lib/healthKitWeight.ts` | `requestWeightPermission`, `startWeightObserver`, anchored fetch + upsert |
| `mobile/src/components/ui/CycleWeightChart.tsx` | SVG chart with band + dots, calibration state |
| `mobile/src/components/ui/WeightGlanceCard.tsx` | Dashboard glance card |
| `mobile/src/components/ui/AddWeightModal.tsx` | Manual entry modal |
| `mobile/src/components/ui/WeightExplainerModal.tsx` | First-run framing card |

**Edited**

| Path | Why |
|---|---|
| `mobile/app/(app)/(tabs)/index.tsx` | Add `<WeightGlanceCard />` between hero row and WeekStrip |
| `mobile/app/(app)/(tabs)/profile.tsx` | Add BODY METRICS section with the toggle row |
| `mobile/app/(app)/cycle-detail.tsx` | Replace weight scaffold card with `<CycleWeightChart />` |
| `mobile/app/(app)/_layout.tsx` | Start/stop weight observer based on `track_weight` |
| `mobile/src/store/profile.ts` | Add `trackWeight`, `weightBaselineKg`, `weightExplainerDismissedAt` state + setters; load these from Supabase alongside existing fields |

**Migration**

| Path | Why |
|---|---|
| `supabase` migration applied via MCP | Schema additions in §Schema |

## Data flow

1. **First activation:** Profile toggle → permission prompt → explainer modal → store flips `track_weight = true` → observer starts → first HK pull writes any historical weight samples (anchored from epoch on first run) → baseline recomputes → glance card renders.
2. **Daily reading:** HK observer fires on Apple Health write → anchored query pulls new sample(s) → cycle phase computed at insert time → row inserted → baseline recomputes → glance + chart re-fetch and re-render.
3. **Manual entry:** Modal save → row inserted (`source = 'manual'`) → baseline recomputes → chart re-fetches.
4. **Toggle off:** Store flips → observer stops → glance returns null → chart returns its "off" state on cycle-detail.

## Error handling

| Failure mode | Handling |
|---|---|
| HK permission denied | Toggle stays ON; manual entry remains usable; small caption on the toggle row notes the missing permission with a "Re-request" affordance |
| Supabase insert error (network) | Surface as toast on manual entry; HK observer logs and retries on next foreground |
| Baseline compute fails (no follicular data yet) | Returns null; UI shows calibrating state — not an error |
| Invalid weight value | Schema check rejects; modal shows inline validation |
| AsyncStorage anchor corruption | Treat as missing anchor → full re-pull; idempotent thanks to the unique constraint |

## Testing

**Unit**
- `weightBand.classifyReading` — boundary cases for each phase (just below lower, at lower, in middle, at upper, just above upper)
- `weightBaseline.computeBaseline` —
  - returns null when < 5 follicular readings exist
  - returns median of follicular readings, ignoring other phases
  - returns null when the user has no body_weights rows at all
- Calibration gate helper — returns `calibrating` until 3 distinct cycles' worth of readings exist
- Band classification → glance state derivation

**Component**
- `AddWeightModal` — happy path inserts a row + triggers `computeBaseline`
- `AddWeightModal` — duplicate same-day same-source surfaces the replace prompt
- `WeightGlanceCard` — returns null when `track_weight = false`; renders calibrating state when baseline is null
- `WeightExplainerModal` — dismiss writes `weight_explainer_dismissed_at`
- `CycleWeightChart` — calibrating state hides the band but still renders dots; non-calibrating renders the band path

**Integration / manual (simulator)**
- Toggle ON → explainer appears → dismiss → empty state until first HK reading
- Apple Health write a weight sample → observer fires → glance renders within a few seconds
- Manual entry → glance + chart update without app reload
- Toggle OFF → both surfaces disappear, rows preserved
- Re-toggle ON → no second explainer

## Risks / open items

- **HK observer lifecycle:** existing activity observer pattern in `_layout.tsx` is the template. If the activity pattern has had reliability issues, the weight observer will share them. Test on a real device, not just the simulator.
- **Baseline cold-start:** users with < 5 follicular readings stay in calibration potentially for months. The Ga UX explicitly accommodates that, but it does mean the feature appears "empty" for early adopters. Acceptable for opt-in. Gb adds richer pre-baseline copy if needed.
- **Time zones:** `recorded_on` is a date. HK samples carry a precise timestamp. We use the user's local date when bucketing. The unique constraint per `(user_id, recorded_on, source)` is local-date-keyed. Acceptable for a single-device user.
- **Band path interpolation:** the mockup's band path is hand-drawn smooth. The implementation will interpolate between phase boundaries with a basic Catmull-Rom or similar smoothing. Visual parity should be checked against the mockup before sign-off.
