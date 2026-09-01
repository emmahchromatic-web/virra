import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-user data cached in AsyncStorage. On sign-out these must be cleared so a
// different account signing in on the same device can't see the previous user's
// data (training schedule, readiness, Health anchors, notifications).
//
// Matched by prefix so new keys in these families are covered automatically:
//   readiness_* : readiness store + baseline/sleep-debt/backfill
//   hk_*        : Health weight/workout anchors + diagnostics + reimport flag
//   notif_*     : notification inbox, prefs, and per-date scheduled markers
// Plus explicit keys that don't share a safe prefix.
//
// Deliberately NOT cleared (device-level, not user data):
//   virra:unit_system       : display preference
//   permissions_granted_v1  : mirrors OS permission state, which persists
//   sb-*-auth-token         : handled by the auth store's own sign-out sweep
//
// virra:pending_completions:v1:<userId> holds workouts finished with no signal
// and not yet synced. Keyed by user id, so the next account on this phone must
// never inherit them. Card 253.
export const USER_CACHE_PREFIXES = ['readiness_', 'hk_', 'notif_', 'virra:pending_completions:'];
const USER_CACHE_KEYS = ['virra:sessions:v1'];

export async function clearUserScopedCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) => USER_CACHE_KEYS.includes(k) || USER_CACHE_PREFIXES.some((p) => k.startsWith(p)),
    );
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // Best effort: stale cache is a minor, self-healing issue (data refreshes
    // on next load) and must never block sign-out.
  }
}
