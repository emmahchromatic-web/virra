// mobile/__tests__/store/auth.test.ts
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
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

const mockRcLogOut = jest.fn(async () => {});
jest.mock('@/lib/revenuecat', () => ({ logOutRevenueCat: () => mockRcLogOut() }));

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

  // Card 225 again, and the half that actually failed build 14. Deleting
  // notif_inbox_v1 does nothing about the copy the store is holding in memory:
  // `hydrate()` early-returns while `hydrated` is true, so the next account
  // never re-read the emptied key and rendered the previous account's inbox.
  it('empties the notification inbox in memory, not just in storage', async () => {
    await act(async () => {
      await useNotificationsStore.getState().add({
        id: 'n1', title: 'Time to train', body: "Today's run is ready.",
      });
    });
    expect(useNotificationsStore.getState().items).toHaveLength(1);
    expect(useNotificationsStore.getState().hydrated).toBe(false);

    // Hydrating is what the next account's launch does, and it is the step that
    // used to be skipped.
    await act(async () => { await useNotificationsStore.getState().hydrate(); });
    expect(useNotificationsStore.getState().hydrated).toBe(true);

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.signOut(); });

    expect(useNotificationsStore.getState().items).toHaveLength(0);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    // Cleared so the NEXT account actually reads storage instead of trusting
    // the previous account's in-memory copy.
    expect(useNotificationsStore.getState().hydrated).toBe(false);

    await act(async () => { await useNotificationsStore.getState().hydrate(); });
    expect(useNotificationsStore.getState().items).toHaveLength(0);
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

// The J2-reads stores. Same bug class as card 225 and the subscription tier
// below: a persisted store keeps its contents IN MEMORY, and nothing reloads
// between sign-out and the next sign-in on the same device -- so clearing the
// AsyncStorage keys alone leaves the previous account's name, cycle phase,
// food entries and favourited recipes on screen for whoever signs in next.
describe('signOut resets the J2 persisted stores in memory', () => {
  const { useProfileStore }  = require('@/store/profile');
  const { useCycleStore }    = require('@/store/cycle');
  const { useNutritionDay }  = require('@/store/nutritionDay');
  const { useRecipesStore }  = require('@/store/recipes');
  const { useRecentFoods }   = require('@/store/recentFoods');

  function seedAccountA() {
    useProfileStore.setState({
      firstName: 'Emma', lastName: 'Harrison', trackWeight: true, heightCm: 168,
      isLoaded: true, fetchedAt: '2026-09-01T00:00:00.000Z',
    });
    useCycleStore.setState({
      periodStart: new Date('2026-09-01'), cycleProfile: 'hormonal',
      contraceptionType: 'combined_pill', cycleLength: 27,
      cycleInfo: { phase: 'luteal', dayOfCycle: 20, daysUntilNextPeriod: 7, cycleLength: 27 } as any,
      fetchedAt: '2026-09-01T00:00:00.000Z',
    });
    useNutritionDay.setState({
      days: {
        '2026-09-18': {
          logId: 'log-a', trainingLoad: 'hard', inferredLoad: 'hard', targetsJson: null,
          entries: [{ id: 'e1', food_name: 'Porridge' } as any],
          fetchedAt: '2026-09-18T07:00:00.000Z',
        },
      },
      inFlight: {},
    });
    useRecipesStore.setState({
      list: [{ id: 'r1', title: 'Overnight oats' } as any],
      listFetchedAt: '2026-09-18T07:00:00.000Z',
      details: { r1: { detail: { id: 'r1' } as any, fetchedAt: '2026-09-18T07:00:00.000Z' } },
      favouriteIds: ['r1', 'r2'],
      favouritesFetchedAt: '2026-09-18T07:00:00.000Z',
    });
    useRecentFoods.setState({
      foods: [{ name: 'Porridge', unit: 'g', lastPortionG: 60, calories: 380, carbs_g: 60,
        protein_g: 11, fat_g: 8, fibre_g: 9, lastUsedAt: '2026-09-18T07:00:00.000Z' } as any],
      fetchedAt: '2026-09-18T07:00:00.000Z',
    });
  }

  it('empties all five stores so account B never sees account A on the same device', async () => {
    seedAccountA();

    await useAuthStore.getState().signOut();

    expect(useProfileStore.getState()).toMatchObject({
      firstName: '', lastName: '', trackWeight: false, heightCm: null,
      isLoaded: false, fetchedAt: null,
    });
    expect(useCycleStore.getState()).toMatchObject({
      periodStart: null, cycleProfile: 'natural', contraceptionType: null,
      cycleLength: 28, cycleInfo: null, fetchedAt: null,
    });
    expect(useNutritionDay.getState().days).toEqual({});
    expect(useRecipesStore.getState().list).toEqual([]);
    expect(useRecipesStore.getState().details).toEqual({});
    expect(useRecentFoods.getState().foods).toEqual([]);
    expect(useRecentFoods.getState().fetchedAt).toBeNull();
  });

  // The permanent leak. `refreshFavourites` keeps the cached list whenever a
  // non-empty one comes back empty (its suspected-failure guard), so without
  // a sign-out reset, account B's genuine "no favourites" result is read as a
  // failed refresh and account A's favourites are kept FOREVER.
  it("wipes recipes.favouriteIds, which the store's own failure guard would otherwise preserve forever", async () => {
    seedAccountA();
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1', 'r2']);

    await useAuthStore.getState().signOut();

    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
    expect(useRecipesStore.getState().favouritesFetchedAt).toBeNull();

    // Proof the guard can no longer misfire: account B's genuine empty list
    // now lands, because there is no stale non-empty list to "protect".
    jest.spyOn(require('@/lib/recipes'), 'fetchFavouriteIds').mockResolvedValue([]);
    await useRecipesStore.getState().refreshFavourites('user-b');
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });
});

// Card 298 hardening. The tier lives in memory, so it has to be dropped with
// the session: a free account signing in after a Pro one, without the app
// closing, otherwise saw everything unlocked.
describe('signOut resets the subscription tier', () => {
  const { useSubscriptionStore } = require('@/store/subscription');

  it('drops a Pro status back to unknown and logs RevenueCat out', async () => {
    mockRcLogOut.mockClear();
    useSubscriptionStore.setState({ status: 'active', isActive: true, devOverride: null });
    await useAuthStore.getState().signOut();
    expect(useSubscriptionStore.getState()).toMatchObject({ status: 'unknown', isActive: false });
    expect(mockRcLogOut).toHaveBeenCalledTimes(1);
  });

  it('leaves the internal Preview-as pin alone: it belongs to the device, not the account', async () => {
    useSubscriptionStore.setState({ status: 'expired', isActive: false, devOverride: 'expired' });
    await useAuthStore.getState().signOut();
    expect(useSubscriptionStore.getState().status).toBe('expired');
    useSubscriptionStore.setState({ devOverride: null });
  });
});
