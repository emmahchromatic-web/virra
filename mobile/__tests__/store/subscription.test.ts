// mobile/__tests__/store/subscription.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useSubscriptionStore } from '@/store/subscription';

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({ status: 'unknown', isActive: false });
  });

  it('starts with unknown status and inactive', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    expect(result.current.status).toBe('unknown');
    expect(result.current.isActive).toBe(false);
  });

  it('setStatus("active") marks isActive true', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('active'); });
    expect(result.current.status).toBe('active');
    expect(result.current.isActive).toBe(true);
  });

  it('setStatus("trial") marks isActive true', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('trial'); });
    expect(result.current.isActive).toBe(true);
  });

  it('setStatus("expired") marks isActive false', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('expired'); });
    expect(result.current.isActive).toBe(false);
  });
});

// Card 298. The free tier is a status of its own so the profile row and the
// paywall can tell "never subscribed" from "lapsed".
describe('useSubscriptionStore free tier', () => {
  it('setStatus("free") is not active and clears any trial end', () => {
    const { result } = renderHook(() => useSubscriptionStore());
    act(() => { result.current.setStatus('trial', new Date()); });
    act(() => { result.current.setStatus('free'); });
    expect(result.current.status).toBe('free');
    expect(result.current.isActive).toBe(false);
    expect(result.current.trialEnd).toBeNull();
  });
});

describe('Show Pro features preference', () => {
  const mod = require('@react-native-async-storage/async-storage');
  const AsyncStorage = mod.default ?? mod;
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSubscriptionStore.setState({ showProFeatures: true });
  });

  it('is on by default and hydrates to on when nothing is stored', async () => {
    await useSubscriptionStore.getState().hydrateProFeatures();
    expect(useSubscriptionStore.getState().showProFeatures).toBe(true);
  });

  it('persists off and hydrates it back', async () => {
    await useSubscriptionStore.getState().setShowProFeatures(false);
    expect(useSubscriptionStore.getState().showProFeatures).toBe(false);
    useSubscriptionStore.setState({ showProFeatures: true });
    await useSubscriptionStore.getState().hydrateProFeatures();
    expect(useSubscriptionStore.getState().showProFeatures).toBe(false);
  });
});

// Internal "Preview as" pin on the Subscription screen.
describe('devOverride', () => {
  beforeEach(() => useSubscriptionStore.setState({ status: 'free', isActive: false, devOverride: null }));

  it('pins a status, and "Real" drops back to unknown so RevenueCat is asked again', async () => {
    await useSubscriptionStore.getState().setDevOverride('expired');
    expect(useSubscriptionStore.getState()).toMatchObject({ devOverride: 'expired', status: 'expired', isActive: false });
    await useSubscriptionStore.getState().setDevOverride('active');
    expect(useSubscriptionStore.getState()).toMatchObject({ devOverride: 'active', isActive: true });
    await useSubscriptionStore.getState().setDevOverride(null);
    expect(useSubscriptionStore.getState()).toMatchObject({ devOverride: null, status: 'unknown', isActive: false });
  });
});
