// mobile/src/store/subscription.ts
import { create } from 'zustand';

// Card 298. `free` is a woman who has never subscribed and is using the free
// tier; `expired`/`cancelled` are lapsed subscribers. None of the three hold
// the entitlement, and `isActive` is the single "is Pro" answer the app reads.
type SubscriptionStatus = 'unknown' | 'free' | 'trial' | 'active' | 'expired' | 'cancelled';

interface SubscriptionState {
  status:    SubscriptionStatus;
  isActive:  boolean;
  trialEnd:  Date | null;
  setStatus: (status: SubscriptionStatus, trialEnd?: Date) => void;
}

const ACTIVE_STATUSES: SubscriptionStatus[] = ['trial', 'active'];

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  status:    'unknown',
  isActive:  false,
  trialEnd:  null,
  setStatus: (status, trialEnd) =>
    set({ status, isActive: ACTIVE_STATUSES.includes(status), trialEnd: trialEnd ?? null }),
}));
