# Notifications Bell + Inbox — Design

**Date:** 2026-05-17
**Author:** Paul Dickenson + Claude

## Goal

Give users a persistent record of notifications the app has fired, accessed via a bell icon next to the profile button on the Dashboard. The bell renders as an outline SF Symbol when there are no unread items and as a filled symbol when there is at least one unread item. Tapping the bell opens an inbox screen listing past notifications newest-first.

## Non-Goals

- Server-pushed notifications (none exist; all current notifications are locally scheduled via `expo-notifications`).
- Cross-device sync of the inbox.
- Per-row delete or per-row tap-to-read interactions.
- Action shortcuts inside an inbox row beyond what the OS already provides via `addNotificationResponseReceivedListener` (which routes the week-ahead notification today).
- A numeric badge on the bell — the outline/fill swap is the only state signal.

## Surfaces

### Bell button (`src/components/layout/AppHeader.tsx`)

- Added when `showProfile` is true. Sits **to the left** of the existing profile button.
- SF Symbol via `expo-symbols`:
  - Unread count `= 0` → `bell`, `tintColor = colors.pulse`
  - Unread count `> 0` → `bell.fill`, `tintColor = colors.pulse`
- Same size (`24`) and padding pattern as the profile button.
- Tap → `router.push('/(app)/notifications')`.
- Accessibility: `accessibilityLabel = "Open notifications" + (unread > 0 ? ", N unread" : "")`, `accessibilityRole = "button"`.
- Re-renders on store changes by subscribing to `useNotificationsStore((s) => s.unreadCount)`.

### Notifications screen (`app/(app)/notifications.tsx`, card presentation)

Routed alongside other modal-ish screens declared in `app/(app)/_layout.tsx`. Registered as `<Stack.Screen name="notifications" options={{ presentation: 'card' }} />`.

Layout, top to bottom:

1. **AppHeader** with `title="NOTIFICATIONS"` and no `showProfile`. The header component renders title-only in this mode (uses the existing display-text branch in `AppHeader`).
2. **Overflow action row** beneath the header — a single right-aligned text button "CLEAR ALL" (Space Mono, breath-coloured 70%). Hidden when the list is empty. Tap shows a native `Alert.alert` confirm ("Clear all notifications?", "Cancel" / "Clear"). Confirm → `clear()`.
3. **List** rendered via `FlatList`:
   - Newest-first by `deliveredAt`.
   - Each row (`NotificationRow`) is `Pressable` for visual feedback but does nothing on tap (the OS-level response listener already handles deep-link routing when the user taps the OS notification itself).
   - Row layout:
     - Left column (24 px wide): pulse-coloured 8-px dot vertically centred when `readAt === null`, otherwise empty space (keeps alignment consistent).
     - Middle column: title (Inter 600, 15 pt, breath), body (Inter 400, 13 pt, breath 70%, `numberOfLines={3}`).
     - Right column: relative timestamp (Space Mono, 11 pt, breath 50%). Formatted with the same helper that produces values like "JUST NOW", "12 MIN AGO", "2 HR AGO", "YESTERDAY", "MAR 14".
   - Row divider: 1-px hairline `colors.mist` at the bottom.
4. **Empty state**: when `items.length === 0`, render a Fraunces italic line centred mid-screen — "No notifications yet." — in breath 60%.

**Mark-as-read trigger:** when the screen mounts (`useEffect` with empty deps), call `markAllRead()`. The unread dots that were visible on entry remain visible for the lifetime of this screen instance because the snapshot of `items` is taken at mount; we render against a frozen `useMemo` of the list-at-mount so the user can see which entries were new during this session. On unmount the store is already updated, so when they return to Dashboard the bell is outline. (Implementation note: we keep this snapshot in a `useRef` populated on first render — see the implementation plan for the exact mechanism.)

## Store — `src/store/notifications.ts`

```ts
interface NotificationItem {
  id:            string;       // expo-notifications request identifier (or our generated UUID)
  title:         string;
  body:          string;
  data:          Record<string, unknown> | null;
  deliveredAt:   string;       // ISO timestamp at the moment of `add()`
  readAt:        string | null;
}

interface NotificationsState {
  items:         NotificationItem[];
  unreadCount:   number;       // derived; recomputed on every mutation
  hydrated:      boolean;
  hydrate:       () => Promise<void>;
  add:           (input: Omit<NotificationItem, 'deliveredAt' | 'readAt'>) => Promise<void>;
  markAllRead:   () => Promise<void>;
  clear:         () => Promise<void>;
}
```

**Persistence:**
- AsyncStorage key: `notif_inbox_v1`.
- On every mutation (`add`, `markAllRead`, `clear`) the full state is serialised and written. Volume is tiny (cap of 50 items × ~200 bytes) so we do not need to batch.
- `hydrate()` reads the key once on app launch from `_layout.tsx`.

**Cap and dedup:**
- `add()` first checks if an entry with the same `id` already exists; if so it is a no-op (this is how we dedupe between the receive listener and the `getPresentedNotificationsAsync` reconciliation).
- After insertion, if `items.length > 50`, the oldest entries are sliced off.

**Derived `unreadCount`:** computed inside the setter functions and stored on state so subscribers can select it directly without recomputing on every render.

## Capture pipeline

All wiring lives in `app/(app)/_layout.tsx` so that capture only runs while the user is signed in.

### 1. Receive listener
```ts
const receiveSub = Notifications.addNotificationReceivedListener((event) => {
  const req = event.request;
  useNotificationsStore.getState().add({
    id:    req.identifier,
    title: req.content.title ?? '',
    body:  req.content.body  ?? '',
    data:  (req.content.data as Record<string, unknown>) ?? null,
  });
});
```
This handles delivery while the app is in the foreground or recently backgrounded.

### 2. Foreground reconciliation
On mount and on every `AppState` → `active` transition (we already have an `AppState` listener at lines 100–108 of `_layout.tsx`):

```ts
const presented = await Notifications.getPresentedNotificationsAsync();
for (const n of presented) {
  useNotificationsStore.getState().add({
    id:    n.request.identifier,
    title: n.request.content.title ?? '',
    body:  n.request.content.body  ?? '',
    data:  (n.request.content.data as Record<string, unknown>) ?? null,
  });
}
```
This backfills notifications that were delivered while the app was killed. `add()`'s dedup ensures the same notification surfaced via both the listener and `getPresentedNotificationsAsync` is recorded only once.

### 3. Hydrate
Before the listener and the reconciliation, call `useNotificationsStore.getState().hydrate()` so the inbox is populated from disk before the first AppHeader render. Hydration runs once per session.

### 4. Cleanup
The existing return cleanup at line 116 is extended:

```ts
return () => {
  sub.remove();
  notifSub.remove();
  receiveSub.remove();
};
```

## Edge cases

- **Notification without a body.** Some scheduled notifications may lack a body (the codebase always supplies one today, but be defensive). The row renders with the title only and reserves no vertical space for an empty body line.
- **Notification with non-string title/body.** Treat as empty string. Strict-narrow at the `add()` boundary.
- **Listener fires while store is hydrating.** `add()` is async and reads `getState().items`; calls that interleave hydration will race. Mitigation: `hydrate()` is awaited at the top of the `useEffect` before listeners are installed and before reconciliation runs.
- **OS clears its presented tray.** Once the OS clears the notification tray, `getPresentedNotificationsAsync` returns nothing for those entries — but they are already in our inbox by then because the receive listener fired earlier. Inbox is the source of truth for history; the OS tray is just the OS surface.
- **User toggles a notification preference off.** The user's existing entries in the inbox are unaffected — disabling a slot only stops *future* deliveries. Same for canceling already-scheduled notifications via `cancelStored`.
- **First launch with no entries.** Empty state renders. Bell is outline.

## Visual / brand

- Bell symbol: pulse green (`colors.pulse = #D4FF26`). Same as the profile icon for visual consistency in the header strip.
- Unread dot: 8 px circle, `colors.pulse`.
- Row hairline: `colors.mist`.
- Timestamp: Space Mono uppercase.
- Empty-state line: Fraunces italic, breath 60%.

## File touch list

**New:**
- `src/store/notifications.ts`
- `src/components/layout/NotificationsBell.tsx` (small wrapper for the bell button)
- `src/lib/relativeTime.ts` (timestamp formatter — only if no existing helper)
- `app/(app)/notifications.tsx`

**Modified:**
- `src/components/layout/AppHeader.tsx` — render `<NotificationsBell />` to the left of the profile button when `showProfile` is true.
- `app/(app)/_layout.tsx` — hydrate store, install receive listener, run reconciliation on mount and on AppState→active, register `notifications` Stack screen.

No schema changes. No new packages (`expo-notifications`, `expo-symbols`, `@react-native-async-storage/async-storage`, and `zustand` are already installed).

## Testing notes

This is a UI-only feature against existing APIs. Verification, in priority order:

1. **Capture path — foreground.** With the app open, trigger any locally scheduled notification (or schedule a 2-second one from a debug button). The inbox appears with bell turning to `bell.fill`.
2. **Capture path — backgrounded.** Background the app, wait for a scheduled training reminder, foreground. Bell is filled; inbox shows the entry.
3. **Capture path — killed.** Force-kill the app, wait for a scheduled notification, reopen. The reconciliation step picks it up if it is still in the iOS notification tray; otherwise it is not captured (acceptable — this is the OS's behaviour).
4. **Mark-all-read.** Open the inbox, return to Dashboard — bell is outline. Reopen the inbox — entries still display in their list positions without dots.
5. **Clear all.** Trigger from the inbox overflow — list goes empty, bell stays outline, AsyncStorage key reflects empty list.
6. **Persistence.** Add a few entries, force-quit, relaunch. Inbox populated from AsyncStorage. Bell reflects unread count.
7. **Cap.** Trigger 51 notifications. Oldest is sliced off; inbox holds exactly 50.

No automated tests are introduced; the existing codebase relies on manual verification for UI features and this feature follows the same pattern.
