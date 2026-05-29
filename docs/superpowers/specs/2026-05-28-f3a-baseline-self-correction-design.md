# F3a — Baseline Self-Correction (Adaptive Pacing from Actuals) — Design

**Date:** 2026-05-28
**Status:** Approved (design)
**Phase:** F3a (first sub-project of F3 — "Adaptive pacing & estimation from actuals", under the expanded Phase F)

## One-line

Use a runner's logged activity actuals to detect when their fitness has genuinely shifted, and — on the runner's confirmation via a celebratory Fitness Update modal — move the rolling pace baseline and refresh upcoming sessions to match.

## Why this exists / current state

Today the pace baseline (`user_profiles.baseline_pace_seconds_per_km`) is set once at onboarding and **never moves**. Two findings from the codebase shaped this design:

1. **A partial actuals→pace path already exists.** `getGoalPace` (`src/lib/volumePlan.ts:261`) has a `split_calibrated` tier: once ≥3 completed runs exist in a block, it recomputes that block's goal pace from their actual paces, normalised by session type via `TYPE_INVERSE_MODIFIER`. So the engine already nudges paces from reality *per block* — but it's invisible to the user and never touches the stored baseline.
2. **The "Fitness Update" loop that the project guide marks ✅ (Phase B) does not actually exist.** No detection logic, no modal, nothing writes a new baseline. The schema (`fitness_assessments`, `user_profiles.assessment_history`) is present but unused. (The project guide should be corrected: "Fitness assessment dynamic logic" was schema + onboarding self-report only; the trigger/modal was never built. This spec builds it.)

F3a makes the hidden calibration **visible, trustworthy, and baseline-level**, and finally wires the long-promised Fitness Update modal.

## Scope

**In scope:** run-pace baseline self-correction (both directions), the Fitness Update card + modal, the regenerate-upcoming cascade.

**Out of scope (siblings, noted not built):**
- **F3b** — RPE / felt-effort capture (no RPE column for runs today; pace + HR only).
- **F3c** — race-time prediction & `personal_bests` (Riegel etc. — net new, separately deferred).
- **Strength self-correction** — load progression from logged weights/reps. Baseline is a run-pace concept; `strength_structure` is not pace-derived. Natural later sibling.

## Locked design decisions

| Decision | Choice |
|---|---|
| Update model | **Confirm & celebrate** — detection surfaces a card → confirm modal; user taps "Update" to apply. |
| Directionality | **Symmetric, both supportive** — improvements *and* slowdowns surface the same confirm pattern; downward is framed as *fit* ("where you are now"), never decline/shame. |
| Detection signal | **Residual vs the plan's phase-modulated expected pace** — auto-controls for session type and cycle phase. |
| Cascade | **Regenerate upcoming sessions now** on confirm, respecting the existing goal-pace hierarchy. |

---

## Section 1 — Detection engine

**Where it runs:** client-side (consistent with `healthKitImport`, `insightMetrics`, `getGoalPace`). Detection runs after activity import and on Dashboard focus, computing a verdict from `planned_sessions` joined to `activities`/`run_details`.

**Qualifying runs:** completed runs that are **linked to a planned session** (`planned_session_id` present, so an expected target exists) and have an `avg_pace_seconds_per_km`. Excluded:
- pure `recovery`-label sessions (running slow there is correct, not a fitness signal);
- runs with `elevation_gain_meters > 150` (terrain confound);
- runs with `distance_meters < 1500` (too short, noisy pace).

Unmatched runs (HealthKit imports with no `planned_session_id`) are excluded — there is no prescribed target to compute a residual against.

**Algorithm (chosen: median baseline-equivalent over a rolling window):**
For each qualifying run, back its *actual* average pace out to a **baseline-equivalent** using a representation-agnostic ratio:

```
baseline_equivalent_for_run = current_baseline × (actual_avg_pace / expected_modulated_avg_pace)
```

where `expected_modulated_avg_pace` is the **distance-weighted average target pace of that session's `run_structure` after read-time phase modulation** (`modulateRunStructure`) — i.e. exactly the pace the runner was shown for that session. Because the expected pace is itself `baseline × (the structure's band/phase factors)`, dividing actual by expected and multiplying by the current baseline cancels those factors and yields the baseline that *would* have produced this run — without the design needing to know or re-invert which modifier tables produced the target. (This is the same *spirit* as `volumePlan`'s `split_calibrated` calibration, but computed against the session's own stored structure rather than the `TYPE_INVERSE_MODIFIER` table, so it stays correct regardless of which pace pipeline generated the structure.)

Take the **median** of those per-run baseline-equivalents → `observed` baseline. Compare to the stored baseline. Phase is handled by construction (it's in `expected_modulated_avg_pace`); non-natural cycle profiles simply produce no phase modulation, which is fine.

(Considered and rejected: linear regression on residuals — harder to explain, overkill; EWMA — more responsive but less explainable. Median is robust to a single outlier and the modal can literally state the evidence.)

**Trigger conditions (defaults — all tunable):**
- ≥ **4** qualifying runs within the last **42 days**, AND
- |observed − stored baseline| ≥ **8 s/km** (~2–3%), AND
- ≥ **75%** of qualifying runs share the drift's sign (consistency guard), AND
- no baseline change in the last **21 days** (cooldown), AND
- not currently snoozed.

**Proposed new baseline:** `stored + clamp(0.6 × (observed − stored), ±15 s/km)` — a damped, capped step so we never overshoot on a hot streak (or over-soften after one rough block).

**Verdict shape (pure):**
```ts
type Verdict = {
  direction: 'faster' | 'slower';
  observed: number;             // median baseline-equivalent, s/km
  proposed: number;             // damped/capped new baseline, s/km
  current: number;              // stored baseline, s/km
  evidence: string;             // human-readable, e.g. "your last 6 quality runs work out to about 5:36/km"
  nRuns: number;
  windowDays: number;
  wouldChangeUpcoming: boolean; // false if there are no upcoming planned run sessions to refresh
} | null;                       // null = no trigger
```

---

## Section 2 — The Fitness Update surface

**No hard interrupt.** A confirmed detection surfaces as a **celebratory Dashboard card** (near the guidance cards), not a modal over whatever the user is doing — consistent with Virra's notification ethos. Tapping the card opens the confirm modal.

**The card:**
- **Up:** pulse-accented — "You're getting faster 🔥" / "Your recent runs say your baseline's moved. Tap to see."
- **Down:** dawn-accented (warm, never heat/shaming) — "Let's recalibrate" / "Your last few weeks suggest easing your targets so runs feel right. Tap to review."
- Dismissible inline (×) → snoozes for the cooldown window.

**The confirm modal** (uses the standard sub-menu header pattern — `chevron.left`, muted tint):

```
┌─ FITNESS UPDATE ─────────────────┐
│   You're getting faster.         │  ← Fraunces serif, celebratory
│                                  │
│   Your quality runs over the     │  ← plain-language evidence from the median calc
│   last 6 weeks work out to       │
│   about 5:36/km — quicker than   │
│   the 5:48 your plan assumes.    │
│                                  │
│      5:48  →  5:36 /km           │  ← big Big-Shoulders numbers
│                                  │
│   We'll refresh your upcoming    │  ← sets expectation re: cascade
│   sessions to match.             │
│                                  │
│   [ Update my baseline ]         │  ← pulse CTA
│   [ Not yet ]                    │  ← muted; snoozes
└──────────────────────────────────┘
```

**Downward variant** — same layout, dawn accent, copy only:
- Title: "Let's recalibrate."
- Body: "Your last few weeks have been tougher than your plan assumed — no problem. Let's bring your targets to where you are now so every run feels achievable."
- `5:36 → 5:48 /km`
- "We'll ease your upcoming sessions to match."
- CTA: "Update my targets" / "Keep as is"

**Tone rules (locked):** never a number-on-a-scale framing; never "slower/worse"; never implies failure. Downward is framed as *fit*, not *decline*. Both directions celebrate the act of training honestly.

**After action:**
- "Update" → applies (Section 3); card clears; brief confirmation toast.
- "Not yet" / dismiss → card clears; snoozes for the cooldown (21 days). A *new* threshold crossing past the cooldown can re-surface — we never permanently silence a real change.

---

## Section 3 — Apply / cascade (what "Update" does)

On confirm, as one logical operation:

**1. Write the new baseline.**
- `user_profiles.baseline_pace_seconds_per_km` ← `verdict.proposed`.
- Append a snapshot to `user_profiles.assessment_history` (jsonb): `{ on, from, to, direction, n_runs, window_days }`.

**2. Record the assessment** (`fitness_assessments` — finally used):
- Insert `{ user_id, assessed_on: today, stated_level: current fitness_level, actual_pace_seconds_per_km: proposed, trigger_description: verdict.evidence, direction: verdict.direction, celebrated_at: now() }`.
- This row is the **cooldown anchor** — detection reads the latest `assessed_on`. No extra schema for cooldown.

**3. Regenerate upcoming `run_structure`.** For `planned_sessions` where `status = 'planned'` AND `scheduled_date >= today` AND `modality = 'run'`:
- Re-run `generateRunStructure({ session_label, baseline_pace_secs: newBaseline, distance_km: existing total_distance_m / 1000 })` and write the fresh `run_structure`, **preserving each session's existing distance**. This is exactly how generation (`scheduleGenerator`) and lazy backfill (`hydratePlannedSessions`) already bake structure from the *raw* baseline — `run_structure` is baseline-driven by construction, so it changes cleanly with the new baseline.
- Wrap each session in try/catch: `generateRunStructure` throws on an unrecognised workout type, so a single odd `session_label` must skip (leave its existing structure) rather than abort the whole cascade.
- Completed / dropped / moved sessions are never touched (history preserved).
- Phase modulation stays at read time (`modulateRunStructure` on display) — we regenerate the *base* targets only.

**The goal-pace hierarchy needs no action here.** The event-target / split-calibration hierarchy lives in `getGoalPace`, which feeds only the *read-time summary pace* (`getDaySessionDetail`), not the stored `run_structure`. That summary recomputes on every read, so it already reflects the new baseline wherever its source is `baseline`, and still defers to an event target or split-calibration where those apply — automatically, with no migration step.

**Failure / partial state:** the baseline write is the source of truth and stands even if regeneration partially fails; the lazy `hydratePlannedSessions` backfill reconciles any session that didn't regenerate on next load.

---

## Section 4 — Guardrails & edge cases

**Suppression:**
- **Active/recent break.** If a `training_breaks` record overlaps the detection window, exclude runs inside the break and within ~7 days after it ends (re-acclimation). Suppress *downward* triggers while the window is dominated by post-break runs.
- **Insufficient data.** < 4 qualifying runs → no verdict, silently.
- **Cooldown.** 21 days since the last `fitness_assessments.assessed_on` (whether confirmed or a manual baseline edit).
- **Snoozed.** A dismiss snoozes for the cooldown; a new threshold crossing afterwards can resurface.

**Confound handling (mostly free from the design):**
- **Single outlier** can't trigger — median + ≥75% consistency guard + ±15 s/km cap absorb it.
- **Unmatched runs** excluded (no prescribed target).
- **Cycle phase** handled by construction (residual is vs the phase-modulated target); non-natural cycle profiles fall back to phase-modifier = 1.0.

**Hierarchy-aware modal copy.** Compute `wouldChangeUpcoming` before showing the modal — true when there is ≥1 upcoming planned run session whose `run_structure` will be refreshed. If there are none (no runs scheduled ahead), drop "We'll refresh your upcoming sessions" and use "We'll use this for your next plan." Never promise a visible change that won't happen.

**Manual baseline edits.** If the user edits baseline directly (profile / cycle-settings), that write also appends to `assessment_history` and resets the cooldown — engine and human never fight over the same value within a window.

---

## Section 5 — Schema & testing

**Schema — additive, nullable; everything else reused:**
```sql
-- cooldown/snooze persistence for a dismissed suggestion
alter table user_profiles
  add column fitness_check_snoozed_until timestamptz;

-- explicit direction for clarity + future "your progress" history rendering
alter table fitness_assessments
  add column direction text check (direction in ('faster','slower'));
```
`baseline_pace_seconds_per_km`, `assessment_history`, and `fitness_assessments` are used as-is. No "pending suggestion" storage — the card's presence is recomputed by detection on each load.

**File structure (one responsibility each):**
- `src/lib/baselineCalibration.ts` — **pure** detection: filter qualifying runs → back-out to baseline-equivalents → median/consistency/threshold/guards → `Verdict | null`. No I/O.
- `src/lib/applyBaselineUpdate.ts` — enact a confirmed verdict: write baseline, insert `fitness_assessments`, append `assessment_history`, regenerate future `planned_sessions` via the existing generator path.
- `src/hooks/useFitnessUpdate.ts` — orchestration: run detection on Dashboard focus / post-import; expose `{ verdict, confirm(), snooze() }`.
- `src/components/ui/FitnessUpdateCard.tsx`, `src/components/ui/FitnessUpdateModal.tsx` — the two surfaces.
- `supabase/migrations/0NN_fitness_calibration.sql` — the two columns above.
- Dashboard wiring in `app/(app)/(tabs)/index.tsx` — render the card when a verdict is pending.

**Testing (this feature is mostly pure logic — matches the existing `volumePlan` / `cycleModulation` / `scheduleGenerator` test style with jest-expo + @testing-library/react-native):**
- **`baselineCalibration` (table-driven):** ratio back-out (`current_baseline × actual/expected`) returns the right baseline-equivalent for known structure/actual pairs, including phase-modulated targets; verdict for faster / slower / no-change; min-count gate; consistency guard rejects mixed-sign sets; single-outlier rejection; damping + ±15 s/km cap; cooldown + snooze gates; break-window exclusion + post-break grace; `wouldChangeUpcoming` false when all upcoming are event-driven.
- **`applyBaselineUpdate` (mocked supabase, like `scheduleGeneratorMove` tests):** writes new baseline; inserts assessment with correct `direction`; regenerates `run_structure` for future `planned` runs from the new baseline while preserving each session's distance; leaves completed/dropped/moved untouched; skips (does not abort on) a session whose `session_label` can't be generated.
- **Components:** card renders up vs down variants and dismiss → snooze; modal renders evidence + `old → new`, CTA fires `confirm`, downward copy variant.
- **Manual E2E checklist:** seed faster-than-target completed runs → card → modal → confirm → upcoming runs show faster paces, history intact; downward scenario; break suppression; cooldown re-fire.

---

## Project-guide correction to make alongside this work

Phase B's "✅ Fitness assessment dynamic logic" overstates what exists — only the schema + onboarding self-report were built; the detection trigger and Fitness Update modal were not. F3a delivers them. Update the guide (and the relevant memory) when this ships.
