import AsyncStorage from '@react-native-async-storage/async-storage';
import { readPersistedSession } from '@/lib/persistedSession';

const KEY = 'sb-elebuieojodsjmghwjub-auth-token';
const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'user-1' } };

beforeEach(async () => { await AsyncStorage.clear(); });

/**
 * Card 283. This is the fallback that lets the app open with no signal, so the
 * cases that matter are the broken ones: it must never throw, and it must never
 * hand back something the router would read as a valid user.
 */
describe('readPersistedSession', () => {
  it('reads the session supabase-js wrote', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(SESSION));
    expect((await readPersistedSession())?.user.id).toBe('user-1');
  });

  it('accepts the { currentSession } shape too', async () => {
    // supabase-js has used both shapes across versions, and which one is on disk
    // is not something the app should depend on.
    await AsyncStorage.setItem(KEY, JSON.stringify({ currentSession: SESSION }));
    expect((await readPersistedSession())?.user.id).toBe('user-1');
  });

  it('returns null when nothing is stored', async () => {
    expect(await readPersistedSession()).toBeNull();
  });

  it('returns null rather than throwing on unparseable storage', async () => {
    await AsyncStorage.setItem(KEY, 'not json {{{');
    await expect(readPersistedSession()).resolves.toBeNull();
  });

  it('rejects a session with no user, which is how a half-cleared key presents', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ access_token: 'a' }));
    expect(await readPersistedSession()).toBeNull();
  });

  it('ignores keys that are not the supabase auth token', async () => {
    await AsyncStorage.setItem('virra:unit_system', JSON.stringify(SESSION));
    expect(await readPersistedSession()).toBeNull();
  });
});
