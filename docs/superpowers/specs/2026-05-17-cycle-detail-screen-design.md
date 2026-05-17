# Cycle Detail Screen — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation plan
**Phase:** D (UI polish) — also seeds the future Phase G weight-tracking surface

## Purpose

A dedicated "Your Cycle" screen accessed by tapping the cycle hero card on the Dashboard. Surfaces deeper cycle context (calendar view, lifestyle coaching) and prepares the surface for Phase G's weight insight without shipping Phase G's ingestion pipeline. Also provides a fast "I got my period" reset so users don't have to walk through the full Cycle Settings form when their period arrives.

## Out of scope

Explicitly deferred to the next development block (Phase G proper):

- `body_weights` table, HealthKit weight observer, manual weight entry UI
- Baseline computation engine (rolling follicular-phase median)
- `track_weight` opt-in flow + first-run explainer
- `weight_insights` table and rationale engine

The weight chart card on this screen ships as a styled empty-state placeholder. Phase G's full design remains as captured in `docs/design/phase-g-weight-tracking.html` and the Phase G entry in `CLAUDE.md`.

## Entry point

The existing Dashboard cycle hero card in `mobile/app/(app)/(tabs)/index.tsx` (currently the left card in `heroRow`, containing the progress bar, DAY / DAYS LEFT / DAY CYCLE stats, and the phase tagline) becomes a tappable region routing to `/(app)/cycle-detail`. The Activity Rings card on the right remains non-interactive.

The phase pill (`OVULATORY PHASE`, etc.) sits *outside* the tappable card on the Dashboard, so the tap target is the card only.

## Route

New file: `mobile/app/(app)/cycle-detail.tsx`. No layout-group nesting — sits alongside `subscription.tsx`, `insights.tsx`, `cycle-settings.tsx`.

## Screen composition (top → bottom)

### 1. Header — sub-menu pattern

Strictly the sub-menu header pattern per `CLAUDE.md`:

- `SafeAreaView edges={['top']}` root
- Three-column flex row: `chevron.left` (muted, `router.back()`) ← centred `Your Cycle` (display 24, `colors.pulse`) → right-side spacer
- No `AppHeader`, no logo, no profile/bell

### 2. Hero block

Composition identical to the Dashboard cycle hero **minus the serif tagline** (per user direction: no quote/motivation on this screen):

- Phase pill (mono 10, phase colour)
- `CycleProgressBar` — extracted to `mobile/src/components/ui/CycleProgressBar.tsx` and imported by both Dashboard and detail screen
- Stats row: DAY · DAYS LEFT · DAY CYCLE (same three `display 32` values, with `mono 11` muted labels)

### 3. Cycle calendar card

New component `mobile/src/components/ui/CycleCalendar.tsx`.

- Horizontal scroll covering the current cycle only (day 1 → `cycleLength`)
- Each day chip shows the day-of-cycle number
- Chip background is phase-banded: `menstrual` heat, `follicular` dawn, `ovulatory` pulse, `luteal` breath. Day-by-day phase derived by re-calling `getCyclePhase(periodStart, cycleLength, today)` from `lib/cycleEngine.ts` for each day offset — no new logic
- Bleed days (1 → `MENSTRUAL_DAYS = 5`) overlay a filled heat dot under the number
- Today's chip has a `colors.breath` outline + slightly larger size
- Auto-scrolls to today on mount
- Below the strip, a `mono 10` legend row: ● Bleed · ● Follicular · ● Ovulatory · ● Luteal

### 4. Weight chart card — empty-state scaffold

`VirraCard` with:

- Section label: `WEIGHT` (mono 10, muted)
- Subtitle: `How your weight moves through your cycle` (body 13, muted)
- Body copy: "Weight tracking is off. We're saving this surface for Virra's cycle-aware weight insight — coming soon. When it's on, you'll see your weight delta from baseline charted across the current cycle, with the same phase-band colouring as the calendar above."
- No CTA. The Phase G toggle does not exist yet; offering a button that does nothing creates a dead end. When Phase G ships, this card is rebuilt by that project.

### 5. Reasoning card

`VirraCard` directly under the chart, section label `WHAT TO EXPECT`. Renders a phase-aware fallback string from a small local map keyed by current phase:

| Phase | Copy |
|---|---|
| menstrual | "Bleed days often show your lowest read of the cycle as water levels reset." |
| follicular | "Follicular days are your steadiest baseline — energy rises and weight tends to hold." |
| ovulatory | "A small lift around ovulation is normal. Hormones drive a brief water rise." |
| luteal | "Expect a 1–2 kg lift before your period. This is water retention, not fat gain." |

Once Phase G ships, this card is replaced by `weight_insights` content; for now the fallback is always meaningful.

### 6. Action row — Update Cycle + I Got My Period

Two buttons side by side on one row, separated by `spacing.sm`:

| Button | Width | Colour | Behaviour |
|---|---|---|---|
| `UPDATE CYCLE` | `flex: 2` (2/3) | pulse — `VirraButton` `primary` variant | `router.push('/(app)/cycle-settings')` |
| `I GOT MY PERIOD` | `flex: 1` (1/3) | heat — custom Pressable styled to match VirraButton geometry (heat background, mile label, same paddings + radius) | Confirm dialog → on confirm, reset cycle to day 1 starting today |

Notes on the period button:

- VirraButton has only `primary` / `secondary` / `ghost` variants — none paint heat. Either (a) render the period button as a custom `Pressable` inline, mirroring the VirraButton base styles, or (b) add a new variant with a colour prop. Implementation plan picks one; recommendation is the inline Pressable for a single-use case to avoid widening VirraButton's API.
- Confirm dialog copy: title "Reset your cycle?", body "This logs today as the start of a new period and your day count restarts from 1.", primary action `Yes, reset`, cancel action `Cancel`.
- On confirm:
  1. Insert a new row in `cycle_logs`: `user_id = session.user.id`, `period_start = today (YYYY-MM-DD)`, `cycle_length_days = current cycleLength from store`.
  2. Call `useCycleStore.getState().setPeriodStart(todayDate)`. This recomputes `cycleInfo.dayOfCycle` to 1 immediately so the Dashboard hero is fresh on the next render.
  3. On error: `Alert.alert` with retry; do not mutate store.
- The button is disabled if `cycleInfo` is null (non-natural / unconfigured profiles), since there's no cycle to reset.

### 7. Phase coaching tips

Final scroll section labelled `THIS PHASE` (mono 10, muted, letter-spaced). Three stacked `VirraCard`s:

- **Training** — copy from existing `PHASE_META.training`
- **Nutrition** — copy from existing `PHASE_META.nutrition`
- **Lifestyle** — new copy, one line per phase:

| Phase | Lifestyle line |
|---|---|
| menstrual | "Prioritise sleep and warmth. Heat pads ease cramps better than ibuprofen for many." |
| follicular | "Social energy is high. Book the hard conversations and the heavy sessions now." |
| ovulatory | "Communication peaks. Have the difficult conversation today — it lands lighter." |
| luteal | "Schedule recovery. Caffeine sensitivity rises — taper after 2pm to protect sleep." |

To support the new lifestyle field cleanly, extract `PHASE_META` from `(tabs)/index.tsx` to `mobile/src/lib/phaseMeta.ts` with shape `{ label, tagline, training, nutrition, lifestyle, color }`. Dashboard continues to ignore `lifestyle`; detail screen reads it.

### 8. Non-natural cycle profiles

If `cycleProfile` ∈ {`hormonal`, `perimenopause`, `menopause`} OR `cycleInfo` is null:

- Render the header normally
- Render a single `VirraCard` with copy: "Your cycle profile is set to *[label]*. Update it in Profile → Cycle settings if anything changes."
- Render the action row but with `I GOT MY PERIOD` disabled (greyed) — for hormonal/peri/meno users, `UPDATE CYCLE` is the only path
- Omit the calendar, weight card, reasoning card, and coaching cards

This matches the Dashboard's existing EmptyState handling for the same profiles.

## Files touched

**New**
- `mobile/app/(app)/cycle-detail.tsx`
- `mobile/src/components/ui/CycleCalendar.tsx`
- `mobile/src/components/ui/CycleProgressBar.tsx` (extracted)
- `mobile/src/lib/phaseMeta.ts` (extracted + extended)

**Edited**
- `mobile/app/(app)/(tabs)/index.tsx` — wrap cycle hero in `Pressable`, replace inline `CycleProgressBar` + `PHASE_META` with imports

## Data writes

Only one new write path is introduced:

- `INSERT INTO cycle_logs (user_id, period_start, cycle_length_days) VALUES (...)` when the user confirms the period reset

No new tables, no schema migration. `cycle_logs` already exists per `CLAUDE.md`.

## Testing

- Unit: `CycleCalendar` renders correct number of chips for cycle lengths 21–35, today's chip is highlighted, bleed dot appears only on days 1–5, phase colour band correct across boundary days
- Unit: extracted `CycleProgressBar` matches inline behaviour at percentage edges (day 1, day = cycleLength, day = cycleLength + 1 wrap)
- Integration / manual: tapping Dashboard cycle hero opens detail screen; tapping `I GOT MY PERIOD` then confirming inserts a `cycle_logs` row and Dashboard's DAY value reads 1 on return; cancelling the dialog mutates nothing
- Integration / manual: switching cycle profile to hormonal in Settings → re-entering detail screen → renders the simplified non-natural layout with period button disabled

## Risks / open items

- The custom heat-coloured period button bypasses `VirraButton`. If this pattern is needed elsewhere in future, promote it to a new VirraButton variant rather than copying the inline pattern.
- A user double-tapping `I GOT MY PERIOD` could insert two near-identical `cycle_logs` rows. The confirm dialog mitigates this; if it shows up in practice, add a guard checking the most recent `cycle_logs.period_start` is not today before insert.
