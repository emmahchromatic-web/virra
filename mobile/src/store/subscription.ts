// mobile/src/store/subscription.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
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
}));
