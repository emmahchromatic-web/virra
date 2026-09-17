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
}

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
  },
}));
