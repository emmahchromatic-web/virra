import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isOnline:     boolean;
  lastOnlineAt: number | null;
  setOnline:    (online: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline:     true,
  lastOnlineAt: null,
  setOnline: (online) =>
    set((s) => ({ isOnline: online, lastOnlineAt: online ? Date.now() : s.lastOnlineAt })),
}));

/**
 * Starts the single app-wide NetInfo listener. Call once from the
 * authenticated layout; returns the unsubscribe function for its cleanup.
 */
export function startNetworkListener(): () => void {
  return NetInfo.addEventListener((state) => {
    const online = state.isInternetReachable ?? state.isConnected ?? true;
    useNetworkStore.getState().setOnline(online);
  });
}
