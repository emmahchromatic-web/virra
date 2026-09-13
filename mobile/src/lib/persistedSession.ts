import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

/**
 * The session supabase-js has already written to storage, read directly.
 *
 * Card 283. `supabase.auth.getSession()` can reject or hang when the stored JWT
 * needs refreshing and there is no network, and the root layout waited on it
 * with no catch and no timeout: the splash never hid and the app never opened.
 *
 * The obvious fallback, treating that failure as "no session", is wrong. It
 * sends a signed-in user to the login screen the moment she walks into a gym,
 * which is worse than the bug it fixes. What we actually know offline is what
 * supabase-js wrote down last time it succeeded, so read that.
 *
 * The token may well be expired. That is fine and deliberate: it still tells us
 * WHO is signed in, which is all the router needs, and supabase-js refreshes it
 * on its own once there is signal. Screens that need the network fail on their
 * own terms rather than being pre-empted by a login screen.
 */
export async function readPersistedSession(): Promise<Session | null> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Same shape signOut sweeps: sb-<project-ref>-auth-token.
    const key  = keys.find((k) => k.startsWith('sb-') && k.includes('-auth-token'));
    if (!key) return null;

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    // supabase-js has stored this under two shapes across versions: the session
    // itself, and { currentSession }. Accept either rather than depending on
    // which version happens to be installed.
    const candidate = (parsed as { currentSession?: unknown })?.currentSession ?? parsed;
    const session   = candidate as Session | null;

    // A session with no user is no use to the router, and is how a half-written
    // or cleared key presents.
    return session?.user?.id ? session : null;
  } catch {
    // Unparseable or unreadable storage must not stop the app opening. That is
    // the entire point of this function.
    return null;
  }
}
