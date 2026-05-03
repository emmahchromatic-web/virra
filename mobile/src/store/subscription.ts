// mobile/src/store/subscription.ts
import { create } from 'zustand';

type SubscriptionStatus = 'unknown' | 'trial' | 'active' | 'expired' | 'cancelled';

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
