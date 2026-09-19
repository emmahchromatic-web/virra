// mobile/src/store/subscription.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorageAdapter } from './persistAdapter';

// Card 298. `free` is a woman who has never subscribed and is using the free
// tier; `expired`/`cancelled` are lapsed subscribers. None of the three hold
// the entitlement, and `isActive` is the single "is Pro" answer the app reads.
type SubscriptionStatus = 'unknown' | 'free' | 'trial' | 'active' | 'expired' | 'cancelled';

// Device-level, like virra:unit_system: it is a display preference, not
// account data, and sign-out leaves it alone (see localCaches.ts).
export const SHOW_PRO_FEATURES_KEY = 'virra:show_pro_features';

interface SubscriptionState {
  status:    SubscriptionStatus;
  isActive:  boolean;
  trialEnd:  Date | null;
  /**
   * A persisted COPY of the last known status/trialEnd, kept only for
   * instant display continuity on a cold start (e.g. rendering "Trial ends
   * in 3 days" before RevenueCat has answered). Nothing gating-related may
   * ever read these -- `status`/`isActive`/`trialEnd` are the only fields
   * gating logic reads, and those stay in-memory-only, reset to their
   * hardcoded defaults on every process boot regardless of what's cached
   * here. `setStatus()` updates both in lockstep so the cache never goes
   * stale relative to the live fields going forward.
   */
  cachedStatus:   SubscriptionStatus;
  cachedTrialEnd: Date | null;
  setStatus: (status: SubscriptionStatus, trialEnd?: Date) => void;
  /** Card 298. Whether a free user sees the locked Pro tiles. On by default:
   *  the tiles are how she learns what Pro is, and Emma's reference app saw
   *  upgrades rise when they were shown. Off hides them, the paywall stays
   *  reachable from Profile. */
  showProFeatures:    boolean;
  setShowProFeatures: (show: boolean) => Promise<void>;
  hydrateProFeatures: () => Promise<void>;
  /** Internal builds only. Pins the status so every tier can be looked at
   *  without a real purchase, a real lapse, or a second build. While set,
   *  the app layout does not ask RevenueCat. null = the real answer. */
  devOverride:    SubscriptionStatus | null;
  setDevOverride: (status: SubscriptionStatus | null) => Promise<void>;
}

export const DEV_SUB_OVERRIDE_KEY = 'virra:dev_sub_override';
export const INTERNAL_TOOLS =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_INTERNAL_BUILD === 'true';

const ACTIVE_STATUSES: SubscriptionStatus[] = ['trial', 'active'];

/**
 * Raw fields persisted to AsyncStorage -- `cachedStatus`/`cachedTrialEnd`
 * ONLY, a copy kept purely for display continuity across a cold start (e.g.
 * "Trial ends in 3 days" shown immediately, rather than a blank state until
 * RevenueCat answers).
 *
 * `status`, `isActive`, and `trialEnd` -- the LIVE fields every gating path
 * in the app reads (`pro.ts`, `notifications.ts`, `_layout.tsx`'s
 * `syncEntitlement()` gate, `AddEventModal.tsx`) -- are deliberately EXCLUDED
 * from persistence entirely. They always start at their hardcoded defaults
 * (`'unknown'`/`false`/`null`) on every process boot, in-memory only, so
 * `syncEntitlement()`'s `if (!session || isActive) return;` early-return
 * cannot be short-circuited by a stale cached entitlement from a
 * subscription that lapsed or was cancelled while the device was offline.
 * Gating must always re-ask RevenueCat, exactly as before this store gained
 * any persistence.
 *
 * `showProFeatures` and `devOverride` keep their own separate AsyncStorage
 * keys (`SHOW_PRO_FEATURES_KEY`, `DEV_SUB_OVERRIDE_KEY`) and are not folded
 * in here.
 *
 * `cachedTrialEnd` is `Date | null` -- same ISO-string `partialize`/`merge`
 * treatment as `cycle.ts`'s `periodStart`/`currentPackStart`, since `Date`
 * objects don't survive a JSON round trip on their own.
 */
interface PersistedSubscriptionState {
  cachedStatus:   SubscriptionStatus;
  cachedTrialEnd: string | null;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      status:    'unknown',
      isActive:  false,
      trialEnd:  null,
      cachedStatus:   'unknown',
      cachedTrialEnd: null,
      setStatus: (status, trialEnd) =>
        set({
          status, isActive: ACTIVE_STATUSES.includes(status), trialEnd: trialEnd ?? null,
          // Kept in lockstep with the live fields so the display cache never
          // drifts from the last real answer RevenueCat gave.
          cachedStatus: status, cachedTrialEnd: trialEnd ?? null,
        }),

      showProFeatures: true,
      setShowProFeatures: async (show) => {
        set({ showProFeatures: show });
        try { await AsyncStorage.setItem(SHOW_PRO_FEATURES_KEY, show ? '1' : '0'); } catch { /* preference only */ }
      },
      hydrateProFeatures: async () => {
        try {
          const stored = await AsyncStorage.getItem(SHOW_PRO_FEATURES_KEY);
          if (stored === '0') set({ showProFeatures: false });
        } catch { /* default stays on */ }
        if (!INTERNAL_TOOLS) return;
        try {
          const pinned = await AsyncStorage.getItem(DEV_SUB_OVERRIDE_KEY) as SubscriptionStatus | null;
          if (pinned) set({ devOverride: pinned, status: pinned, isActive: ACTIVE_STATUSES.includes(pinned), trialEnd: null });
        } catch { /* no override */ }
      },

      devOverride: null,
      setDevOverride: async (status) => {
        if (!INTERNAL_TOOLS) return;
        if (status) {
          set({ devOverride: status, status, isActive: ACTIVE_STATUSES.includes(status), trialEnd: null });
          try { await AsyncStorage.setItem(DEV_SUB_OVERRIDE_KEY, status); } catch { /* session only */ }
        } else {
          // Back to `unknown` so the app layout asks RevenueCat again.
          set({ devOverride: null, status: 'unknown', isActive: false, trialEnd: null });
          try { await AsyncStorage.removeItem(DEV_SUB_OVERRIDE_KEY); } catch { /* fine */ }
        }
      },
    }),
    {
      name: 'virra:subscription:v1',
      storage: createJSONStorage(() => asyncStorageAdapter),
      version: 1,
      partialize: (s): PersistedSubscriptionState => ({
        cachedStatus:   s.cachedStatus,
        cachedTrialEnd: s.cachedTrialEnd ? s.cachedTrialEnd.toISOString() : null,
        // status, isActive, trialEnd, showProFeatures, and devOverride
        // excluded deliberately -- see PersistedSubscriptionState's doc
        // comment above. Gating must never rehydrate from disk.
      }),
      merge: (persistedState, currentState) => {
        // `p` is `{}` on a fresh install (nothing in storage yet) --
        // cachedStatus/cachedTrialEnd then fall back to currentState's own
        // defaults.
        const p = (persistedState ?? {}) as Partial<PersistedSubscriptionState>;

        const cachedStatus   = p.cachedStatus ?? currentState.cachedStatus;
        const cachedTrialEnd = p.cachedTrialEnd ? new Date(p.cachedTrialEnd) : null;

        return {
          ...currentState,
          cachedStatus,
          cachedTrialEnd,
          // status/isActive/trialEnd are intentionally NOT set here -- they
          // keep currentState's hardcoded boot defaults ('unknown'/false/
          // null) no matter what's on disk. This is what keeps
          // syncEntitlement()'s `if (!session || isActive) return;` gate
          // firing on every cold start exactly as it always has.
        };
      },
    },
  ),
);
