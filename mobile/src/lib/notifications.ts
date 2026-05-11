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

async function scheduleOnce(
  key:     string,
  title:   string,
  body:    string,
  trigger: Notifications.NotificationTriggerInput,
): Promise<void> {
  const existing = await loadId(key);
  if (existing) return; // already scheduled

  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger,
  });
  await saveId(key, id);
}

function todayAt(hour: number, minute = 0): Notifications.DateTriggerInput {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1); // already past → tomorrow
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d };
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
  const [date, prefs] = [today(), await loadNotificationPreferences()];

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
      await scheduleOnce(
        storageKey('training', date),
        'Time to move',
        "Today's session is ready. Tap to start.",
        todayAt(hour),
      );
    }
  }

  if (prefs.breakfast) {
    await scheduleOnce(
      storageKey('nutrition_breakfast', date),
      'Fuel right from the start',
      'Log your breakfast to hit your morning targets.',
      todayAt(8),
    );
  }

  if (prefs.lunch) {
    await scheduleOnce(
      storageKey('nutrition_lunch', date),
      'Keep the momentum going',
      'Log your lunch — your body is mid-adaptation right now.',
      todayAt(12, 30),
    );
  }

  if (prefs.dinner) {
    await scheduleOnce(
      storageKey('nutrition_dinner', date),
      'End the day strong',
      'Log your dinner and close out your nutrition.',
      todayAt(19),
    );
  }

  if (prefs.checkin) {
    await scheduleOnce(
      storageKey('checkin', date),
      'A minute to check in',
      'How are you feeling today? It only takes 30 seconds.',
      todayAt(20),
    );
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

/** Cancel today's training reminder — call when any workout is logged. */
export async function cancelTrainingReminderToday(): Promise<void> {
  await cancelStored(storageKey('training', today()));
}

/** Cancel today's meal-slot reminder — call when a food entry is added. */
export async function cancelNutritionReminderForMeal(
  meal: 'breakfast' | 'lunch' | 'dinner',
): Promise<void> {
  await cancelStored(storageKey(`nutrition_${meal}`, today()));
}

/** Cancel today's check-in reminder — call after check-in is submitted. */
export async function cancelCheckinReminderToday(): Promise<void> {
  await cancelStored(storageKey('checkin', today()));
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
