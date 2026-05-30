import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { Shimmer } from '@/components/ui/Shimmer';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
});

afterEach(() => jest.restoreAllMocks());

describe('Shimmer', () => {
  it('renders a single bar by default', () => {
    const { getAllByTestId } = render(<Shimmer height={20} width={200} />);
    expect(getAllByTestId('shimmer-bar')).toHaveLength(1);
  });

  it('renders one bar per line when lines is set', () => {
    const { getAllByTestId } = render(<Shimmer height={20} width={200} lines={3} />);
    expect(getAllByTestId('shimmer-bar')).toHaveLength(3);
  });

  it('renders the animated sweep when motion is allowed', async () => {
    const { findAllByTestId } = render(<Shimmer height={20} width={200} />);
    expect(await findAllByTestId('shimmer-sweep')).toHaveLength(1);
  });

  it('omits the sweep when reduce motion is enabled', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { queryAllByTestId } = render(<Shimmer height={20} width={200} />);
    // The component starts with reduceMotion=false (sweep present), then the async
    // isReduceMotionEnabled() resolves true and the sweep is removed on re-render.
    // Under full-suite parallel load that flush can exceed the default 1000ms, so
    // give waitFor a generous timeout to keep this deterministic.
    await waitFor(() => expect(queryAllByTestId('shimmer-sweep')).toHaveLength(0), { timeout: 5000 });
  });

  it('omits the sweep until width is known (fluid mode)', () => {
    const { queryAllByTestId } = render(<Shimmer height={20} />);
    expect(queryAllByTestId('shimmer-sweep')).toHaveLength(0);
  });
});
