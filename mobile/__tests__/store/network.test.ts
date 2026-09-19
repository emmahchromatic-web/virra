jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

import { useNetworkStore } from '@/store/network';

describe('network store', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isOnline: true, lastOnlineAt: null });
  });

  it('starts online with no lastOnlineAt recorded yet', () => {
    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(useNetworkStore.getState().lastOnlineAt).toBeNull();
  });

  it('going offline keeps the last known online time', () => {
    useNetworkStore.getState().setOnline(true);
    const stamped = useNetworkStore.getState().lastOnlineAt;
    useNetworkStore.getState().setOnline(false);
    expect(useNetworkStore.getState().isOnline).toBe(false);
    expect(useNetworkStore.getState().lastOnlineAt).toBe(stamped);
  });

  it('coming back online stamps a new lastOnlineAt', () => {
    useNetworkStore.getState().setOnline(false);
    useNetworkStore.getState().setOnline(true);
    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(useNetworkStore.getState().lastOnlineAt).not.toBeNull();
  });
});
