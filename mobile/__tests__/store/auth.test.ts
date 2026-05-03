// mobile/__tests__/store/auth.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useAuthStore } from '@/store/auth';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, user: null, isLoading: true });
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
});
