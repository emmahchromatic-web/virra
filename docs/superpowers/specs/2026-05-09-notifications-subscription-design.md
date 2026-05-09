# Notifications Intelligence + Subscription Management — Design Spec

## Context

The notification infrastructure is already substantially built: `scheduleDailyReminders()` fires on every app foreground, all cancellation calls are wired at action completion sites (run, manual-activity, food-search, checkin), and trial reminder cancellation fires when subscription activates. Three gaps remain: training reminders are dumb (fixed 9am, no rest-day awareness), `scheduleTrialReminders()` is never called, and there is no UI for preferences or subscription status.

---

## Scope

Three deliverables:

1. **Notification intelligence** — adaptive training reminder timing + planned-session gate + trial reminder wiring
2. **Notification preferences UI** — toggles in Profile screen
3. **Subscription management screen** — status, countdown, upgrade CTA, manage link, restore

---

## Deliverable 1: Notification Intelligence

### 1a. Adaptive training reminder timing

Add `inferTrainingHour(userId: string): Promise<number>` to `src/lib/notifications.ts`.

- Queries last 30 `activities` for the user ordered by `started_at` desc
- Extracts the local hour from each `started_at`
- Returns the mode hour (most frequent); falls back to `9` if no history
- Called once inside `scheduleDailyReminders()` before scheduling the training slot

The training reminder fires at `mode_hour - 0` (on the hour). If the inferred time is already past today, `todayAt()` already handles this by shifting to tomorrow — no change needed there.

### 1b. Planned-session gate

`scheduleDailyReminders()` receives a `userId: string` parameter (previously no params). Before scheduling the training slot, it queries `planned_sessions` for today's date and the user:

```
.eq('user_id', userId)
.eq('scheduled_date', today())
.neq('status', 'moved')
.in('status', ['planned'])
```

If zero rows: skip the training reminder entirely (rest day).
If one or more rows: schedule at the inferred hour.

All other slots (breakfast, lunch, dinner, check-in) are unaffected.

**Call site change**: `(app)/_layout.tsx` currently calls `scheduleDailyReminders()` with no args. Update to pass `session.user.id`.

### 1c. Trial reminder wiring

`scheduleTrialReminders(trialEnd: Date)` exists but is never called.

Wire it in `(app)/_layout.tsx` inside the subscription useEffect — after `setStatus('trial')` is confirmed, call `scheduleTrialReminders(new Date(trialEnd))`.

The subscription store already holds `trialEnd: string | null`. The wiring point is the useEffect that calls `getActiveEntitlement()` — if status resolves to trial (not active, not expired), compute `trialEnd` from the subscription store and schedule reminders.

**Exact condition**: only schedule if `trialEnd` is set AND both day-11 and day-13 dates are in the future (the `scheduleTrialReminders` function already guards this internally with `if (dayN > new Date())`).

---

## Deliverable 2: Notification Preferences UI

### Location

Profile screen (`app/(app)/(tabs)/profile.tsx` or equivalent) — add a **Notifications** `VirraCard` section below the existing Cycle Settings link row.

### Content

Five toggle rows, one per `NotifSlot`:

| Slot | Label | Subtitle |
|---|---|---|
| `training` | Training | Adaptive — based on your history |
| `breakfast` | Breakfast | 8:00 am |
| `lunch` | Lunch | 12:30 pm |
| `dinner` | Dinner | 7:00 pm |
| `checkin` | Daily check-in | 8:00 pm |

Each row: left side = `VirraText` label + subtitle, right side = React Native `Switch` (tint `colors.pulse`).

### State management

On mount: `loadNotificationPreferences()` → set local state.
On toggle: `setNotificationPreference(slot, value)` — the existing function handles AsyncStorage write and immediate cancellation when disabling.

No Supabase write needed — preferences are on-device only.

---

## Deliverable 3: Subscription Management Screen

### Route

`app/(app)/subscription.tsx` — presented as a card (same pattern as `cycle-settings.tsx`).

### Access

Profile screen: add a "Subscription" row (tappable, with chevron) that navigates to `/(app)/subscription`.

### Layout

```
┌─────────────────────────────┐
│ PLAN STATUS                 │
│                             │
│  [TRIAL]  or  [ACTIVE]      │
│  12 days remaining          │  (trial only)
│                             │
│  [Upgrade to Virra Pro →]   │  (trial only, full-width button)
├─────────────────────────────┤
│  Manage Subscription ›      │  (opens App Store)
│  Restore Purchases          │
└─────────────────────────────┘
```

### Data

On mount: call `Purchases.getCustomerInfo()` (via a local wrapper) to get:
- `managementURL: string | null` — direct link to App Store subscription management
- `latestExpirationDate: string | null` — subscription expiry (for active subscribers)

Trial end date comes from `subscriptionStore.trialEnd` (already in Zustand — no new RC call needed).
Plan status comes from `subscriptionStore.status` (`'trial' | 'active' | 'expired'`).

### Interactions

**Upgrade CTA** (trial only): `router.push('/(auth)/paywall')` — existing paywall screen.

**Manage Subscription**:
```typescript
const url = managementURL ?? 'https://apps.apple.com/account/subscriptions';
await Linking.openURL(url);
```

**Restore Purchases**: calls `restorePurchases()` from `revenuecat.ts`. On success: calls `setStatus('active')` in subscription store. Shows `Alert` on success or failure.

### Status badge colours

| Status | Colour |
|---|---|
| `trial` | `colors.dawn` (orange) |
| `active` | `colors.pulse` (lime) |
| `expired` | `colors.heat` (red) |

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/lib/notifications.ts` | Add `inferTrainingHour()`, update `scheduleDailyReminders(userId)`, add planned-session query |
| Modify | `app/(app)/_layout.tsx` | Pass `userId` to `scheduleDailyReminders`, wire `scheduleTrialReminders` on trial confirm |
| Modify | `app/(app)/(tabs)/profile.tsx` | Add Notifications toggles section + Subscription nav row |
| Create | `app/(app)/subscription.tsx` | Subscription management screen |
| Modify | `app/(app)/_layout.tsx` | Register `subscription` screen in Stack |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| No activity history | `inferTrainingHour` returns 9 (fallback) |
| Rest day (no planned session) | Training notification not scheduled; all other slots unaffected |
| `scheduleDailyReminders` called twice same day | `scheduleOnce` checks existing ID — second call is a no-op |
| `trialEnd` null in store | Skip `scheduleTrialReminders` call |
| `managementURL` null | Fall back to `https://apps.apple.com/account/subscriptions` |
| Subscription expired | Show EXPIRED badge; show Restore Purchases only (no upgrade CTA — user had a sub) |

---

## Spec Self-Review

**Placeholder scan:** None. All sections specify exact behaviour.

**Internal consistency:**
- `scheduleDailyReminders(userId)` signature change flows through to `_layout.tsx` call sites ✓
- Trial reminder wiring references `subscriptionStore.trialEnd` which already exists ✓
- Subscription screen status/colours/CTA logic is fully specified ✓
- `managementURL` fallback URL specified ✓

**Scope check:** Two independent screens (Profile additions + subscription screen) plus one lib change — tight and shippable together.

**Ambiguity resolved:**
- Training reminder fires at the mode hour exactly (not 30 min before — the existing `todayAt()` logic shifts to tomorrow if past; a 30 min lead would require `todayAt(hour, -30)` which complicates the fallback — fire on the hour instead)
- Planned-session query only checks `status = 'planned'` (not `completed`) — a completed session means the user already trained, training reminder should still have been cancelled by `cancelTrainingReminderToday()`; if not, `scheduleOnce` won't duplicate it
- Notification preferences are on-device (AsyncStorage) only — no Supabase sync needed for MVP
