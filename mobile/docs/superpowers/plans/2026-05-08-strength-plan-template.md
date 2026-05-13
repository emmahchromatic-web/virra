# Strength Plan Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Gym 2×/week" strength plan template that runners can stack as a supplementary block alongside their run plan, and update the plan detail screen to render strength plans correctly (replacing km-based UI with session-based UI).

**Architecture:** The strength template is seeded via a Supabase migration using the existing `plan_templates` schema — `sport_type: 'strength'`, `sessions_json` weeks use `km` = session count (2 or 1) so the volume chart still works. The plan detail screen (`plan/[id].tsx`) already has a `sport_type` field on the loaded template; we add a `isStrength` derived boolean and use it to gate the km progress bar, replace the "PEAK WEEK Xkm" stat, and hide the km badge in the week-by-week list. No new tables or API changes required.

**Tech Stack:** Supabase MCP (migration), React Native, existing `plan/[id].tsx` screen, existing `trainingBlocks.ts` (`inferModality('strength')` already returns `'strength'`).

---

## Background: sessions_json format

Each element of `sessions_json` is:
```json
{ "week": 1, "km": 2, "label": "Base", "sessions": ["lower", "upper"] }
```

For strength plans, `km` stores the number of sessions that week (2 or 1). The VolumeChart uses `w.km / maxKm` for bar height — so 2-session weeks show at 100%, 1-session recovery weeks show at 50%. The `km` field is repurposed; we rename the displayed label to "sessions" in the UI.

Session types used in the strength template:
- `lower` — hip hinge, squat, carry patterns
- `upper` — push, pull, core stability
- `strength` — single general session (recovery / taper weeks)

These three need to be added to `SESSION_LABEL` in `plan/[id].tsx`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/005_strength_plan_template.sql` | Seed "Gym 2×/week" template row |
| Modify | `app/(app)/plan/[id].tsx` | Add session labels; gate km UI on sport_type |

---

## Task 1: Seed strength plan template

**Files:**
- Create: `supabase/migrations/005_strength_plan_template.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_strength_plan_template.sql`:

```sql
insert into public.plan_templates (id, name, sport_type, distance_goal, duration_weeks, description, sessions_json)
values (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Gym 2×/week',
  'strength',
  null,
  8,
  'Upper/lower split designed to complement your run training without adding fatigue. Two sessions a week, progressive load, with a deload in week 4 and a taper in week 8.',
  '[
    {"week":1,"km":2,"label":"Base",     "sessions":["lower","upper"]},
    {"week":2,"km":2,"label":"Base",     "sessions":["lower","upper"]},
    {"week":3,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":4,"km":1,"label":"Recovery", "sessions":["strength"]},
    {"week":5,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":6,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":7,"km":2,"label":"Peak",     "sessions":["lower","upper"]},
    {"week":8,"km":1,"label":"Taper",    "sessions":["strength"]}
  ]'::jsonb
)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `name`: `005_strength_plan_template`
- `query`: the SQL above

Verify with `mcp__supabase__execute_sql`:
```sql
select id, name, sport_type, duration_weeks from plan_templates where sport_type = 'strength';
```
Expected: one row, name = `Gym 2×/week`, duration_weeks = 8.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add supabase/migrations/005_strength_plan_template.sql
git commit -m "feat: seed Gym 2x/week strength plan template"
```

---

## Task 2: Update plan detail screen for strength sport type

**Files:**
- Modify: `app/(app)/plan/[id].tsx`

### Context

The plan detail screen (`app/(app)/plan/[id].tsx`) renders templates for all sport types but currently has km-specific UI throughout:

1. **`SESSION_LABEL`** (line ~40) — missing `lower` and `upper` keys. They'd render as raw strings ("lower", "upper") without this fix.

2. **`peakKm` stat pill** (line ~312): `<StatPill label="PEAK WEEK" value={`${peakKm}km`} />` — shows "2km" for the strength template, which is wrong. Should show "2 sessions".

3. **`onTrackStatus` calculation** (lines ~241–245) — uses `weekActualKm` (fetched from `activities` filtered to `activity_type = 'run'`). For a strength plan this is always 0, so it would always show `BEHIND`. Should be null for non-run plans.

4. **km progress bar** (lines ~335–360) — shows "0.0 km done / 2 km planned". Should be hidden for strength.

5. **km badge in week-by-week list** (line ~419) — shows `w.km` with "km" label. Should be hidden for strength.

The fix in all cases is a `const isStrength = plan.sport_type === 'strength'` derived boolean, used to gate each of these five points.

Read the current file at `/Users/pauldickenson/Claude/virra/mobile/app/(app)/plan/[id].tsx` to confirm current line numbers before editing.

- [ ] **Step 1: Add `lower` and `upper` to `SESSION_LABEL`**

Find the `SESSION_LABEL` constant (currently lines ~40–48):
```typescript
const SESSION_LABEL: Record<string, string> = {
  easy:      'Easy',
  tempo:     'Tempo',
  threshold: 'Threshold',
  long:      'Long run',
  strength:  'Strength',
  rest:      'Rest',
  race:      'Race',
};
```
Replace with:
```typescript
const SESSION_LABEL: Record<string, string> = {
  easy:      'Easy',
  tempo:     'Tempo',
  threshold: 'Threshold',
  long:      'Long run',
  strength:  'Strength',
  lower:     'Lower body',
  upper:     'Upper body',
  rest:      'Rest',
  race:      'Race',
};
```

- [ ] **Step 2: Add `isStrength` derived boolean**

Find the `peakKm` derived value (currently line ~221):
```typescript
const peakKm        = weeks.length ? Math.max(...weeks.map((w) => w.km)) : 0;
```
Add `isStrength` immediately after it:
```typescript
const peakKm        = weeks.length ? Math.max(...weeks.map((w) => w.km)) : 0;
const isStrength    = plan?.sport_type === 'strength';
```

- [ ] **Step 3: Fix `onTrackStatus` — return null for non-run plans**

Find the `onTrackStatus` calculation (currently lines ~241–245):
```typescript
const onTrackStatus  = planComplete             ? 'PLAN COMPLETE'
  : !currentWeek                                ? null
  : weekActualKm >= currentWeek.km              ? 'WEEK DONE'
  : weekActualKm >= expectedByNow * 0.8         ? 'ON TRACK'
  :                                               'BEHIND';
```
Replace with:
```typescript
const onTrackStatus  = planComplete             ? 'PLAN COMPLETE'
  : !currentWeek                                ? null
  : isStrength                                  ? null
  : weekActualKm >= currentWeek.km              ? 'WEEK DONE'
  : weekActualKm >= expectedByNow * 0.8         ? 'ON TRACK'
  :                                               'BEHIND';
```

- [ ] **Step 4: Fix `PEAK WEEK` stat pill**

Find (currently line ~312):
```typescript
            <StatPill label="PEAK WEEK"  value={`${peakKm}km`} />
```
Replace with:
```typescript
            <StatPill label="PEAK WEEK"  value={isStrength ? `${peakKm} sessions` : `${peakKm}km`} />
```

- [ ] **Step 5: Gate km progress bar on `!isStrength`**

Find the km progress section inside the current week card (currently lines ~335–360):
```typescript
            {/* km progress */}
            <View style={styles.kmProgress}>
```
Wrap the entire km progress block (from `{/* km progress */}` through the closing `</View>` of `kmProgress`, and the day hint line that references `expectedByNow`) in a `{!isStrength && (...)}` guard:

```typescript
            {!isStrength && (
              <>
                {/* km progress */}
                <View style={styles.kmProgress}>
                  <View style={styles.kmProgressTrack}>
                    <View style={[styles.kmProgressFill, {
                      width: `${Math.min(weekActualKm / currentWeek.km, 1) * 100}%` as any,
                      backgroundColor: onTrackColor,
                    }]} />
                  </View>
                  <View style={styles.kmProgressLabels}>
                    <VirraText variant="mono" size={9} color={colors.breath}>
                      {weekActualKm.toFixed(1)} km done
                    </VirraText>
                    <VirraText variant="mono" size={9} color={colors.muted}>
                      {currentWeek.km} km planned
                    </VirraText>
                  </View>
                </View>

                {/* Day hint */}
                <VirraText variant="mono" size={9} color={colors.muted}>
                  Day {dayInWeek + 1} of 7
                  {expectedByNow > 0 && weekActualKm < currentWeek.km
                    ? `  ·  ${expectedByNow.toFixed(1)} km expected by now`
                    : ''}
                </VirraText>
              </>
            )}
```

Read the file to confirm the exact block before editing — the day hint line may already be separate from the km progress block.

- [ ] **Step 6: Gate km badge in week-by-week list on `!isStrength`**

In the week-by-week list, each week row has a km badge (currently around lines ~419–422):
```typescript
                  <View style={styles.kmBadge}>
                    <VirraText variant="display" size={22} color={colors.breath}>{w.km}</VirraText>
                    <VirraText variant="mono" size={9} color={colors.muted} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>km</VirraText>
```
Wrap that `<View style={styles.kmBadge}>` block in `{!isStrength && (...)}`.

Read the file to confirm exact surroundings before editing.

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "plan" | head -20
```

Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 77 tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/plan/[id].tsx"
git commit -m "feat: strength plan UI — session labels, hide km stats for non-run plans"
```

---

## Self-Review

**Spec coverage:**
- ✅ Strength template seeded with correct phases (Base→Base→Build→Recovery→Build→Build→Peak→Taper) — Task 1
- ✅ Upper/lower session types display correctly — Task 2 Step 1
- ✅ "PEAK WEEK 2 sessions" stat pill — Task 2 Step 4
- ✅ km progress bar hidden for strength — Task 2 Step 5
- ✅ onTrackStatus neutral for strength (no false "BEHIND") — Task 2 Step 3
- ✅ km badge hidden in week-by-week — Task 2 Step 6
- ✅ Existing run plan UI unchanged (`isStrength = false` for all current templates) — all guards use `!isStrength`
- ✅ Plan stacking works automatically — `inferModality('strength')` already returns `'strength'`, `addBlock` uses `inferModality(plan.sport_type)` — no changes needed to `trainingBlocks.ts`
- ✅ Strength plan appears in Training tab browse list — templates query has no sport_type filter

**Placeholder scan:** None. All code blocks are complete.

**Type consistency:**
- `isStrength: boolean` derived from `plan?.sport_type` — `plan` is `PlanTemplate | null`; `plan?.sport_type` is `string | undefined`; `=== 'strength'` is safe ✅
- `SESSION_LABEL` keys `lower` and `upper` match `sessions` values in the seeded template ✅
