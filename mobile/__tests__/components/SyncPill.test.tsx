import React from 'react';
import { render } from '@testing-library/react-native';
import { SyncPill } from '@/components/SyncPill';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';

function reset() {
  useNetworkStore.setState({ isOnline: true, lastOnlineAt: Date.now() });
  useOutboxStatus.setState({ syncing: false, pendingCount: 0, deadLetterCount: 0, justSynced: false });
}

describe('SyncPill', () => {
  beforeEach(reset);

  it('renders nothing when online, idle, and nothing failed', () => {
    const { queryByText } = render(<SyncPill />);
    expect(queryByText('Offline')).toBeNull();
    expect(queryByText('Syncing')).toBeNull();
  });

  it('shows Offline when the network store says offline', () => {
    useNetworkStore.setState({ isOnline: false });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Offline')).toBeTruthy();
  });

  it('shows Syncing while a drain is running with items left', () => {
    useOutboxStatus.setState({ syncing: true, pendingCount: 2 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Syncing')).toBeTruthy();
  });

  it('shows Unsaved when the dead-letter list is non-empty, even if online and idle', () => {
    useOutboxStatus.setState({ deadLetterCount: 1 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Unsaved')).toBeTruthy();
  });

  it('prioritises Unsaved over Offline', () => {
    useNetworkStore.setState({ isOnline: false });
    useOutboxStatus.setState({ deadLetterCount: 1 });
    const { getByText } = render(<SyncPill />);
    expect(getByText('Unsaved')).toBeTruthy();
  });
});
