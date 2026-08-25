// mobile/__tests__/store/auth.test.ts
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}));

const mockCancelAll = jest.fn(async () => {});
jest.mock('@/lib/notifications', () => ({
  cancelAllNotifications: () => mockCancelAll(),
}));

describe('useAuthStore', () => {
  beforeEach(async () => {
    useAuthStore.setState({ session: null, user: null, isLoading: true });
    await AsyncStorage.clear();
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  });

  it('starts with null session and isLoading true', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('setSession updates session and user, clears isLoading', () => {
    const fakeSession = {
      user: { id: 'user-123', email: 'test@virra.app' },
    } as any;

    const { result } = renderHook(() => useAuthStore());
    act(() => { result.current.setSession(fakeSession); });

    expect(result.current.session).toBe(fakeSession);
    expect(result.current.user?.id).toBe('user-123');
    expect(result.current.isLoading).toBe(false);
  });

  it('setSession(null) clears user', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => { result.current.setSession(null); });
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('signOut clears session and user', async () => {
    const fakeSession = { user: { id: 'u1' } } as any;
    useAuthStore.setState({ session: fakeSession, user: fakeSession.user as any });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('signOut removes the persisted Supabase token even when the revoke fails', async () => {
    // The bug: supabase-js skips clearing its stored token when the network
    // revoke errors, so the next launch silently signs the user back in.
    await AsyncStorage.setItem('sb-elebuieojodsjmghwjub-auth-token', '{"access_token":"x"}');
    await AsyncStorage.setItem('sb-elebuieojodsjmghwjub-auth-token-code-verifier', 'v');
    await AsyncStorage.setItem('virra:unit_system', 'metric'); // device pref must survive
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' },
    });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).not.toContain('sb-elebuieojodsjmghwjub-auth-token');
    expect(keys).not.toContain('sb-elebuieojodsjmghwjub-auth-token-code-verifier');
    expect(keys).toContain('virra:unit_system');
    expect(result.current.session).toBeNull();
  });

  it('signOut uses local scope so it only signs out this device', async () => {
    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('signOut clears this user\'s cached data but keeps device-level prefs', async () => {
    await AsyncStorage.multiSet([
      ['virra:sessions:v1', '{"byId":{}}'],
      ['readiness_daily_v1', '{}'],
      ['hk_weight_anchor_v1', '2026-08-12'],
      ['notif_prefs_v1', '{}'],
      ['notif_training_2026-08-12', 'id'],
      ['virra:unit_system', 'metric'],      // device pref — must survive
      ['permissions_granted_v1', '1'],      // mirrors OS state — must survive
    ]);

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).not.toContain('virra:sessions:v1');
    expect(keys).not.toContain('readiness_daily_v1');
    expect(keys).not.toContain('hk_weight_anchor_v1');
    expect(keys).not.toContain('notif_prefs_v1');
    expect(keys).not.toContain('notif_training_2026-08-12');
    expect(keys).toContain('virra:unit_system');
    expect(keys).toContain('permissions_granted_v1');
  });

  // Card 225: a new account saw the previous account's reminders waiting for
  // it. Clearing the notif_* keys only removes this app's RECORD of what it
  // scheduled; iOS keeps the notifications themselves and delivers them to
  // whoever signs in next.
  it('cancels the device notifications on sign out, not just their markers', async () => {
    mockCancelAll.mockClear();
    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
  });

  it('still signs out even if cancelling notifications fails', async () => {
    mockCancelAll.mockRejectedValueOnce(new Error('notifications unavailable'));
    const { result } = renderHook(() => useAuthStore());
    // Start signed IN, or the assertion below proves nothing.
    act(() => { result.current.setSession({ user: { id: 'u1' } } as any); });
    expect(result.current.session).not.toBeNull();

    await act(async () => { await result.current.signOut(); });
    expect(result.current.session).toBeNull();
  });
});
