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
// Only `cachedStatus`/`cachedTrialEnd` persist, for showing something
// ("Trial ends in 3 days") immediately on a cold start. `status`/`isActive`/
// `trialEnd` -- the fields every gating path reads (pro.ts, notifications.ts,
// _layout.tsx's syncEntitlement() gate, AddEventModal.tsx) -- are NEVER
// rehydrated from disk: they always come back at their hardcoded boot
// defaults ('unknown'/false/null), so a stale cached entitlement from a
// subscription that lapsed while offline can never short-circuit
// syncEntitlement()'s `if (!session || isActive) return;` gate. Gating stays
// on RevenueCat, entirely untouched by this.
describe('subscription store persistence (display only)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSubscriptionStore.setState({
      status: 'unknown', isActive: false, trialEnd: null,
      cachedStatus: 'unknown', cachedTrialEnd: null,
      devOverride: null, showProFeatures: true,
    });
  });

  it('persists cachedStatus and cachedTrialEnd, not status/isActive/trialEnd/devOverride/showProFeatures', async () => {
    useSubscriptionStore.getState().setStatus('trial', new Date('2026-10-01'));
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:subscription:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.cachedStatus).toBe('trial');
    expect(parsed.state.cachedTrialEnd).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.state.status).toBeUndefined();
    expect(parsed.state.isActive).toBeUndefined();
    expect(parsed.state.trialEnd).toBeUndefined();
    expect(parsed.state.devOverride).toBeUndefined();
    expect(parsed.state.showProFeatures).toBeUndefined();
  });

  // The critical property review flagged: even a "trusted" persisted status
  // for the LIVE fields must never surface -- status/isActive always come
  // back at their hardcoded defaults on a fresh store, no matter what a
  // (possibly stale) disk cache says. This is what keeps syncEntitlement()
  // firing on every cold start unconditionally.
  it('never rehydrates status/isActive/trialEnd from disk, even if a stale cached entitlement is sitting there', async () => {
    // Simulate a device that went offline while subscribed, and whose
    // subscription has since lapsed server-side. A naive implementation
    // might persist (or rehydrate) status/isActive directly -- this plants
    // exactly that shape, including an old-style `status`/`isActive` on
    // disk, to prove it's ignored.
    await AsyncStorage.setItem('virra:subscription:v1', JSON.stringify({
      state: {
        cachedStatus: 'active', cachedTrialEnd: null,
        status: 'active', isActive: true, trialEnd: null, // must be ignored
      },
      version: 1,
    }));

    await useSubscriptionStore.persist.rehydrate();

    const s = useSubscriptionStore.getState();
    expect(s.status).toBe('unknown');
    expect(s.isActive).toBe(false);
    expect(s.trialEnd).toBeNull();
    // The display cache DID rehydrate -- it's just never read for gating.
    expect(s.cachedStatus).toBe('active');
  });

  it('rehydrates cachedTrialEnd back into a real Date instance, not a string, while trialEnd stays null', async () => {
    const date = new Date('2026-11-15T00:00:00.000Z');
    useSubscriptionStore.getState().setStatus('trial', date);
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:subscription:v1');
    expect(typeof JSON.parse(raw!).state.cachedTrialEnd).toBe('string');

    // `merge` only ever touches cachedStatus/cachedTrialEnd -- it doesn't
    // reset the live fields (that happens once, at store creation). Reset
    // them here to simulate what a genuine fresh process boot looks like,
    // BEFORE planting the fresh disk value below -- setState's own write-
    // through would otherwise race the manual AsyncStorage.setItem that
    // follows, since it persists whatever cachedStatus/cachedTrialEnd are
    // currently in memory.
    useSubscriptionStore.setState({ status: 'unknown', isActive: false, trialEnd: null });
    await new Promise((r) => setTimeout(r, 0));

    // Simulate a genuinely fresh cold start with a different persisted value.
    const otherDate = new Date('2027-01-01T00:00:00.000Z');
    await AsyncStorage.setItem('virra:subscription:v1', JSON.stringify({
      state: { cachedStatus: 'trial', cachedTrialEnd: otherDate.toISOString() },
      version: 1,
    }));

    await useSubscriptionStore.persist.rehydrate();

    const state = useSubscriptionStore.getState();
    expect(state.cachedTrialEnd).toBeInstanceOf(Date);
    expect(state.cachedTrialEnd?.toISOString()).toBe(otherDate.toISOString());
    expect(state.cachedStatus).toBe('trial');
    // Live fields stay at their hardcoded boot defaults regardless.
    expect(state.status).toBe('unknown');
    expect(state.isActive).toBe(false);
    expect(state.trialEnd).toBeNull();
  });

  it('setStatus() keeps cachedStatus/cachedTrialEnd in lockstep with the live fields', () => {
    const date = new Date('2026-12-25T00:00:00.000Z');
    useSubscriptionStore.getState().setStatus('trial', date);
    const s = useSubscriptionStore.getState();
    expect(s.status).toBe('trial');
    expect(s.cachedStatus).toBe('trial');
    expect(s.trialEnd).toEqual(date);
    expect(s.cachedTrialEnd).toEqual(date);
  });
});
