import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SyncPill } from '@/components/SyncPill';
import { useNetworkStore } from '@/store/network';
import { useOutboxStatus } from '@/store/outboxStatus';
import { useAuthStore } from '@/store/auth';

jest.mock('@/lib/outbox', () => ({
  readDeadLetters: jest.fn().mockResolvedValue([]),
  dismissDeadLetter: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readDeadLetters } = require('@/lib/outbox');

function reset() {
  useNetworkStore.setState({ isOnline: true, lastOnlineAt: Date.now() });
  useOutboxStatus.setState({ syncing: false, pendingCount: 0, deadLetterCount: 0, justSynced: false });
  useAuthStore.setState({ session: { user: { id: 'u1' } } as never, user: { id: 'u1' } as never, isLoading: false });
  readDeadLetters.mockClear();
  readDeadLetters.mockResolvedValue([]);
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

  /**
   * `pendingCount > 0` ALONE is the signal, deliberately without `syncing`.
   * `syncing` is true only for the literal duration of a `drain()` call, and a
   * retryable failure halts the drain with real unsynced work still queued --
   * so asserting this with `syncing: true` set would pass even if that fix
   * were reverted, which is exactly the blind spot this covers.
   */
  it('shows Syncing when work is pending, even with no drain literally running', () => {
    useOutboxStatus.setState({ syncing: false, pendingCount: 2 });
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

  it('opens the dead-letter sheet when the pill is tapped in the failed state', async () => {
    useOutboxStatus.setState({ deadLetterCount: 1 });
    const { getByText, getByLabelText } = render(<SyncPill />);
    expect(getByText('Unsaved')).toBeTruthy();

    fireEvent.press(getByLabelText('View unsaved items'));

    await waitFor(() => expect(readDeadLetters).toHaveBeenCalledWith('u1'));
    expect(getByText("COULDN'T SAVE")).toBeTruthy();
  });

  it('does nothing when tapped in a non-failed state', () => {
    useOutboxStatus.setState({ pendingCount: 1 });
    const { getByText, queryByLabelText } = render(<SyncPill />);
    expect(getByText('Syncing')).toBeTruthy();
    // Not tappable at all -- no accessible "view unsaved items" action exists
    // outside the failed state.
    expect(queryByLabelText('View unsaved items')).toBeNull();
  });
});
