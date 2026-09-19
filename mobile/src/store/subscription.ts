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
 * Raw fields persisted to AsyncStorage -- `status` and `trialEnd` ONLY, for
 * display continuity across a cold start (e.g. "Trial ends in 3 days" shown
 * immediately, rather than a blank state until RevenueCat answers).
 *
 * `isActive` is deliberately absent: it is a pure function of `status`
 * (`ACTIVE_STATUSES.includes(status)`) and must never be trusted as cached
 * data -- it's recomputed both at `setStatus()` time and again after
 * rehydration below. This store gates nothing; feature/paywall gating stays
 * on RevenueCat, entirely unchanged by this persistence.
 *
 * `showProFeatures` and `devOverride` keep their own separate AsyncStorage
 * keys (`SHOW_PRO_FEATURES_KEY`, `DEV_SUB_OVERRIDE_KEY`) and are not folded
 * in here.
 *
 * `trialEnd` is `Date | null` -- same ISO-string `partialize`/`merge`
 * treatment as `cycle.ts`'s `periodStart`/`currentPackStart`, since `Date`
 * objects don't survive a JSON round trip on their own.
 */
interface PersistedSubscriptionState {
  status:   SubscriptionStatus;
  trialEnd: string | null;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      status:    'unknown',
      isActive:  false,
      trialEnd:  null,
      setStatus: (status, trialEnd) =>
        set({ status, isActive: ACTIVE_STATUSES.includes(status), trialEnd: trialEnd ?? null }),

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
        status:   s.status,
        trialEnd: s.trialEnd ? s.trialEnd.toISOString() : null,
        // isActive, showProFeatures, and devOverride excluded deliberately --
        // see PersistedSubscriptionState's doc comment above.
      }),
      merge: (persistedState, currentState) => {
        // `p` is `{}` on a fresh install (nothing in storage yet) -- status
        // and trialEnd then fall back to currentState's own defaults.
        const p = (persistedState ?? {}) as Partial<PersistedSubscriptionState>;

        const status   = p.status ?? currentState.status;
        const trialEnd = p.trialEnd ? new Date(p.trialEnd) : null;

        return {
          ...currentState,
          status,
          trialEnd,
          // Never trusted from disk -- always re-derived from status, here
          // exactly as setStatus() does it inline.
          isActive: ACTIVE_STATUSES.includes(status),
        };
      },
    },
  ),
);
