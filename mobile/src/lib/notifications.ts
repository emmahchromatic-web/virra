import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Preference types ────────────────────────────────────────────────────────

export type NotifSlot = 'training' | 'breakfast' | 'lunch' | 'dinner' | 'checkin' | 'weeklyPlan';

export interface NotificationPreferences {
  training:    boolean;
  breakfast:   boolean;
  lunch:       boolean;
  dinner:      boolean;
  checkin:     boolean;
  weeklyPlan:  boolean;
}

const PREF_KEY = 'notif_prefs_v1';

const DEFAULT_PREFS: NotificationPreferences = {
  training:   true,
  breakfast:  true,
  lunch:      true,
  dinner:     true,
  checkin:    true,
  weeklyPlan: true,
};

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setNotificationPreference(
  slot:    NotifSlot,
  enabled: boolean,
): Promise<void> {
  const prefs = await loadNotificationPreferences();
  prefs[slot] = enabled;
  await AsyncStorage.setItem(PREF_KEY, JSON.stringify(prefs));

  // Cancel the scheduled notification immediately when disabling
  if (!enabled) {
    const date = today();
    switch (slot) {
      case 'training':  await cancelStored(storageKey('training',           date)); break;
      case 'breakfast': await cancelStored(storageKey('nutrition_breakfast', date)); break;
      case 'lunch':     await cancelStored(storageKey('nutrition_lunch',     date)); break;
      case 'dinner':    await cancelStored(storageKey('nutrition_dinner',    date)); break;
      case 'checkin':    await cancelStored(storageKey('checkin',      date)); break;
      case 'weeklyPlan': await cancelStored('notif_weekly_plan');              break;
    }
  }
}

// ─── Key helpers ────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function storageKey(type: string, qualifier?: string): string {
  return qualifier
    ? `notif_${type}_${qualifier}`
    : `notif_${type}_${today()}`;
}

async function loadId(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

async function saveId(key: string, id: string): Promise<void> {
  await AsyncStorage.setItem(key, id);
}

async function cancelStored(key: string): Promise<void> {
  const id = await loadId(key);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => null);
    await AsyncStorage.removeItem(key);
  }
}

// ─── Scheduling helpers ─────────────────────────────────────────────────────

const _scheduling = new Set<string>();

async function scheduleOnce(
  key:     string,
  title:   string,
  body:    string,
  trigger: Notifications.NotificationTriggerInput,
): Promise<void> {
  if (_scheduling.has(key)) return;
  _scheduling.add(key);
  try {
    const existing = await loadId(key);
    if (existing) {
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      if (pending.some((n) => n.identifier === existing)) return;
      await AsyncStorage.removeItem(key);
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger,
    });
    await saveId(key, id);
  } finally {
    _scheduling.delete(key);
  }
}

// Returns a DateTrigger for today at hour:minute, or null if that moment has
// already passed. We deliberately do NOT bump to tomorrow — daily reminders
// are re-scheduled by the app on launch / foreground, so tomorrow's reminder
// will be created freshly tomorrow. Bumping would also cause duplicates:
// the storage key is per-day, so a "today" key holding a "tomorrow" trigger
// would never be matched the next day and a second notif would be scheduled.
function todayAt(hour: number, minute = 0): Notifications.DateTriggerInput | null {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= new Date()) return null;
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d };
}

// Cancel any reminder keys for past dates that the old "bump to tomorrow"
// logic may have left behind. Idempotent and cheap to run on every foreground.
async function sweepStaleReminderKeys(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const todayISO = today();
    const stale = allKeys.filter((k) => {
      // Match notif_<slot>_YYYY-MM-DD where the date is strictly before today.
      const m = k.match(/^notif_(?:training|nutrition_(?:breakfast|lunch|dinner)|checkin)_(\d{4}-\d{2}-\d{2})$/);
      return m !== null && m[1] < todayISO;
    });
    for (const key of stale) await cancelStored(key);
  } catch { /* best-effort cleanup */ }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Schedule (or cancel) the Sunday 18:00 weekly planning reminder. Idempotent. */
export async function scheduleWeeklyPlanReminder(): Promise<void> {
  const prefs = await loadNotificationPreferences();
  const key   = 'notif_weekly_plan';

  if (!prefs.weeklyPlan) {
    await cancelStored(key);
    return;
  }

  const existing = await loadId(key);
  if (existing) return; // already scheduled

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Plan your week',
      body:  "Your training week starts tomorrow — tap to review and adjust your sessions.",
      sound: true,
      data:  { screen: 'week-ahead' },
    },
    trigger: {
      type:    Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // 1 = Sunday (iOS EKWeekday convention)
      hour:    18,
      minute:  0,
    },
  });
  await saveId(key, id);
}

/** Call on every app foreground — idempotent, respects per-slot preferences. */
export async function scheduleDailyReminders(userId: string): Promise<void> {
  await sweepStaleReminderKeys();
  const [date, prefs] = [today(), await loadNotificationPreferences()];

  async function maybeSchedule(
    slot:    string,
    title:   string,
    body:    string,
    trigger: Notifications.DateTriggerInput | null,
  ): Promise<void> {
    if (!trigger) return;
    await scheduleOnce(storageKey(slot, date), title, body, trigger);
  }

  // ── Training ────────────────────────────────────────────────────────────────
  if (prefs.training) {
    const { data: sessions, error: sessionsError } = await supabase
      .from('planned_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('scheduled_date', date)
      .eq('status', 'planned')
      .limit(1);

    const hasSession = sessionsError ? true : (sessions && sessions.length > 0);
    if (hasSession) {
      const hour = sessionsError ? 9 : await inferTrainingHour(userId);
      await maybeSchedule(
        'training',
        'Time to move',
        "Today's session is ready. Tap to start.",
        todayAt(hour),
      );
    }
  }

  // ── Nutrition ───────────────────────────────────────────────────────────────
  // Check which meal slots have already been logged today so we don't
  // reschedule a reminder the user already actioned.
  const loggedMeals = new Set<string>();
  if (prefs.breakfast || prefs.lunch || prefs.dinner) {
    const { data: log } = await supabase
      .from('nutrition_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('recorded_on', date)
      .maybeSingle();
    if (log) {
      const { data: entries } = await supabase
        .from('food_entries')
        .select('meal_type')
        .eq('log_id', log.id);
      if (entries) for (const e of entries) loggedMeals.add(e.meal_type);
    }
  }

  if (prefs.breakfast && !loggedMeals.has('breakfast')) {
    await maybeSchedule(
      'nutrition_breakfast',
      'Fuel right from the start',
      'Log your breakfast to hit your morning targets.',
      todayAt(8),
    );
  }

  if (prefs.lunch && !loggedMeals.has('lunch')) {
    await maybeSchedule(
      'nutrition_lunch',
      'Keep the momentum going',
      'Log your lunch — your body is mid-adaptation right now.',
      todayAt(12, 30),
    );
  }

  if (prefs.dinner && !loggedMeals.has('dinner')) {
    await maybeSchedule(
      'nutrition_dinner',
      'End the day strong',
      'Log your dinner and close out your nutrition.',
      todayAt(19),
    );
  }

  // ── Check-in ────────────────────────────────────────────────────────────────
  if (prefs.checkin) {
    const { data: checkin } = await supabase
      .from('symptom_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('recorded_on', date)
      .limit(1);
    if (!checkin || checkin.length === 0) {
      await maybeSchedule(
        'checkin',
        'A minute to check in',
        'How are you feeling today? It only takes 30 seconds.',
        todayAt(20),
      );
    }
  }
}

/** Schedule trial-end reminders on days 11 and 13 before `trialEnd`. */
export async function scheduleTrialReminders(trialEnd: Date): Promise<void> {
  const day11 = new Date(trialEnd.getTime() - 3 * 86400000);
  const day13 = new Date(trialEnd.getTime() - 1 * 86400000);
  day11.setHours(10, 0, 0, 0);
  day13.setHours(10, 0, 0, 0);

  if (day11 > new Date()) {
    await scheduleOnce(
      storageKey('trial', '11'),
      'Your free trial ends in 3 days',
      'Subscribe now to keep your training and nutrition data.',
      { type: Notifications.SchedulableTriggerInputTypes.DATE, date: day11 },
    );
  }

  if (day13 > new Date()) {
    await scheduleOnce(
      storageKey('trial', '13'),
      'Last day of your free trial tomorrow',
      "Subscribe to keep everything you've built.",
      { type: Notifications.SchedulableTriggerInputTypes.DATE, date: day13 },
    );
  }
}

// Cancel today's key plus any stale per-day keys for this slot that may still
// have a pending notification scheduled to fire today (legacy of the
// "bump to tomorrow" logic). Safe to call from any completion path.
async function cancelTodayAndStale(slot: string): Promise<void> {
  const todayISO = today();
  await cancelStored(storageKey(slot, todayISO));
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefix = `notif_${slot}_`;
    const stale = allKeys.filter((k) => {
      if (!k.startsWith(prefix)) return false;
      const datePart = k.slice(prefix.length);
      return /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < todayISO;
    });
    for (const key of stale) await cancelStored(key);
  } catch { /* best-effort cleanup */ }
}

/** Cancel today's training reminder — call when any workout is logged. */
export async function cancelTrainingReminderToday(): Promise<void> {
  await cancelTodayAndStale('training');
}

/** Cancel today's meal-slot reminder — call when a food entry is added. */
export async function cancelNutritionReminderForMeal(
  meal: 'breakfast' | 'lunch' | 'dinner',
): Promise<void> {
  await cancelTodayAndStale(`nutrition_${meal}`);
}

/** Cancel today's check-in reminder — call after check-in is submitted. */
export async function cancelCheckinReminderToday(): Promise<void> {
  await cancelTodayAndStale('checkin');
}

/** Cancel both trial reminders — call when subscription becomes active. */
export async function cancelTrialReminders(): Promise<void> {
  await cancelStored(storageKey('trial', '11'));
  await cancelStored(storageKey('trial', '13'));
}

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
