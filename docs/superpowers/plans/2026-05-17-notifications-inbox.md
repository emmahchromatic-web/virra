# Notifications Bell + Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a notifications bell to `AppHeader` (left of the profile button) that swaps between outline (`bell`) and solid (`bell.fill`) based on unread count, and a `/(app)/notifications` screen showing past notifications newest-first.

**Architecture:** A local-only Zustand store persisted to AsyncStorage captures every notification the device delivers, via `addNotificationReceivedListener` plus `getPresentedNotificationsAsync` reconciliation on app resume. The bell subscribes to `unreadCount`; the inbox screen calls `markAllRead()` on mount.

**Tech Stack:** React Native + expo-router, expo-notifications, expo-symbols, Zustand, AsyncStorage, TypeScript.

**Testing approach:** The Virra codebase has no automated tests for UI features (per spec). Verification is manual via the Expo dev server. Tasks include a TypeScript-compile check as the automated correctness gate, plus an end-of-plan manual verification pass.

**Spec:** `docs/superpowers/specs/2026-05-17-notifications-inbox-design.md`

---

### Task 1: Relative-time helper

**Files:**
- Create: `mobile/src/lib/relativeTime.ts`

- [ ] **Step 1: Write the helper**

Create `mobile/src/lib/relativeTime.ts`:

```ts
// Returns a Space-Mono-friendly uppercase relative time string for the inbox
// timestamps. Examples: "JUST NOW", "12 MIN AGO", "3 HR AGO", "YESTERDAY 14:30",
// "MAR 14".
//
// `now` parameter is injectable for testability and for keeping the function pure.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then    = new Date(iso);
  const diffMs  = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);

  if (diffMs < 0)                            return 'JUST NOW';
  if (diffMin < 1)                           return 'JUST NOW';
  if (diffMin < 60)                          return `${diffMin} MIN AGO`;
  if (diffHr  < 24 && startOfDay(then) === startOfDay(now))
                                             return `${diffHr} HR AGO`;

  const dayDiff = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (dayDiff === 1) {
    return `YESTERDAY ${pad(then.getHours())}:${pad(then.getMinutes())}`;
  }

  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
```

- [ ] **Step 2: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors (any pre-existing errors unrelated to this file are unchanged).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/relativeTime.ts
git commit -m "feat(notifications): add relativeTime helper for inbox timestamps"
```

---

### Task 2: Notifications Zustand store

**Files:**
- Create: `mobile/src/store/notifications.ts`

- [ ] **Step 1: Write the store**

Create `mobile/src/store/notifications.ts`:

```ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'notif_inbox_v1';
const MAX_ITEMS   = 50;

export interface NotificationItem {
  id:          string;
  title:       string;
  body:        string;
  data:        Record<string, unknown> | null;
  deliveredAt: string;       // ISO timestamp
  readAt:      string | null;
}

interface NotificationsState {
  items:       NotificationItem[];
  unreadCount: number;
  hydrated:    boolean;
  hydrate:     () => Promise<void>;
  add:         (input: { id: string; title: string; body: string; data?: Record<string, unknown> | null }) => Promise<void>;
  markAllRead: () => Promise<void>;
  clear:       () => Promise<void>;
}

function computeUnread(items: NotificationItem[]): number {
  return items.reduce((n, it) => (it.readAt === null ? n + 1 : n), 0);
}

async function persist(items: NotificationItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items:       [],
  unreadCount: 0,
  hydrated:    false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items: NotificationItem[] = raw ? JSON.parse(raw) : [];
      set({ items, unreadCount: computeUnread(items), hydrated: true });
    } catch {
      set({ items: [], unreadCount: 0, hydrated: true });
    }
  },

  add: async ({ id, title, body, data }) => {
    const safeId    = typeof id    === 'string' && id.length    > 0 ? id    : `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeTitle = typeof title === 'string' ? title : '';
    const safeBody  = typeof body  === 'string' ? body  : '';

    const existing = get().items;
    if (existing.some((it) => it.id === safeId)) return;

    const entry: NotificationItem = {
      id:          safeId,
      title:       safeTitle,
      body:        safeBody,
      data:        data ?? null,
      deliveredAt: new Date().toISOString(),
      readAt:      null,
    };

    const next = [entry, ...existing].slice(0, MAX_ITEMS);
    set({ items: next, unreadCount: computeUnread(next) });
    await persist(next);
  },

  markAllRead: async () => {
    const nowIso = new Date().toISOString();
    const next   = get().items.map((it) => (it.readAt === null ? { ...it, readAt: nowIso } : it));
    set({ items: next, unreadCount: 0 });
    await persist(next);
  },

  clear: async () => {
    set({ items: [], unreadCount: 0 });
    await persist([]);
  },
}));
```

- [ ] **Step 2: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/notifications.ts
git commit -m "feat(notifications): add Zustand inbox store with AsyncStorage persistence"
```

---

### Task 3: NotificationsBell component

**Files:**
- Create: `mobile/src/components/layout/NotificationsBell.tsx`

- [ ] **Step 1: Write the bell button**

Create `mobile/src/components/layout/NotificationsBell.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { useNotificationsStore } from '@/store/notifications';

export function NotificationsBell() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const hasUnread   = unreadCount > 0;

  return (
    <Pressable
      onPress={() => router.push('/(app)/notifications' as any)}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? `Open notifications, ${unreadCount} unread` : 'Open notifications'}
    >
      <SymbolView
        name={hasUnread ? 'bell.fill' : 'bell'}
        size={24}
        tintColor={colors.pulse}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: spacing.sm },
});
```

- [ ] **Step 2: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/layout/NotificationsBell.tsx
git commit -m "feat(notifications): add NotificationsBell header button"
```

---

### Task 4: Wire bell into AppHeader

**Files:**
- Modify: `mobile/src/components/layout/AppHeader.tsx`

- [ ] **Step 1: Replace the whole file**

The current file places the profile button with `marginLeft: 'auto'`. We add the bell to the left of the profile button by introducing a right-side row container so the two icons sit together at the right edge.

Replace the entire contents of `mobile/src/components/layout/AppHeader.tsx`:

```tsx
import React from 'react';
import { View, Pressable, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { NotificationsBell } from '@/components/layout/NotificationsBell';

interface AppHeaderProps {
  title:        string;
  showProfile?: boolean;
}

export function AppHeader({ title, showProfile }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      {title === 'VIRRA' ? (
        <Image source={require('../../../assets/ViRRA.png')} style={styles.logo} />
      ) : (
        <VirraText variant="display" size={24} color={colors.pulse}>
          {title}
        </VirraText>
      )}
      {showProfile && (
        <View style={styles.actions}>
          <NotificationsBell />
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/profile')}
            style={styles.profileBtn}
            accessibilityLabel="Open profile"
            accessibilityRole="button"
          >
            <SymbolView name="person.circle" size={24} tintColor={colors.pulse} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.mile },
  logo:       { width: 72, height: 27, resizeMode: 'contain' },
  actions:    { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  profileBtn: { padding: spacing.sm },
});
```

- [ ] **Step 2: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/layout/AppHeader.tsx
git commit -m "feat(notifications): render bell to left of profile in AppHeader"
```

---

### Task 5: Notifications screen

**Files:**
- Create: `mobile/app/(app)/notifications.tsx`

- [ ] **Step 1: Write the screen**

Create `mobile/app/(app)/notifications.tsx`:

```tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { colors, fonts, spacing } from '@/constants/theme';
import { useNotificationsStore, NotificationItem } from '@/store/notifications';
import { formatRelativeTime } from '@/lib/relativeTime';

function Row({ item, showUnreadDot }: { item: NotificationItem; showUnreadDot: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.dotCol}>
        {showUnreadDot && <View style={styles.dot} />}
      </View>
      <View style={styles.body}>
        <VirraText variant="bodyMedium" color={colors.breath}>{item.title || ' '}</VirraText>
        {item.body.length > 0 && (
          <VirraText variant="body" color={colors.muted} numberOfLines={3} style={styles.bodyText}>
            {item.body}
          </VirraText>
        )}
      </View>
      <View style={styles.tsCol}>
        <VirraText variant="mono" color={colors.muted}>{formatRelativeTime(item.deliveredAt)}</VirraText>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const items       = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clear       = useNotificationsStore((s) => s.clear);

  // Freeze a snapshot of which items were unread on entry so the user can still
  // see the dots while viewing the screen. The store is updated immediately so
  // the bell flips to outline.
  const unreadOnMount = useRef<Set<string>>(new Set());
  useEffect(() => {
    unreadOnMount.current = new Set(items.filter((it) => it.readAt === null).map((it) => it.id));
    markAllRead();
    // We intentionally read `items` from state once on mount; do NOT add it to
    // deps or the snapshot would refresh and the dots would disappear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sort defensively in case persistence rehydrated out of order.
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt)),
    [items],
  );

  const confirmClear = () => {
    Alert.alert(
      'Clear all notifications?',
      'This removes the inbox history on this device. Notifications already delivered by the OS are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear',  style: 'destructive', onPress: () => { clear(); } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="NOTIFICATIONS" />
      {sorted.length > 0 && (
        <View style={styles.toolbar}>
          <Pressable onPress={confirmClear} accessibilityRole="button" accessibilityLabel="Clear all notifications">
            <VirraText variant="mono" color={colors.muted}>CLEAR ALL</VirraText>
          </Pressable>
        </View>
      )}
      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <VirraText variant="serif" color={colors.muted}>No notifications yet.</VirraText>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Row item={item} showUnreadDot={unreadOnMount.current.has(item.id)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.mile },
  toolbar:   { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  list:      { paddingBottom: spacing.xl },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  row:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.mist },
  dotCol:    { width: 16, alignItems: 'flex-start', paddingTop: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pulse },
  body:      { flex: 1, paddingRight: spacing.md },
  bodyText:  { marginTop: 2, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  tsCol:     { paddingTop: 4, minWidth: 64, alignItems: 'flex-end' },
});
```

- [ ] **Step 2: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/notifications.tsx
git commit -m "feat(notifications): add inbox screen with mark-all-read on open"
```

---

### Task 6: Wire capture + register route

**Files:**
- Modify: `mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Add the import**

Open `mobile/app/(app)/_layout.tsx`. Find the import block at lines 1–13. Add a new import line after the existing notifications-lib import:

```tsx
import { useNotificationsStore } from '@/store/notifications';
```

- [ ] **Step 2: Replace the foreground/HealthKit effect to install capture**

The current effect runs from line 84 to line 117. Replace it with the version below. The diff: it (a) hydrates the notifications store, (b) runs a `reconcilePresented()` helper on mount and on AppState→active, and (c) installs `addNotificationReceivedListener` and removes it in the cleanup.

Replace lines 84–117 of `mobile/app/(app)/_layout.tsx` with:

```tsx
  // Run HealthKit import on foreground — fires on mount and every app resume
  useEffect(() => {
    if (!session?.user.id) return;

    function runImport() {
      importNewWorkouts({
        userId:      session!.user.id,
        periodStart: periodStart ?? null,
        cycleLength: cycleLength ?? 28,
      });
    }

    async function reconcilePresented() {
      try {
        const presented = await Notifications.getPresentedNotificationsAsync();
        const add = useNotificationsStore.getState().add;
        for (const n of presented) {
          const c = n.request.content;
          add({
            id:    n.request.identifier,
            title: typeof c.title === 'string' ? c.title : '',
            body:  typeof c.body  === 'string' ? c.body  : '',
            data:  (c.data as Record<string, unknown> | null) ?? null,
          });
        }
      } catch {
        // getPresentedNotificationsAsync is iOS-only and best-effort; ignore failures.
      }
    }

    useNotificationsStore.getState().hydrate().then(reconcilePresented);

    runImport();
    scheduleDailyReminders(session.user.id);
    scheduleWeeklyPlanReminder();
    maybeShowWeekAhead();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        runImport();
        scheduleDailyReminders(session.user.id);
        scheduleWeeklyPlanReminder();
        maybeShowWeekAhead();
        reconcilePresented();
      }
      appState.current = next;
    });

    // Capture every delivered notification into the inbox
    const receiveSub = Notifications.addNotificationReceivedListener((event) => {
      const c = event.request.content;
      useNotificationsStore.getState().add({
        id:    event.request.identifier,
        title: typeof c.title === 'string' ? c.title : '',
        body:  typeof c.body  === 'string' ? c.body  : '',
        data:  (c.data as Record<string, unknown> | null) ?? null,
      });
    });

    // Navigate to week-ahead when tapping the weekly planning notification
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'week-ahead') router.push('/(app)/week-ahead' as any);
    });

    return () => { sub.remove(); notifSub.remove(); receiveSub.remove(); };
  }, [session?.user.id, periodStart, cycleLength]);
```

- [ ] **Step 3: Register the notifications Stack screen**

In the same file, find the `<Stack>` block starting at line 120. Add a new `<Stack.Screen>` entry after `name="settings"`:

```tsx
      <Stack.Screen name="settings"        options={{ presentation: 'card'  }} />
      <Stack.Screen name="notifications"   options={{ presentation: 'card'  }} />
```

- [ ] **Step 4: TypeScript compile check**

Run from `mobile/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(app\)/_layout.tsx
git commit -m "feat(notifications): capture deliveries into inbox + register screen"
```

---

### Task 7: Manual verification

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

From `mobile/`:

```bash
npx expo start --ios
```

Wait for the simulator to boot the app.

- [ ] **Step 2: Verify the empty state**

Sign in. On the Dashboard, confirm the bell appears to the **left** of the profile button, both pulse-coloured. Bell is the outline `bell` glyph.

Tap the bell. The Notifications screen opens. It shows the Fraunces italic line "No notifications yet." No "CLEAR ALL" toolbar is visible.

Return to Dashboard. Bell remains outline.

- [ ] **Step 3: Verify foreground capture**

In a Metro REPL or via a temporary debug button, schedule a quick notification. From the React-Native debugger console:

```js
import('expo-notifications').then(N => N.scheduleNotificationAsync({
  content: { title: 'TEST FOREGROUND', body: 'Delivered while app was open.' },
  trigger: { type: 'timeInterval', seconds: 2 } as any,
}));
```

(Alternatively, add a temporary debug button on Dashboard during testing.)

When the notification fires, the bell flips to `bell.fill`. Open the bell → the entry is at the top of the list with a pulse-coloured unread dot, the title "TEST FOREGROUND", the body, and a Space Mono "JUST NOW" timestamp. On exit, the bell flips back to outline.

- [ ] **Step 4: Verify backgrounded capture**

Background the app (swipe up to home), schedule a 10-second notification before backgrounding:

```js
import('expo-notifications').then(N => N.scheduleNotificationAsync({
  content: { title: 'TEST BACKGROUND', body: 'Delivered while backgrounded.' },
  trigger: { type: 'timeInterval', seconds: 10 } as any,
}));
```

Wait for the OS banner. Tap the app icon to foreground. Bell is `bell.fill`. The entry is in the inbox.

- [ ] **Step 5: Verify killed-app reconciliation**

Force-quit the app from the iOS app switcher. Schedule a 15-second notification first (or use a longer trigger and quit immediately after). When the OS banner appears, dismiss it to the notification centre but **do not** clear it. Relaunch the app from the home screen.

Expected: the `getPresentedNotificationsAsync` reconciliation picks the entry up; bell is `bell.fill`; entry appears in the inbox.

- [ ] **Step 6: Verify persistence**

With at least one entry in the inbox (read or unread), force-quit the app and relaunch. The inbox still shows the entry.

- [ ] **Step 7: Verify clear-all**

Open the inbox. Tap "CLEAR ALL" in the top-right toolbar. Confirm the alert. The list goes empty, the empty-state line appears, and the toolbar disappears. Return to Dashboard — bell is outline. Force-quit and relaunch — inbox is still empty.

- [ ] **Step 8: Verify cap**

(Optional, only if a quick way exists.) From the debugger console, run a loop to add 55 entries directly via the store:

```js
const s = require('@/store/notifications').useNotificationsStore.getState();
for (let i = 0; i < 55; i++) {
  await s.add({ id: `cap_test_${i}`, title: `CAP ${i}`, body: 'x' });
}
```

Open the inbox. Exactly 50 rows present, newest-first.

- [ ] **Step 9: Final commit (only if any fixes needed)**

If verification surfaced any bugs, fix them in their respective files and commit. Otherwise no final commit is needed.

---

## Self-review

**Spec coverage check:**

| Spec section                                        | Task(s)        |
| --------------------------------------------------- | -------------- |
| Bell in AppHeader (left of profile, outline/fill)   | Task 3, Task 4 |
| Notifications screen — header, list, empty state    | Task 5         |
| Mark-all-read on mount with frozen dot snapshot     | Task 5         |
| Clear-all overflow with confirm alert               | Task 5         |
| Zustand store + AsyncStorage + 50 cap + dedup       | Task 2         |
| `addNotificationReceivedListener` capture           | Task 6         |
| `getPresentedNotificationsAsync` reconciliation     | Task 6         |
| Hydrate on mount + reconcile on AppState→active     | Task 6         |
| Register `notifications` Stack screen               | Task 6         |
| Defensive typing for non-string title/body          | Task 2 (`add`), Task 6 (capture sites) |
| Existing `addNotificationResponseReceivedListener`  | Task 6 (preserved verbatim) |
| Relative-time formatter                             | Task 1         |
| No schema change                                    | Confirmed — no migration tasks |

All spec items are covered.

**Placeholder scan:** no TBD / TODO / "implement later" present. All code blocks contain full implementations.

**Type consistency:** the store exports `NotificationItem` and `useNotificationsStore`; the bell (`Task 3`), the screen (`Task 5`), and the layout (`Task 6`) all consume those same symbols. The `add` signature `{ id; title; body; data? }` matches at every call site. The `formatRelativeTime` signature matches its single call site in the screen.
