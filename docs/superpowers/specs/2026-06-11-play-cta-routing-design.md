# Play CTA Routing — Design Spec
*Phase I-Ia · 2026-06-11*

## Overview

Wires the dashboard "play" button to the correct workout execution surface based on the planned session's modality. Run sessions route to the existing GPS run tracker (with session linkage). Strength / yoga / other sessions route to a new workout-preview screen that hosts a live timer and writes the completed workout to HealthKit on finish.

---

## Scope

| # | Change |
|---|---|
| 1 | `TodaysSessionHero` — update `onStartPress` callback signature; add ActionSheet picker for multi-session days |
| 2 | Dashboard — route by modality; pass `sessionId` param |
| 3 | Run tracker — accept `sessionId` param; link activity on save |
| 4 | New screen `/(app)/workout-preview` — preview + live timer + HealthKit write |

Out of scope: per-exercise set/rep logging during strength sessions (Phase I-Ic), substitution/swap mechanics (Phase I-Id).

---

## 1. TodaysSessionHero

**Prop change:**
```ts
// before
onStartPress?: () => void;
// after
onStartPress?: (session: TodaysSession) => void;
```

**Button tap logic:**
- Count planned sessions: `planned = sessions.filter(s => s.status === 'planned')`
- If `planned.length === 1` → call `onStartPress(planned[0])` immediately
- If `planned.length > 1` → call `ActionSheetIOS.showActionSheetWithOptions`:
  - Options: one per planned session (`"${labelCase(s.session_label)} · ${s.modality.toUpperCase()}"`)
  - Cancel button last
  - On selection (non-cancel): call `onStartPress(planned[index])`

**Button label:**
- Single planned session: `START RUN` if `planned[0].modality === 'run'`, else `START SESSION`
- Multiple planned sessions: `START SESSION →`

**No change** to the training tab's hero usage — it passes no `onStartPress`, so nothing breaks.

---

## 2. Dashboard routing

```ts
onStartPress={(session) => {
  if (session.modality === 'run') {
    router.push(`/(app)/run?sessionId=${session.id}` as any);
  } else {
    router.push(`/(app)/workout-preview?sessionId=${session.id}` as any);
  }
}}
```

---

## 3. Run tracker — session linkage

`/(app)/run.tsx` reads `sessionId` from `useLocalSearchParams()`.

On save (existing save path):
1. Insert `activities` row — add `planned_session_id: sessionId ?? null`
2. If `sessionId` is present, update `planned_sessions` row:
   ```sql
   UPDATE planned_sessions
   SET status = 'completed', activity_id = <new_activity_id>
   WHERE id = sessionId;
   ```

If `sessionId` is absent the tracker behaves identically to today.

---

## 4. Workout preview screen — `/(app)/workout-preview.tsx`

### Routing

Sub-menu screen pattern: `SafeAreaView edges={['top']}`, inline header (chevron.left / title / spacer).

Reads `sessionId` from `useLocalSearchParams()`. Fetches planned session from Supabase on mount.

### Screen states

```
idle → active → paused → active → stopped
             ↘ stopped
```

**`idle` (preview)**
- Modality icon + session label
- Cycle guidance line if present (`cycle_reason_short`, pace for runs)
- Structure steps expanded from `run_structure` / `strength_structure` — each step on its own mono row
- Full-width pulse "LET'S GO" button

**`active`**
- Large centred elapsed timer (MM:SS), updating every second
- Session label + modality icon above timer
- Structure steps scrollable below (reference)
- Two buttons: **PAUSE** · **STOP**

**`paused`**
- Timer frozen, "PAUSED" label overlays timer
- Two buttons: **RESUME** · **STOP**

**`stopped` (confirmation)**
- "End session?" alert/confirm before committing
- On confirm → save flow → navigate back

### Timer logic

```ts
startedAt: number       // Date.now() on LET'S GO
pausedDuration: number  // cumulative ms spent paused
pausedAt: number | null // timestamp when paused
```

Effective elapsed = `Date.now() - startedAt - pausedDuration`.
On stop: `durationSeconds = Math.round(effectiveElapsed / 1000)`.

### Save flow (on confirmed stop)

1. **HealthKit write** — `react-native-health` `saveWorkout`:

   | modality | `HKWorkoutActivityType` |
   |---|---|
   | strength | `TraditionalStrengthTraining` |
   | yoga | `Yoga` |
   | swim | `Swimming` |
   | other | `FunctionalStrengthTraining` |

   Payload: `{ type, startDate, endDate, duration: durationSeconds }`

2. **Supabase insert** — `activities`:
   ```ts
   {
     user_id, activity_type: session.modality,
     started_at: new Date(startedAt).toISOString(),
     duration_seconds: durationSeconds,
     planned_session_id: sessionId,
     phase_at_time: currentPhase,
   }
   ```

3. **Supabase update** — `planned_sessions`:
   ```sql
   UPDATE planned_sessions
   SET status = 'completed', activity_id = <new_id>
   WHERE id = sessionId;
   ```

4. Navigate back (`router.back()`).

### Error handling

- HealthKit write failure: log + toast "Saved to Virra — HealthKit write failed"; still complete the Supabase save and navigation.
- Supabase failure: toast "Couldn't save — tap to retry"; stay on screen (don't lose the session).

---

## Open questions resolved during brainstorm

| Question | Decision |
|---|---|
| Multi-session days | ActionSheet picker |
| Non-run execution | New workout-preview screen with timer |
| Run session linkage | Pass `sessionId` param; link on save |
| "LET'S GO" placeholder vs live | Live — timer + HealthKit write |
