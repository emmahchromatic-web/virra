// mobile/__tests__/store/subscription.test.ts
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// ── Persistence (display only) ────────────────────────────────────────────
// Only `status`/`trialEnd` persist, for showing something ("Trial ends in 3
// days") immediately on a cold start. `isActive` is never trusted from disk --
// it is always recomputed from `status` via ACTIVE_STATUSES.includes(status),
// both at setStatus() time (unchanged) and after rehydration (new). Gating
// stays on RevenueCat, entirely untouched by this.
describe('subscription store persistence (display only)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSubscriptionStore.setState({
      status: 'unknown', isActive: false, trialEnd: null, devOverride: null, showProFeatures: true,
    });
  });

  it('persists status and trialEnd, not isActive/devOverride/showProFeatures', async () => {
    useSubscriptionStore.getState().setStatus('trial', new Date('2026-10-01'));
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:subscription:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.status).toBe('trial');
    expect(parsed.state.trialEnd).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.state.isActive).toBeUndefined();
    expect(parsed.state.devOverride).toBeUndefined();
    expect(parsed.state.showProFeatures).toBeUndefined();
  });

  it('re-derives isActive from the persisted status on rehydration, does not trust a stale cached isActive', async () => {
    // Plant a status of 'active' with a deliberately WRONG isActive on disk --
    // if rehydration ever trusted the persisted isActive rather than
    // recomputing it, this would come back false.
    await AsyncStorage.setItem('virra:subscription:v1', JSON.stringify({
      state: { status: 'active', isActive: false, trialEnd: null },
      version: 1,
    }));

    await useSubscriptionStore.persist.rehydrate();

    expect(useSubscriptionStore.getState().status).toBe('active');
    expect(useSubscriptionStore.getState().isActive).toBe(true);
  });

  it('rehydrates trialEnd back into a real Date instance, not a string', async () => {
    const date = new Date('2026-11-15T00:00:00.000Z');
    useSubscriptionStore.getState().setStatus('trial', date);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:subscription:v1');
    expect(typeof JSON.parse(raw!).state.trialEnd).toBe('string');

    // Simulate a genuinely fresh cold start with a different persisted value.
    const otherDate = new Date('2027-01-01T00:00:00.000Z');
    await AsyncStorage.setItem('virra:subscription:v1', JSON.stringify({
      state: { status: 'trial', trialEnd: otherDate.toISOString() },
      version: 1,
    }));

    await useSubscriptionStore.persist.rehydrate();

    const rehydrated = useSubscriptionStore.getState().trialEnd;
    expect(rehydrated).toBeInstanceOf(Date);
    expect(rehydrated?.toISOString()).toBe(otherDate.toISOString());
    expect(useSubscriptionStore.getState().isActive).toBe(true);
  });
});
