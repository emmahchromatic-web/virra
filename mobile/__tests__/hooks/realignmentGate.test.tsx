import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';

/**
 * The Pro gate on the realignment prompt (card 298, found on the simulator
 * 18 Sep). The subscription status resolves after the first render — "unknown"
 * counts as Pro so subscribers get no padlock flash — so the gate cannot be
 * folded into the user id: the prompt is fetched while the status is still
 * settling, and an id that disappears afterwards leaves a prompt on screen
 * whose every choice silently does nothing.
 */
// Days back from today, so the fixture always lands in the "a few sessions"
// tier rather than ageing into the long-absence one.
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
};
const mockMissed = [2, 4, 6].map((n) => ({ scheduled_date: daysAgo(n), status: 'planned' }));

jest.mock('@/lib/supabase', () => {
  const builder: any = {
    select: () => builder, eq: () => builder, in: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mockMissed, error: null }).then(resolve),
  };
  return { supabase: { from: () => builder } };
});
const mockBlocks = jest.fn();
jest.mock('@/lib/trainingBlocks', () => ({
  getActiveBlocks: (...a: unknown[]) => mockBlocks(...a),
}));
const mockApply = jest.fn().mockResolvedValue({ summary: 'done', needsRebuild: false, changedCount: 3 });
jest.mock('@/lib/runProgramme/realignmentActions', () => ({ applyRealignment: (...a: unknown[]) => mockApply(...a) }));
jest.mock('@/store/cycle', () => ({
  useCycleStore: (sel: any) => sel({ cycleProfile: 'natural', periodStart: null, cycleLength: 28, periodDays: 5, cycleMode: 'steady' }),
}));

import { useRealignment } from '@/hooks/useRealignment';

function Probe({ enabled }: { enabled: boolean }) {
  const r = useRealignment('user-1', enabled);
  return (
    <>
      <Text testID="headline">{r.prompt?.headline ?? 'none'}</Text>
      <Pressable testID="choose" onPress={() => { void r.choose(r.prompt!.options[0]); }}><Text>choose</Text></Pressable>
    </>
  );
}

beforeEach(() => {
  mockApply.mockClear();
  mockBlocks.mockReset();
  mockBlocks.mockResolvedValue([{ id: 'block-1', modality: 'run' }]);
});

describe('the realignment prompt is gated on Pro, not on the user id', () => {
  it('says nothing to a runner who is not on Pro', async () => {
    const { getByTestId } = render(<Probe enabled={false} />);
    await act(async () => {});
    expect(getByTestId('headline').props.children).toBe('none');
  });

  it('prompts a Pro runner who has missed three sessions', async () => {
    const { getByTestId } = render(<Probe enabled />);
    await waitFor(() => expect(getByTestId('headline').props.children).toContain('3 sessions'));
  });

  it('acts on the choice: the user id survives the gate', async () => {
    const { getByTestId } = render(<Probe enabled />);
    await waitFor(() => expect(getByTestId('headline').props.children).toContain('3 sessions'));
    await act(async () => { fireEvent.press(getByTestId('choose')); });
    expect(mockApply).toHaveBeenCalledWith('skip_and_continue', expect.objectContaining({ userId: 'user-1', blockId: 'block-1' }));
  });

  it('takes the prompt away when the status settles as not Pro', async () => {
    const { getByTestId, rerender } = render(<Probe enabled />);
    await waitFor(() => expect(getByTestId('headline').props.children).toContain('3 sessions'));
    rerender(<Probe enabled={false} />);
    await waitFor(() => expect(getByTestId('headline').props.children).toBe('none'));
  });

  it('does not let a check that started as Pro land after the status settles as not Pro', async () => {
    // The first check is still waiting on the network when the status settles.
    let release!: (v: unknown) => void;
    mockBlocks.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const { getByTestId, rerender } = render(<Probe enabled />);
    rerender(<Probe enabled={false} />);
    await act(async () => { release([{ id: 'block-1', modality: 'run' }]); });
    await act(async () => {});
    expect(getByTestId('headline').props.children).toBe('none');
  });
});
