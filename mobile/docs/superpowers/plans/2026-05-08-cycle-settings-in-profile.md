# Cycle Settings in Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users update their cycle profile (natural / hormonal / irregular / perimenopause / menopause) and related data (period start, cycle length) from the Profile screen, so life changes like going on the pill or entering perimenopause feed through to the cycle engine immediately.

**Architecture:** A new `app/(app)/cycle-settings.tsx` full-screen card (registered in the app stack layout) replicates the onboarding cycle.tsx UI — profile selector + conditional date pickers for natural/irregular. Tapping "CYCLE PROFILE" in the Profile CYCLE card navigates here. On save, it writes to `user_profiles.cycle_profile` and (for natural/irregular) upserts the most recent `cycle_logs` row, then updates the Zustand store. The store's `setCycleProfile` action is also fixed to clear `cycleInfo` when switching away from natural/irregular — otherwise stale cycle phase data leaks into nutrition targets.

**Tech Stack:** Expo + expo-router (Stack navigation), Supabase client, Zustand (`useCycleStore`), existing `VirraText`, `VirraButton`, `VirraCard` components.

---

## Background: key types

```typescript
// src/lib/cycleEngine.ts
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
export type CycleProfile = 'natural' | 'hormonal' | 'irregular' | 'perimenopause' | 'menopause';

export interface CycleInfo {
  phase:               CyclePhase;
  dayOfCycle:          number;
  daysUntilNextPeriod: number;
  cycleLength:         number;
}
```

`CycleInfo` is null when `cycleProfile` is `hormonal` / `perimenopause` / `menopause` — these users get flat nutrition targets (no phase modulation). If `setCycleProfile` doesn't clear `cycleInfo`, a user who switches from natural to hormonal still sees phase-adjusted targets until the next app restart. Task 1 fixes this.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/cycle.ts` | Fix `setCycleProfile` to clear `cycleInfo` for non-natural profiles |
| Create | `__tests__/store/cycle.test.ts` | Test `setCycleProfile` clear/preserve behaviour |
| Create | `app/(app)/cycle-settings.tsx` | Full-screen cycle settings editor |
| Modify | `app/(app)/_layout.tsx` | Register `cycle-settings` as a Stack.Screen |
| Modify | `app/(app)/(tabs)/profile.tsx` | Add CYCLE PROFILE row, gate date-specific rows |

---

## Task 1: Fix `setCycleProfile` store action

**Files:**
- Modify: `src/store/cycle.ts`
- Create: `__tests__/store/cycle.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/store/cycle.test.ts`:

```typescript
import { useCycleStore, type CycleInfo, type CycleProfile } from '@/store/cycle';

const mockCycleInfo: CycleInfo = {
  phase: 'follicular',
  dayOfCycle: 7,
  daysUntilNextPeriod: 21,
  cycleLength: 28,
};

describe('useCycleStore — setCycleProfile', () => {
  it('clears cycleInfo when switching to hormonal', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('hormonal');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
    expect(useCycleStore.getState().cycleProfile).toBe('hormonal');
  });

  it('clears cycleInfo when switching to perimenopause', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('perimenopause');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
  });

  it('clears cycleInfo when switching to menopause', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('menopause');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
  });

  it('preserves cycleInfo when switching to natural', () => {
    useCycleStore.setState({ cycleProfile: 'irregular', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('natural');
    expect(useCycleStore.getState().cycleInfo).toEqual(mockCycleInfo);
  });

  it('preserves cycleInfo when switching to irregular', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('irregular');
    expect(useCycleStore.getState().cycleInfo).toEqual(mockCycleInfo);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/store/cycle.test.ts --no-coverage 2>&1 | tail -15
```

Expected: 3 failures (the `hormonal`, `perimenopause`, `menopause` tests fail because the current `setCycleProfile` doesn't clear `cycleInfo`).

- [ ] **Step 3: Fix `setCycleProfile` in the store**

In `src/store/cycle.ts`, find (line ~32):
```typescript
  setCycleProfile: (profile) =>
    set({ cycleProfile: profile }),
```
Replace with:
```typescript
  setCycleProfile: (profile) =>
    set((s) => ({
      cycleProfile: profile,
      cycleInfo: (profile === 'natural' || profile === 'irregular') ? s.cycleInfo : null,
    })),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/store/cycle.test.ts --no-coverage 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Run full suite to check no regressions**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -5
```

Expected: all tests pass (82 total — 77 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add src/store/cycle.ts __tests__/store/cycle.test.ts
git commit -m "fix: setCycleProfile clears cycleInfo for non-natural profiles"
```

---

## Task 2: Create Cycle Settings screen

**Files:**
- Create: `app/(app)/cycle-settings.tsx`

This screen is a full-screen card (navigated to via `router.push`) that lets users change their cycle profile and, for natural/irregular, update period start date and cycle length. It saves to Supabase on tap of SAVE, then updates the store, then calls `router.back()`.

- [ ] **Step 1: Create the file**

Create `app/(app)/cycle-settings.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore, type CycleProfile } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string }[] = [
  { value: 'natural',       label: 'Regular cycle',           sub: 'I can roughly predict it'           },
  { value: 'hormonal',      label: 'Hormonal contraception',  sub: 'Pill, IUD, implant or patch'        },
  { value: 'irregular',     label: 'Irregular cycle',         sub: 'Unpredictable or recently changed'  },
  { value: 'perimenopause', label: 'Perimenopause',           sub: 'Cycles changing or stopping'        },
  { value: 'menopause',     label: 'Menopause',               sub: 'No period for 12+ months'           },
];

const NON_NATURAL_NOTE: Partial<Record<CycleProfile, string>> = {
  hormonal:      'Your targets are based on training load — the same science, without cycle phase modulation.',
  perimenopause: 'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:     'Your targets are based on training load. Symptom logging is available throughout.',
};

export default function CycleSettingsScreen() {
  const { session } = useAuthStore();
  const {
    cycleProfile: storeProfile,
    periodStart:  storePeriodStart,
    cycleLength:  storeCycleLength,
    setCycleProfile,
    setPeriodStart,
    setCycleLength,
  } = useCycleStore();

  const [selectedProfile, setSelectedProfile] = useState<CycleProfile>(storeProfile);
  const [periodStart, setPeriodStartLocal]     = useState<Date>(
    storePeriodStart ?? new Date(Date.now() - 28 * MS_PER_DAY),
  );
  const [cycleLength, setCycleLengthLocal] = useState(storeCycleLength);
  const [saving, setSaving]                = useState(false);

  const showDatePickers = selectedProfile === 'natural' || selectedProfile === 'irregular';

  function shiftDate(days: number) {
    setPeriodStartLocal((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ cycle_profile: selectedProfile })
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      if (showDatePickers) {
        const periodStr = periodStart.toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('cycle_logs')
          .select('id')
          .eq('user_id', session.user.id)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('cycle_logs')
            .update({ period_start: periodStr, cycle_length_days: cycleLength })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cycle_logs')
            .insert({ user_id: session.user.id, period_start: periodStr, cycle_length_days: cycleLength });
        }
      }

      setCycleProfile(selectedProfile);
      if (showDatePickers) {
        setPeriodStart(periodStart);
        setCycleLength(cycleLength);
      }

      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <VirraText variant="display" size={24} color={colors.pulse}>Cycle Settings</VirraText>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <VirraText variant="mono" size={10} color={colors.muted} style={styles.sectionLabel}>
          CYCLE PROFILE
        </VirraText>
        {CYCLE_PROFILES.map((opt) => {
          const active = selectedProfile === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setSelectedProfile(opt.value)}
              style={[styles.profileOption, active && styles.profileOptionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                {opt.label}
              </VirraText>
              <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                {opt.sub}
              </VirraText>
            </Pressable>
          );
        })}
      </View>

      {showDatePickers && (
        <>
          <View style={styles.section}>
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.sectionLabel}>
              {selectedProfile === 'irregular'
                ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?'
                : 'LAST PERIOD START'}
            </VirraText>
            <View style={styles.datePicker}>
              <Pressable onPress={() => shiftDate(-1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
              </Pressable>
              <VirraText variant="bodyMedium" size={16} color={colors.breath} style={styles.dateText}>
                {formatDate(periodStart)}
              </VirraText>
              <Pressable onPress={() => shiftDate(1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.sectionLabel}>
              AVERAGE CYCLE LENGTH
            </VirraText>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setCycleLengthLocal((n) => Math.max(21, n - 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
              </Pressable>
              <View style={styles.stepCenter}>
                <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
              </View>
              <Pressable
                onPress={() => setCycleLengthLocal((n) => Math.min(40, n + 1))}
                style={styles.stepBtn}
                hitSlop={12}
              >
                <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
              </Pressable>
            </View>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.stepHint}>
              Range: 21–40 days
            </VirraText>
          </View>
        </>
      )}

      {!showDatePickers && NON_NATURAL_NOTE[selectedProfile] && (
        <View style={styles.note}>
          <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={styles.noteText}>
            {NON_NATURAL_NOTE[selectedProfile]}
          </VirraText>
        </View>
      )}

      <VirraButton label="SAVE" onPress={handleSave} loading={saving} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:              { flex: 1 },
  container:           { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  header:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section:             { gap: spacing.sm },
  sectionLabel:        { letterSpacing: 2, marginBottom: spacing.xs },
  profileOption:       { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  datePicker:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:             { width: 36, alignItems: 'center' },
  dateText:            { flex: 1, textAlign: 'center' },
  stepper:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:             { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:          { alignItems: 'center', gap: 2 },
  stepHint:            { textAlign: 'center' },
  note:                { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:            { lineHeight: 22 },
  cta:                 { marginTop: spacing.sm },
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "cycle-settings" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/cycle-settings.tsx"
git commit -m "feat: add Cycle Settings screen — profile selector, date pickers, Supabase save"
```

---

## Task 3: Register route and update Profile screen

**Files:**
- Modify: `app/(app)/_layout.tsx`
- Modify: `app/(app)/(tabs)/profile.tsx`

- [ ] **Step 1: Register `cycle-settings` in the app stack layout**

In `app/(app)/_layout.tsx`, find (line ~82):
```typescript
      <Stack.Screen name="manual-activity" options={{ presentation: 'modal' }} />
```
Add the new screen immediately after it:
```typescript
      <Stack.Screen name="manual-activity" options={{ presentation: 'modal' }} />
      <Stack.Screen name="cycle-settings"  options={{ presentation: 'card'  }} />
```

- [ ] **Step 2: Update `app/(app)/(tabs)/profile.tsx`**

**2a. Add `CycleProfile` to the store import.**

Find (line ~12):
```typescript
import { useCycleStore } from '@/store/cycle';
```
Replace with:
```typescript
import { useCycleStore, type CycleProfile } from '@/store/cycle';
```

**2b. Add `CYCLE_PROFILE_LABEL` constant** (add after the `row` StyleSheet, around line 62, outside the component):

```typescript
const CYCLE_PROFILE_LABEL: Record<CycleProfile, string> = {
  natural:       'Regular cycle',
  hormonal:      'Hormonal contraception',
  irregular:     'Irregular cycle',
  perimenopause: 'Perimenopause',
  menopause:     'Menopause',
};
```

**2c. Add `cycleProfile` to the store destructure** (line ~67):

Find:
```typescript
  const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart } = useCycleStore();
```
Replace with:
```typescript
  const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart, cycleProfile } = useCycleStore();
```

**2d. Add `showCycleDetails` constant** (add immediately after the `displayName`/`initials` lines, around line 85):

Find:
```typescript
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Runner';
  const initials    = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
```
Add after:
```typescript
  const displayName    = [firstName, lastName].filter(Boolean).join(' ') || 'Runner';
  const initials       = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const showCycleDetails = cycleProfile === 'natural' || cycleProfile === 'irregular';
```

**2e. Replace the CYCLE card** (lines ~208–223):

Find:
```typescript
        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>CYCLE</VirraText>
          <Row
            label="CURRENT PHASE"
            value={cycleInfo ? `${cycleInfo.phase.charAt(0).toUpperCase() + cycleInfo.phase.slice(1)} · Day ${cycleInfo.dayOfCycle}` : 'Not set'}
          />
          <Row
            label="LAST PERIOD"
            value={periodStart ? periodStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}
          />
          <Row
            label="CYCLE LENGTH"
            value={`${cycleLength} days`}
            onPress={() => { setCycleLengthInput(String(cycleLength)); setCycleLengthModalVisible(true); }}
          />
        </VirraCard>
```
Replace with:
```typescript
        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>CYCLE</VirraText>
          <Row
            label="CYCLE PROFILE"
            value={CYCLE_PROFILE_LABEL[cycleProfile]}
            onPress={() => router.push('/(app)/cycle-settings')}
          />
          {showCycleDetails && (
            <>
              <Row
                label="CURRENT PHASE"
                value={cycleInfo ? `${cycleInfo.phase.charAt(0).toUpperCase() + cycleInfo.phase.slice(1)} · Day ${cycleInfo.dayOfCycle}` : 'Not set'}
              />
              <Row
                label="LAST PERIOD"
                value={periodStart ? periodStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}
              />
              <Row
                label="CYCLE LENGTH"
                value={`${cycleLength} days`}
                onPress={() => { setCycleLengthInput(String(cycleLength)); setCycleLengthModalVisible(true); }}
              />
            </>
          )}
        </VirraCard>
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -E "profile|cycle" | head -20
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -5
```

Expected: 82 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/_layout.tsx" "app/(app)/(tabs)/profile.tsx"
git commit -m "feat: Cycle Settings entry in Profile — profile selector, gate date rows"
```

---

## Self-Review

**Spec coverage:**
- ✅ User can update cycle_profile from Profile — Task 3 (CYCLE PROFILE row → cycle-settings screen)
- ✅ Pill / hormonal contraception users supported — CYCLE_PROFILES includes 'hormonal'
- ✅ Perimenopause / menopause users supported — CYCLE_PROFILES includes both
- ✅ Change feeds to cycle engine immediately — `setCycleProfile` + `setPeriodStart` + `setCycleLength` update store on save, which drives all downstream calculations
- ✅ cycleInfo cleared for non-natural on profile switch — Task 1 store fix
- ✅ Date pickers hidden for hormonal/peri/menopause — `showDatePickers` gate in cycle-settings.tsx
- ✅ CURRENT PHASE / LAST PERIOD / CYCLE LENGTH rows hidden for non-natural in Profile — `showCycleDetails` gate — Task 3
- ✅ Supabase updated on save — `user_profiles.cycle_profile` + conditional `cycle_logs` upsert
- ✅ Route registered in app stack — Task 3 Step 1

**Placeholder scan:** None. All code blocks are complete.

**Type consistency:**
- `CycleProfile` imported from `@/store/cycle` in all three modified files — consistent ✅
- `CYCLE_PROFILE_LABEL: Record<CycleProfile, string>` exhaustive — all 5 values present ✅
- `NON_NATURAL_NOTE: Partial<Record<CycleProfile, string>>` — partial is correct (natural/irregular have no note) ✅
- `setCycleProfile(selectedProfile)` — `selectedProfile` is `CycleProfile`, matches action signature ✅
- `setPeriodStart(periodStart)` — `periodStart` is `Date`, matches `(date: Date, today?: Date) => void` ✅
- `setCycleLength(cycleLength)` — `cycleLength` is `number`, matches action signature ✅
