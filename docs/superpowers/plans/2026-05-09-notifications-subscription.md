# Notifications Intelligence + Subscription Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire adaptive training reminder timing (mode hour from activity history, rest-day gate from planned sessions), trial reminder scheduling, and a dedicated subscription management screen replacing the existing placeholder modal.

**Architecture:** Four tasks: (1) notification intelligence in `notifications.ts`; (2) RevenueCat trial detection + `_layout.tsx` wiring; (3) new `subscription.tsx` screen; (4) profile cleanup + Stack registration. Notification preferences toggles in Profile are already complete — no changes needed there.

**Tech Stack:** Expo Notifications, Supabase (activities + planned_sessions query), RevenueCat `react-native-purchases`, Zustand (`useSubscriptionStore`), expo-router, existing VirraCard/VirraButton/VirraText components.

---

## Context

Current gaps:
- `scheduleDailyReminders()` takes no params, fires training reminder at hardcoded 9am regardless of rest days
- `scheduleTrialReminders(trialEnd)` exists but is never called — users never receive trial-end warnings
- `getActiveEntitlement()` in `_layout.tsx` only detects `active` or `expired` — trial status is never set in the store
- Profile subscription card shows a `VirraModal` pointing to "Settings → Subscriptions" — no dedicated screen exists

**Already complete (do NOT rebuild):**
- All 5 notification preference toggles in `profile.tsx` (training/breakfast/lunch/dinner/checkin)
- All cancellation functions in `notifications.ts` (cancelTrainingReminderToday, cancelNutritionReminderForMeal, etc.)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/notifications.ts` | Add `inferTrainingHour(userId)`, update `scheduleDailyReminders(userId)` with planned-session gate + adaptive hour |
| Modify | `src/lib/revenuecat.ts` | Add `EntitlementInfo` interface + `getEntitlementInfo()` |
| Modify | `app/(app)/_layout.tsx` | Pass userId to `scheduleDailyReminders`; wire trial detection + `scheduleTrialReminders` |
| Create | `app/(app)/subscription.tsx` | Status badge, trial countdown, upgrade CTA, manage link, restore purchases |
| Modify | `app/(app)/(tabs)/profile.tsx` | Replace subscription modal with navigation row; update training sublabel; remove `subModalVisible` state |

---

## Task 1: Notification Intelligence in `notifications.ts`

**Files:**
- Modify: `src/lib/notifications.ts`

Read `mobile/src/lib/notifications.ts` first. Current state:
- Line 1–2: imports `expo-notifications` and `AsyncStorage` — no Supabase import
- Line 113: `export async function scheduleDailyReminders(): Promise<void>` — no params
- Line 121: `todayAt(9)` — hardcoded 9am, no adaptive timing, no rest-day gate

- [ ] **Step 1: Add Supabase import at the top of `notifications.ts`**

After line 2 (`import AsyncStorage from '@react-native-async-storage/async-storage';`), add:

```typescript
import { supabase } from './supabase';
```

- [ ] **Step 2: Add `inferTrainingHour` after the `cancelTrialReminders` function (end of file)**

```typescript
/** Compute the mode hour from the user's last 30 activities. Falls back to 9. */
export async function inferTrainingHour(userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('activities')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(30);
    if (!data || data.length === 0) return 9;
    const counts: Record<number, number> = {};
    for (const { started_at } of data) {
      const hour = new Date(started_at).getHours();
      counts[hour] = (counts[hour] ?? 0) + 1;
    }
    return Number(Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0]);
  } catch {
    return 9;
  }
}
```

- [ ] **Step 3: Replace `scheduleDailyReminders` (lines 113–160) with the updated version**

Replace:
```typescript
/** Call on every app foreground — idempotent, respects per-slot preferences. */
export async function scheduleDailyReminders(): Promise<void> {
  const [date, prefs] = [today(), await loadNotificationPreferences()];

  if (prefs.training) {
    await scheduleOnce(
      storageKey('training', date),
      'Time to move',
      "Today's session is ready. Tap to start.",
      todayAt(9),
    );
  }
```

With:
```typescript
/** Call on every app foreground — idempotent, respects per-slot preferences. */
export async function scheduleDailyReminders(userId: string): Promise<void> {
  const [date, prefs] = [today(), await loadNotificationPreferences()];

  if (prefs.training) {
    const { data: sessions } = await supabase
      .from('planned_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('scheduled_date', date)
      .eq('status', 'planned')
      .limit(1);

    if (sessions && sessions.length > 0) {
      const hour = await inferTrainingHour(userId);
      await scheduleOnce(
        storageKey('training', date),
        'Time to move',
        "Today's session is ready. Tap to start.",
        todayAt(hour),
      );
    }
  }
```

The rest of the function (breakfast, lunch, dinner, checkin — lines 124–160) remains unchanged.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```

Expected: no errors referencing `notifications.ts`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && git add src/lib/notifications.ts
git commit -m "feat: adaptive training reminder — mode hour from activity history, rest-day gate from planned sessions"
```

---

## Task 2: RevenueCat Trial Detection + `_layout.tsx` Wiring

**Files:**
- Modify: `src/lib/revenuecat.ts`
- Modify: `app/(app)/_layout.tsx`

Read `mobile/src/lib/revenuecat.ts` and `mobile/app/(app)/_layout.tsx` first.

Current state of `revenuecat.ts`:
- `getActiveEntitlement()` returns `boolean` only — no trial info, no `managementURL`
- `restorePurchases()` returns `boolean`

Current state of `_layout.tsx` subscription useEffect (lines 24–30):
```typescript
useEffect(() => {
  if (!session || isActive) return;
  getActiveEntitlement().then((active) => {
    setStatus(active ? 'active' : 'expired');
    if (!active) router.replace('/(auth)/paywall');
  });
}, [session, isActive]);
```

Current `scheduleDailyReminders()` call sites: lines 58 and 64 — both without `userId`.

- [ ] **Step 1: Add `EntitlementInfo` interface and `getEntitlementInfo()` to `revenuecat.ts`**

After the `purchasePackage` function, before `restorePurchases`, insert:

```typescript
export interface EntitlementInfo {
  isActive:      boolean;
  isTrial:       boolean;
  trialEnd:      Date | null;
  managementURL: string | null;
}

export async function getEntitlementInfo(): Promise<EntitlementInfo> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const ent = customerInfo.entitlements.active[ENTITLEMENT_ID];
    return {
      isActive:      !!ent,
      isTrial:       (ent?.periodType as string | undefined)?.toUpperCase() === 'TRIAL',
      trialEnd:      ent?.expirationDate ? new Date(ent.expirationDate) : null,
      managementURL: customerInfo.managementURL ?? null,
    };
  } catch {
    return { isActive: false, isTrial: false, trialEnd: null, managementURL: null };
  }
}
```

- [ ] **Step 2: Update `_layout.tsx` imports**

Replace line 10:
```typescript
import { getActiveEntitlement } from '@/lib/revenuecat';
```
With:
```typescript
import { getEntitlementInfo } from '@/lib/revenuecat';
```

And replace line 10 of the notifications import:
```typescript
import { scheduleDailyReminders, cancelTrialReminders } from '@/lib/notifications';
```
With:
```typescript
import { scheduleDailyReminders, cancelTrialReminders, scheduleTrialReminders } from '@/lib/notifications';
```

- [ ] **Step 3: Replace the subscription useEffect in `_layout.tsx`**

Replace lines 24–30:
```typescript
useEffect(() => {
  if (!session || isActive) return;
  getActiveEntitlement().then((active) => {
    setStatus(active ? 'active' : 'expired');
    if (!active) router.replace('/(auth)/paywall');
  });
}, [session, isActive]);
```

With:
```typescript
useEffect(() => {
  if (!session || isActive) return;
  getEntitlementInfo().then((info) => {
    if (info.isActive && info.isTrial) {
      setStatus('trial', info.trialEnd ?? undefined);
      if (info.trialEnd) scheduleTrialReminders(info.trialEnd);
    } else if (info.isActive) {
      setStatus('active');
    } else {
      setStatus('expired');
      router.replace('/(auth)/paywall');
    }
  });
}, [session, isActive]);
```

- [ ] **Step 4: Pass `userId` to both `scheduleDailyReminders` call sites**

In the foreground useEffect (around lines 46–69), both `scheduleDailyReminders()` calls need `session.user.id`.

Replace:
```typescript
    runImport();
    scheduleDailyReminders();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        scheduleDailyReminders();
      }
```

With:
```typescript
    runImport();
    scheduleDailyReminders(session.user.id);

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        scheduleDailyReminders(session.user.id);
      }
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && git add src/lib/revenuecat.ts "app/(app)/_layout.tsx"
git commit -m "feat: trial detection via getEntitlementInfo, wire scheduleTrialReminders, pass userId to scheduleDailyReminders"
```

---

## Task 3: Subscription Management Screen

**Files:**
- Create: `app/(app)/subscription.tsx`

Reference `app/(app)/cycle-settings.tsx` for the card-style screen pattern (ScrollView + back button + VirraButton save action).

- [ ] **Step 1: Create `app/(app)/subscription.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSubscriptionStore } from '@/store/subscription';
import { getEntitlementInfo, restorePurchases } from '@/lib/revenuecat';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { VirraButton } from '@/components/ui/VirraButton';

const STATUS_COLOR: Record<string, string> = {
  trial:     colors.dawn,
  active:    colors.pulse,
  expired:   colors.heat,
  cancelled: colors.heat,
};

const STATUS_LABEL: Record<string, string> = {
  trial:     'FREE TRIAL',
  active:    'ACTIVE',
  expired:   'EXPIRED',
  cancelled: 'CANCELLED',
  unknown:   '—',
};

export default function SubscriptionScreen() {
  const { status, trialEnd, setStatus } = useSubscriptionStore();
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [restoring, setRestoring]         = useState(false);

  useEffect(() => {
    getEntitlementInfo()
      .then((info) => setManagementURL(info.managementURL))
      .finally(() => setLoading(false));
  }, []);

  const daysRemaining = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000))
    : null;

  async function handleManage() {
    const url = managementURL ?? 'https://apps.apple.com/account/subscriptions';
    await Linking.openURL(url);
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        setStatus('active');
        Alert.alert('Purchases restored', 'Your subscription has been restored.');
      } else {
        Alert.alert('Nothing to restore', 'No previous subscription found for this Apple ID.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'An error occurred.');
    } finally {
      setRestoring(false);
    }
  }

  const badgeColor = STATUS_COLOR[status] ?? colors.muted;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <SymbolView name="chevron.left" size={16} tintColor={colors.muted} />
          <VirraText variant="mono" size={11} color={colors.muted}>BACK</VirraText>
        </Pressable>
      </View>
      <VirraText variant="display" size={26} color={colors.pulse} style={styles.title}>
        Subscription
      </VirraText>

      <VirraCard style={styles.card}>
        <VirraText variant="mono" size={9} color={colors.muted} style={styles.sectionLabel}>
          PLAN STATUS
        </VirraText>

        {loading ? (
          <ActivityIndicator color={colors.pulse} style={{ marginVertical: spacing.sm }} />
        ) : (
          <>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { borderColor: badgeColor }]}>
                <VirraText variant="mono" size={13} color={badgeColor}>
                  {STATUS_LABEL[status] ?? status.toUpperCase()}
                </VirraText>
              </View>
            </View>

            {status === 'trial' && daysRemaining !== null && (
              <VirraText variant="body" size={14} color={colors.breath} style={{ marginTop: spacing.xs }}>
                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining in your free trial
              </VirraText>
            )}

            {status === 'trial' && (
              <VirraButton
                label="Upgrade to Virra Pro"
                onPress={() => router.push('/(auth)/paywall')}
                style={{ marginTop: spacing.md }}
              />
            )}
          </>
        )}
      </VirraCard>

      <VirraCard style={styles.card}>
        <Pressable style={styles.linkRow} onPress={handleManage} disabled={loading}>
          <VirraText variant="body" size={15} color={colors.breath}>Manage Subscription</VirraText>
          <SymbolView name="arrow.up.right" size={14} tintColor={colors.muted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={handleRestore} disabled={restoring}>
          <VirraText variant="body" size={15} color={restoring ? colors.muted : colors.breath}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </VirraText>
          {restoring && <ActivityIndicator size="small" color={colors.muted} />}
        </Pressable>
      </VirraCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: colors.mile },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title:        { marginBottom: spacing.sm },
  card:         { gap: spacing.xs },
  sectionLabel: { letterSpacing: 1.5, marginBottom: spacing.xs },
  badgeRow:     { flexDirection: 'row', marginTop: spacing.xs },
  badge:        {
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  linkRow:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider:  { height: 1, backgroundColor: colors.border },
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && git add "app/(app)/subscription.tsx"
git commit -m "feat: subscription management screen — status badge, trial countdown, upgrade CTA, manage link, restore"
```

---

## Task 4: Profile Cleanup + Stack Registration

**Files:**
- Modify: `app/(app)/(tabs)/profile.tsx`
- Modify: `app/(app)/_layout.tsx`

Read both files before editing.

**What to change in `profile.tsx`:**
1. Remove `subModalVisible` state (line 82)
2. Remove the `setSubModalVisible` calls
3. Replace the SUBSCRIPTION card's "MANAGE" row with navigation to `/(app)/subscription`
4. Remove the "Subscription modal" VirraModal (lines 314–324)
5. Update the training notification sublabel from "Daily at 9:00 am · cancels when workout logged" → "Adaptive · based on your history · cancels when workout logged"
6. Remove `VirraModal` from imports if it's no longer used (check — the cycle length modal still uses it, so keep the import)

- [ ] **Step 1: Remove `subModalVisible` state in `profile.tsx`**

Replace:
```typescript
  const [subModalVisible, setSubModalVisible] = useState(false);
```
With nothing (delete the line).

- [ ] **Step 2: Replace the SUBSCRIPTION card in `profile.tsx`**

Replace:
```typescript
        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>SUBSCRIPTION</VirraText>
          <Row label="STATUS" value={subLabel[status] ?? status} />
          <Row label="MANAGE" value="Settings → Subscriptions" onPress={() => setSubModalVisible(true)} />
        </VirraCard>
```

With:
```typescript
        <VirraCard style={styles.card}>
          <VirraText variant="mono" size={9} color={colors.muted} style={styles.cardLabel}>SUBSCRIPTION</VirraText>
          <Row
            label="STATUS"
            value={subLabel[status] ?? status}
            onPress={() => router.push('/(app)/subscription')}
          />
        </VirraCard>
```

- [ ] **Step 3: Update training notification sublabel in `profile.tsx`**

Replace:
```typescript
            sublabel="Daily at 9:00 am · cancels when workout logged"
```
With:
```typescript
            sublabel="Adaptive · based on your history · cancels when workout logged"
```

- [ ] **Step 4: Remove the subscription VirraModal from `profile.tsx`**

Remove lines 314–324:
```typescript
      {/* Subscription modal */}
      <VirraModal
        visible={subModalVisible}
        onClose={() => setSubModalVisible(false)}
        title="Manage Subscription"
      >
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.7)">
          Open Settings → Subscriptions to manage your plan.
        </VirraText>
        <VirraButton label="OK" variant="ghost" onPress={() => setSubModalVisible(false)} />
      </VirraModal>
```

- [ ] **Step 5: Register `subscription` screen in `_layout.tsx` Stack**

In `app/(app)/_layout.tsx`, inside the `<Stack>` (after the last `<Stack.Screen />`, before the closing `</Stack>`), add:

```tsx
      <Stack.Screen name="subscription"   options={{ presentation: 'card'  }} />
```

- [ ] **Step 6: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
npx jest --no-coverage 2>&1 | tail -8
```

Expected: no TS errors; tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && git add "app/(app)/(tabs)/profile.tsx" "app/(app)/_layout.tsx"
git commit -m "feat: subscription screen — replace modal with dedicated screen; adaptive training reminder sublabel"
```

---

## Verification (end-to-end)

1. **Training notification (adaptive):** Fresh install + log 5+ activities at 7am → next foreground triggers `scheduleDailyReminders` → training reminder schedules at 7am (not 9am). Check `AsyncStorage` for key `notif_training_<date>`.
2. **Rest-day gate:** Remove all planned sessions for today → foreground the app → no training notification scheduled (verify by checking AsyncStorage key is absent).
3. **Trial detection:** User in trial → `status === 'trial'` in subscription store → Profile shows "Free trial active" → tap STATUS row → navigates to Subscription screen with trial badge + days remaining + Upgrade CTA.
4. **Trial reminders:** Trial user → `scheduleTrialReminders` is called → check scheduled notifications in Expo dev tools for the day-3 and day-1 notifications.
5. **Subscription screen — active user:** `status === 'active'` → green ACTIVE badge, no countdown, no upgrade CTA, Manage Subscription + Restore Purchases rows visible.
6. **Manage Subscription:** Tap → opens App Store subscriptions URL in Safari.
7. **Restore Purchases:** Tap → RC `restorePurchases()` → on success: store sets `active`, alert shown.
8. **Notification preferences — training sublabel:** Profile → NOTIFICATIONS card → training row shows "Adaptive · based on your history · cancels when workout logged".

---

## Self-Review

**Spec coverage:**
- ✅ `inferTrainingHour` — mode from last 30 activities (Task 1)
- ✅ `scheduleDailyReminders(userId)` — planned-session gate + adaptive hour (Task 1)
- ✅ Trial reminder wiring — `scheduleTrialReminders` called when trial confirmed (Task 2)
- ✅ Trial status detection via `getEntitlementInfo()` (Task 2)
- ✅ Subscription management screen — status badge, countdown, upgrade CTA, manage link, restore (Task 3)
- ✅ Profile subscription row → navigates to screen (Task 4)
- ✅ Stack registration (Task 4)
- ✅ Deliverable 2 (notification preference toggles) — already complete, no task needed

**Placeholder scan:** None. All steps contain full code.

**Type consistency:**
- `scheduleDailyReminders(userId: string)` — Task 1 defines it, Task 2 and 4 update all call sites ✓
- `getEntitlementInfo()` — Task 2 adds to `revenuecat.ts`, Task 3 imports it ✓
- `useSubscriptionStore().trialEnd: Date | null` — Task 3 reads it correctly ✓
- `setStatus('trial', trialEnd)` — subscription store accepts `(status, trialEnd?: Date)`, Task 2 passes `Date | undefined` ✓

**Edge cases covered:**
- No activity history → `inferTrainingHour` returns 9 (fallback) ✓
- Rest day (no planned sessions) → training notification not scheduled ✓
- `getEntitlementInfo` throws → returns safe defaults (no trial wired, no crash) ✓
- `managementURL` null → fallback URL used in subscription screen ✓
- Trial expired before user opens app → `daysRemaining = 0`, badge still shown ✓
