# Run Programme Generator — Specification

Status: **built** · 26 Aug 2026 · written against `main` @ 2286a63, built through 6e3cc22

All eight PRs are written. PRs 0-4 are merged and ship in **build 13**; the rest
are open, stacked, and waiting on device UAT. See §12 for what shipped, what is
still open, and the six things building it found that this document got wrong.

Replaces hand-typed `plan_templates.sessions_json` for run plans with a generator that
computes a plan for a specific runner. Strength plans are unaffected (Get Strong stays
authored). Entry point stays the plan picker: the runner browses named plans, the
generator builds underneath.

---

## 0. Two live defects that must be fixed first

The generator's quality is bounded by these, so they are PR 0, not backlog items.

### 0.1 The onboarding 5K time never reaches the plan

`completeOnboarding` parses the runner's 5K time into
`fitness_assessments.actual_pace_seconds_per_km`, but nothing ever writes
`user_profiles.baseline_pace_seconds_per_km`. Every consumer falls back to `?? 360`.

**Consequence:** every runner's paces are generated from 6:00/km regardless of what they
typed. The only writer is `applyBaselineUpdate`, which needs 4 qualifying runs in 42 days,
an ≥8 s median delta, and a 21-day cooldown anchored on the onboarding assessment row —
and then moves the baseline by at most 15 s, damped 0.6. A 22-minute 5K runner needs
several months to converge on the truth from 6:00/km.

**Fix:** write the baseline at onboarding from the stated 5K time. Same for
`weekly_mileage_km`, which is read (defaulting to 30) but never written — the onboarding
`weeklyMileage` bracket is collected and discarded.

### 0.2 The pace ladder is anchored to the wrong reference

`PACE_MULT` in `runWorkoutGenerator.ts` multiplies the runner's **5K pace** by band
factors that are only correct if the anchor is **threshold pace**. Worked through, for a
25:00 5K runner (baseline 300 s/km):

| Band | VIRRA today | Physiologically anchored | Error |
|---|---|---|---|
| recovery | 6:15/km | 6:50/km | 35 s/km too fast |
| easy | 5:45/km | 6:18/km | 33 s/km too fast |
| tempo | 4:45/km | 5:21/km | 36 s/km too fast |
| threshold | 4:30/km | 5:15/km | 45 s/km too fast |
| VO2 (intervals) | 4:09/km | 4:56/km | 47 s/km too fast |

The VO2 figure is the alarming one: 4:09/km is roughly this runner's 1500 m pace, being
prescribed for 800 m reps. Easy runs at 5:45/km are threshold-adjacent, so the plan has
no genuinely easy running in it at all.

**Fix:** section 2.

---

## 1. The runner model

Everything the generator consumes, resolved once at generation time and stored with the
plan so any regeneration is reproducible.

```ts
interface RunnerModel {
  reference:        { distance_m: number; time_s: number; on: string;
                      source: 'stated' | 'measured' };
  ability:          'beginner' | 'recreational' | 'intermediate' | 'advanced';
  returning:        boolean;              // a state, not a tier
  current_weekly_km:      number;
  current_longest_run_km: number;
  days_available:   number;               // 1–7
  preferred_days:   number[];             // 0=Mon
  volume_preset:     'gradual' | 'steady' | 'progressive';
  difficulty_preset: 'comfortable' | 'balanced' | 'challenging';
  cycle:            { profile: CycleProfile; length_days: number;
                      period_start: string } | null;
  injury_level:     'none' | 'niggles' | 'managing' | 'declined' | null;
}
```

Sources today: `user_profiles.fitness_level` (already has the five values),
`weekly_mileage_km` (once 0.1 lands), `injury_level` (shipped 26 Aug), cycle store.

`injury_level` replaced the `injury_history` free-text field on 26 Aug — free text could
not be acted on, so it was a question that implied a promise the app did not keep. The
band can be acted on: `managing` is the one that should bite, capping ramp rate and
entering the ladder conservatively; `declined` must behave exactly like `none` for
planning while remaining distinguishable from "never asked" for prompting.
`current_longest_run_km` is new — derive it from the last 90 days of activities where
they exist, ask only if there is no history.

Ability tiers are the existing enum. Runna's five tiers are defined by observable
behaviour, and ours should be too — the onboarding copy should read
"I can run 5K without stopping", not "Intermediate".

---

## 2. Fitness → paces

**Anchor on threshold, derive everything else.**

1. Take the reference performance and convert with Riegel (`T2 = T1 × (D2/D1)^1.06`)
   to the distance the runner would cover in 60 minutes. That pace is **threshold pace**.
2. All bands are ratios of threshold pace:

| Band | × threshold |
|---|---|
| recovery | 1.30 |
| easy | 1.20 |
| steady | 1.12 |
| marathon | 1.06 |
| tempo | 1.02 |
| threshold | 1.00 |
| CV / 10K | 0.97 |
| VO2 / 5K | 0.94 |
| rep | 0.88 |

3. Goal-race pace comes from Riegel at the goal distance, not from a band — a marathon
   plan's goal-pace blocks should be at the runner's predicted marathon pace. **Unless
   the runner has stated one:** `user_events.target_finish_time` became settable on
   26 Aug and `getGoalPace` already treats it as the highest-priority source. Keep that
   precedence — a stated goal outranks a predicted one.

Keep `baseline_pace_seconds_per_km` as the stored field so nothing downstream breaks;
it becomes *threshold* pace rather than 5K pace. That is a one-off meaning change and
needs a migration: recompute existing rows through Riegel from the stored 5K-equivalent,
and tell affected users their paces have been recalibrated rather than silently slowing
their plans.

`applyBaselineUpdate` and `baselineCalibration` continue to work unchanged — they operate
on whatever the anchor is.

---

## 3. The volume curve

Three constraints, applied in order; the most conservative wins. This is the engine.

```
start_km  = clamp(current_weekly_km, tier.floor, tier.ceiling)
peak_km   = min(tier.ceiling,
                archetype.peak_target(goal_distance),
                start_km × preset.max_multiple)
```

Week-on-week growth is capped twice:

```
next_km = min(prev_km × (1 + preset.rate),
              prev_km + tier.abs_step_km)
```

| Tier | floor | ceiling | abs step | max long run |
|---|---|---|---|---|
| beginner | 8 km | 35 km | +2 km | 12 km |
| recreational | 15 km | 50 km | +3 km | 18 km |
| intermediate | 25 km | 80 km | +5 km | 26 km |
| advanced | 40 km | 120 km | +6 km | 34 km |

| Volume preset | rate | max multiple over plan |
|---|---|---|
| gradual | 5 % | 1.3 × |
| steady | 8 % | 1.5 × |
| progressive | 10 % | 1.8 × |

**Down weeks** every 4th week at 0.72 × the would-be volume. The long run is held, not
grown, in a down week. See §6 for the cycle-aligned variant.

**Taper**, as a fraction of peak, by goal distance:

| Distance | Taper weeks | Fractions |
|---|---|---|
| 5K | 1 | 0.65 |
| 10K | 1–2 | 0.75, 0.60 |
| half | 2 | 0.80, 0.55 |
| marathon | 3 | 0.80, 0.65, 0.45 |

**The long run progresses on its own constraint**, never dragged up by weekly volume:

```
long_next = min(long_prev + tier.long_step_km,   // 1 km beginner … 3 km advanced
                0.35 × week_km,
                archetype.long_cap)              // marathon 32, half 21, 10K 16, 5K 11
```

---

## 4. Week composition

**How many hard sessions**, before phase adjustment:

| Days/week | comfortable | balanced | challenging |
|---|---|---|---|
| 2 | 0 | 1 | 1 |
| 3 | 1 | 1 | 2 |
| 4 | 1 | 2 | 2 |
| 5 | 1 | 2 | 3 |
| 6–7 | 2 | 2 | 3 |

Base phase subtracts one (floor 0) and substitutes strides or hills. Taper keeps the
count but cuts the work volume.

**Which types**, by phase and goal distance:

| Phase | 5K / 10K | half / marathon |
|---|---|---|
| base | strides, hills, steady | strides, hills, steady, progression |
| build | intervals, threshold | threshold, progression, long with goal-pace blocks |
| peak | VO2 intervals, race-pace reps | goal-pace long runs, threshold |
| taper | short sharpeners at race pace | short race-pace touches |

**Placement rules**, in priority order:

1. Long run on the runner's anchor day (default Sunday, configurable).
2. ≥48 h between two hard sessions.
3. No hard session the day after a long run.
4. Easy or recovery adjacent to every hard day.
5. Respect days already occupied by an active strength block —
   `getActiveBlocks` already knows them.
6. Cycle ranking (§6) chooses between remaining candidate days.

---

## 5. Session shapes

`generateRunStructure` stops taking a label and a distance, and starts taking a spec:

```ts
interface SessionSpec {
  type:        RunWorkoutType;
  distance_km: number;          // from the week's budget
  phase:       BlockPhase;
  goal_distance: RaceDistance;
  intensity:   'comfortable' | 'balanced' | 'challenging';
}
```

Interval menus by goal distance (rep length, recovery ratio), replacing the fixed
800 m / 200 m:

| Goal | Base/build reps | Peak reps | Recovery |
|---|---|---|---|
| 5K | 400 m, 600 m, 800 m | 800 m, 1000 m | 1:1 |
| 10K | 800 m, 1000 m | 1000 m, 1200 m | 1:2 (rep:recovery, shorter) |
| half | 1200 m, 1600 m | 2000 m, 3000 m | 1:3 |
| marathon | 1600 m, 3000 m | goal-pace blocks 5–10 km | 1:4 |

Total work volume in a hard session: 20 % of session distance at `comfortable`, 25 % at
`balanced`, 30 % at `challenging`, capped at 8 km of work for intermediate and below.

Tempo: continuous 20–40 min by tier and phase, or cruise intervals (3–5 × 8 min) at
`challenging`. Long runs are plain by default; structured long runs (goal-pace finishing
blocks) appear in build and peak at a frequency set by preference.

---

## 6. The cycle as a foundation, not a modifier

Today the cycle modulates a plan built without it. In the generator it shapes the plan
before it exists. This is the part no competitor can copy.

1. **Down weeks align to the cycle.** Where the plan length allows, the every-4th-week
   down week is nudged to the predicted late-luteal/menstrual week rather than falling on
   an arbitrary week number.
2. **Hard sessions are placed by phase.** `anchorKeySession` in `cycleModulation.ts`
   already does exactly this ranking — long and tempo prefer follicular, intervals prefer
   ovulatory — **and it is fully unit-tested and never called anywhere in the app.** The
   generator is its first caller.
3. **The weekly weighting already exists** as `PHASE_WEIGHT` in `volumePlan.ts`; the
   generator uses it to shape the curve rather than to redistribute after the fact.
4. **Read-time modulation stays** for the fine adjustment — it now corrects a plan that
   was already built the right shape, so the corrections get smaller.

Guardrails, matching existing conventions: `steady` cycle mode disables all of this;
`irregular` applies it at half strength; no cycle data means the plain every-4th-week
down week.

---

## 7. Archetypes

Each archetype is a parameter pack over the same engine. Day one covers everything Runna
does except triathlon.

| Archetype | Curve | Phases | Notes |
|---|---|---|---|
| Race — 5K/10K/half/marathon | volume-led to peak, then taper | base·build·peak·taper·race | needs a date; back-calculates the start |
| Distance goal (no race) | same, gentler peak | base·build·peak | no taper, ends at goal |
| Ultra / 50K | volume-led, long-run dominant | base·build·peak·taper | long-run cap 42 km, back-to-back long runs at `challenging` |
| 5K PB / parkrun | intensity-led | base·sharpen·repeat | volume flat ±5 %, hard sessions progress instead |
| Run faster | intensity-led | rolling 4-week cycles | no end date |
| Run further | volume-led, no intensity | rolling | long run is the only progressing element |
| Run to maintain | flat | none | volume held at current, ≥3 weeks |
| Train your way | flat or gentle | rolling | runner sets mileage target and days |
| New to running | walk-run ladder (§7.1) | stages | double constraint |
| Path to parkrun | walk-run ladder to 5K continuous | stages | ends at a 5K |
| Return after a break | walk-run ladder, entered above stage 1 | stages | seeded from last activity date. Ships day one |
| Return after injury | walk-run ladder, most conservative | stages | seeded from `injury_level` + last activity. **Held for physio review — §10.3** |
| Post-race recovery | descending | recovery | auto-offered when a race plan ends |
| Postpartum | walk-run ladder, most conservative | stages | **Held for pelvic-health-physio review — §10.3** |

Hyrox and functional fitness are **out of scope for day one** — they are strength-run
hybrids that belong on top of Get Strong, not on the run generator, and specifying the
interleave properly is its own piece of work. Flagging rather than silently dropping.

### 7.1 The walk-run ladder

Stages, as run:walk in minutes:

`1:2 → 1:1 → 2:1 → 3:1 → 4:1 → 5:1 → 8:1 → continuous`

Advance one stage when the runner completes at least 2 of the last 3 sessions at the
current stage. Double constraint on progression, the conservative one winning:

- total running time increases ≤ 10 % per week, and
- at most one stage advance per week.

Return-to-running and post-injury enter the ladder above stage 1, seeded from how long
the runner has been out.

---

## 8. Adaptation: realignment replaces silent redistribution

The read-time redistribution in `volumePlan.ts` is retired. It reshuffles volume the
runner never sees (the session card shows the frozen structure distance), and it silently
inflates later weeks by up to 30 %.

**Retired with it: the frozen-distance display bug.** `SessionDetailModal` reads its
headline distance from `modulated_structure.total_distance_m` — the figure computed at
enrol — so the redistributed `distance_km` never reaches the runner. Rather than fix a
display that reads from a mechanism we are removing, PR 7 makes the generated session the
single source of distance, and the card reads that. No separate card; it must be checked
as part of PR 7's acceptance.

In its place, an event-triggered prompt with named choices and stated consequences:

| Trigger | Options offered |
|---|---|
| 1 session missed | none — noted, plan continues |
| ≥3 sessions, or a week, untouched | skip and continue · rearrange into the remaining week |
| ≥2 weeks | extend the plan · rebuild to the original race date · continue and lose the weeks |
| >1 month | restart this plan · rebuild from today · start a different plan · continue (with an injury-risk warning) |
| Illness | soften or pause for a chosen 3–14 days, then ease back |
| Fitness change detected | the existing Fitness Update modal, unchanged |

Realignment = re-run the generator from today with the runner's current state, preserving
completed history. This is only safe because §1 stores the generation inputs.

**One nuance competitors cannot have:** a dip in the menstrual week is expected and
already modulated for. Realignment should not fire on it. Missing three sessions in the
follicular phase means something different from missing three in the menstrual phase, and
the copy should say so.

---

## 9. Data model and code seams

**Engine parameters live in code, not the database.** Every table in this document is a
versioned, reviewable, unit-testable TypeScript constant. This is the fix for run
programme content existing only as production rows — the thing that makes today's plans
unreviewable.

The database keeps what is genuinely content:

- `plan_templates` rows survive as **presentation** for the picker — name, tagline,
  description, sort order, and a new `archetype_key` plus an optional `params_override`
  jsonb. `sessions_json` becomes unused for runs.
- `training_blocks` gains `generator_input jsonb` and `generator_version text`.
- `planned_sessions` is unchanged — plans stay materialised, so week-ahead, calendar and
  the logger keep working exactly as they do.

New module `src/lib/runProgramme/`:

| File | Responsibility |
|---|---|
| `runnerModel.ts` | resolve the RunnerModel from profile + activities + cycle |
| `paceModel.ts` | Riegel, threshold anchor, bands (§2) |
| `volumeCurve.ts` | weeks, down weeks, taper, long-run track (§3) |
| `weekComposer.ts` | session counts, types, placement (§4, §6) |
| `sessionShapes.ts` | SessionSpec → RunWorkoutStructure (§5) |
| `archetypes.ts` | the parameter packs (§7) |
| `generatePlan.ts` | orchestration; returns `WeekSession[]`-compatible output |

`scheduleGenerator.ts` takes generated weeks instead of `sessions_json` — its slot and
day-assignment logic is reused as-is. `plan/[id].tsx` previews from the generator, which
also fixes the strength preview bug of the same shape. `runWorkoutGenerator.ts` is
absorbed into `sessionShapes.ts`.

Every module is a pure function over its inputs, tested with golden fixtures: a fixed
RunnerModel in, a fixed plan out. Plan diffs then become reviewable in PRs.

---

## 10. Decisions still needed

1. ~~**The reference performance question.**~~ **Decided 26 Aug: keep the existing 5K
   question, unchanged.** It converts fine through Riegel, the distance bias is worth a few
   seconds per km against the 30-47 s/km we are already fixing, HealthKit already prefills
   it from `best5kSeconds`, and unlike Runna our Fitness Update self-corrects a stale
   estimate — so onboarding precision matters less to us than it does to them.

   **One addition required.** The field is optional ("Leave blank if you haven't raced")
   and only fitness level and mileage gate Continue, so a blank leaves nothing to persist
   and card 227 still lands on 360. Add a derived fallback from the two forced answers,
   written with `baseline_source: 'derived'` so the Fitness Update can treat it as
   low-confidence and converge faster than it would on a stated time:

   | fitness_level | derived threshold pace |
   |---|---|
   | beginner | 7:12/km |
   | recreational | 6:08/km |
   | returning | 6:30/km |
   | intermediate | 4:52/km |
   | advanced | 4:15/km |

   Derived by inverting `deriveFitnessLevel`'s own average-training-pace bands
   (threshold is roughly average easy pace ÷ 1.18), then holding `returning` one step
   conservative. Belongs in card 227.
2. ~~**Re-anchoring existing runners' paces.**~~ **Decided 26 Aug: migrate everyone in
   place, no in-app ceremony.** Only safe because of timing — beta is around 7 Sept, so
   today's population with a stored baseline is the TestFlight group, who can be told in a
   sentence. **This decision expires at launch:** if PR 1 slips past a public release,
   revisit it, because a runner who has learned their easy pace as 5:45/km will experience
   6:18/km as the app getting worse.
3. ~~**Postpartum, post-injury and return-to-running need sign-off.**~~ **Decided
   26 Aug: split the archetypes by clinical risk.**
   - **Ship day one:** New to Running, Path to parkrun, and Return After a Break (time
     off, no injury). No clinical exposure; the §7.1 ladder governs them.
   - **Specified but held:** Postpartum and Return After Injury. Neither ships until
     reviewed — postpartum by a pelvic health physio, post-injury by a physio or sports
     therapist. Postpartum has established clinical guidance (pelvic health assessment, no
     return to impact in the early months) that a generic ladder does not satisfy, and a
     self-certified "I've been cleared" checkbox moves liability without moving risk.
   - An L2 Gym Instructor qualification does not cover either — this needs external review.
4. **Hyrox / functional fitness** confirmed out of scope for day one.
5. **Imperial units.** `units.ts` exists and stores a preference; every table here is
   metric. Confirm the generator stays metric internally and converts only at display.

---

## 11. Delivery

**No feature flag, and no long-lived branch.** Both were considered and dropped on
26 Aug: the app's only two users are Emma and Paul, so a flag protects nobody, and
`EXPO_PUBLIC_INTERNAL_BUILD` is `true` on the testflight profile anyway — it means "not
production", not "not testers". The real cost of mixing this into an active build is
diagnostic, not user-facing: a rewired plan picker landing mid-UAT makes UAT results
unreadable. So the split follows visibility.

| PR | Contents | How it lands |
|---|---|---|
| 0 | Persist baseline pace and weekly mileage at onboarding, incl. the derived fallback (§0.1, §10.1) | main, into the current build — it is a bug fix |
| 1 | `paceModel.ts` + tests + the re-anchor migration (§0.2, §2) | main — two accounts to convert |
| 2 | `volumeCurve.ts` + `weekComposer.ts` + golden tests (§3, §4) | main — new directory, nothing wired |
| 3 | `sessionShapes.ts`, absorbing `runWorkoutGenerator` (§5) | main — new directory, nothing wired |
| 4 | Race, distance, maintain and train-your-way archetypes; picker wired to the generator (§7) | branch + device UAT |
| 5 | Walk-run ladder: new to running, path to parkrun, return after a break (§7.1). Postpartum and return-after-injury excluded pending review | branch + device UAT |
| 6 | Cycle shaping: down-week alignment and `anchorKeySession` (§6) | branch + device UAT |
| 7 | Realignment UX; retire read-time redistribution **and the frozen-distance display it hid** (§8) | branch + device UAT |
| 8 | Intensity-led archetypes and recovery plans (§7) | branch + device UAT |

PRs 0–3 are invisible to the runner and touch exactly one shipping file
(`completeOnboarding.ts`). The plan the app hands out only changes at PR 4, which is where
branch-per-PR starts. PRs 4 and 7 are the two that touch `volumePlan.ts` and
`plan/[id].tsx` — the same files UAT fixes keep landing in, so they should not be in
flight at the same time as an active UAT round.

---

## 12. What actually happened

Written after the fact. The spec was close on structure and wrong in six
specific places, all of which were found by building the thing rather than by
reasoning about it — mostly by writing a test or printing a plan and looking at
it.

### Shipped in build 13

| PR | | |
|---|---|---|
| [#42](https://github.com/emmahchromatic-web/virra/pull/42) | Onboarding persists baseline pace and weekly mileage | merged + migrated |
| [#45](https://github.com/emmahchromatic-web/virra/pull/45) | Threshold-anchored pace model | merged + migrated |
| [#47](https://github.com/emmahchromatic-web/virra/pull/47) | Volume curve and week composer | merged |
| [#49](https://github.com/emmahchromatic-web/virra/pull/49) | Session shapes come from the goal | merged |
| [#50](https://github.com/emmahchromatic-web/virra/pull/50) | Plans generated for the runner; picker wired | merged |
| [#62](https://github.com/emmahchromatic-web/virra/pull/62) | Weekly volume read from the sessions, redistribution retired | open, targets main |
| [#65](https://github.com/emmahchromatic-web/virra/pull/65) | A back-off week says Recovery | open, targets main |

### Open, stacked, awaiting device UAT

`main` → [#51](https://github.com/emmahchromatic-web/virra/pull/51) walk-run →
[#52](https://github.com/emmahchromatic-web/virra/pull/52) cycle shaping →
[#54](https://github.com/emmahchromatic-web/virra/pull/54) realignment →
[#55](https://github.com/emmahchromatic-web/virra/pull/55) intensity and recovery →
[#56](https://github.com/emmahchromatic-web/virra/pull/56) the realignment prompt

### Six things this spec got wrong

1. **The walk-run double constraint was unusable as specified.** "Running time
   rises no more than 10% a week" left a nine-week beginner plan finishing at
   2:1, where any real couch-to-5K reaches continuous running. The percentage is
   the wrong instrument at the bottom of the ladder: 1:2 to 1:1 doubles the
   running, but in absolute terms it is eight minutes becoming sixteen. A week
   now advances if EITHER the proportional OR the absolute rise is small enough.

2. **The long run never reached the race distance at low volume.** The share cap
   bound first, so a beginner preparing for a 5K topped out at a 3.1km long run
   and then raced 5km. Needed `GOAL_LONG_TARGET_KM` as a floor as well as a cap.

3. **A race week could be smaller than its own race.** The taper fraction was
   applied without reference to the race sitting inside it.

4. **Down weeks reset the long run.** Weekly volume tracked an underlying
   progression that a back-off week displayed below but did not undo; the long
   run did not, so it re-climbed at the tier's step rate every cycle and a
   marathon build stalled at 25km however high the ceiling went.

5. **Two constants were too conservative**, confirmed by Emma and then validated
   against her own templates — see below. `maxMultiple` 1.3/1.5/1.8 → 1.4/1.7/2.0
   and the tier long-run ceilings 12/18/26/34 → 16/24/32/36.

6. **Cycle day-placement rarely changes anything.** Excluding the long-run day
   and the day after leaves a run of consecutive days, which usually falls inside
   a single phase, so every legal candidate ranks equally and the spacing rule
   decides as before. The down-week alignment does the visible work. Sub-phase
   ordering would give it something to say, and is a physiological judgement
   rather than an arithmetic one — Trello 235.

### The templates, finally read

`plan_templates` is authenticated-only and the dashboard was unreachable for
most of the build, so this comparison happened last rather than first. It should
have happened first.

| Template | starts | peaks | ratio |
|---|---|---|---|
| Beginner 5K | 12 km | 20 km | 1.67 × |
| Intermediate 10K | 25 km | 40 km | 1.60 × |
| Half Marathon Build | 35 km | 60 km | 1.71 × |
| Marathon Foundation | 45 km | 80 km | 1.78 × |

**The `steady` preset's 1.7× reproduces Emma's authored plans almost exactly** —
and the original 1.5× would have undershot every one of them. Raising it was
right, and it is now validated against her own judgement rather than mine.

Two differences remain, both deliberate and both worth a coach's eye:

- **The generator ramps a beginner more slowly.** The live template steps
  12 → 14 → 16 (+2 km, about 16% a week); the generator moves at 8%. The
  generator is the more cautious of the two.
- **The generator gives a beginner no quality work in the base phase.** The live
  template has a tempo session from week 2. Base subtracts a hard session by
  design; whether that is right for a 5K beginner is a judgement, not a bug.
