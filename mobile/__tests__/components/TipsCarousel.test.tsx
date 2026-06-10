import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { TipsCarousel } from '@/components/ui/TipsCarousel';

const mockTips = [
  { id: '1', phase: 'luteal', category: 'training', tip_text: 'Run to feel, not to pace.' },
  { id: '2', phase: 'luteal', category: 'nutrition', tip_text: 'Honour carb cravings with quality fuel.' },
];

jest.mock('@/lib/supabase', () => {
  const builder = {
    select: jest.fn(function() { return this; }),
    in: jest.fn(function() { return this; }),
    order: jest.fn(function() { return Promise.resolve({ data: mockTips, error: null }); }),
  };
  return {
    supabase: {
      from: jest.fn(() => builder),
    },
  };
});

describe('TipsCarousel', () => {
  it('renders the PHASE TIPS kicker', async () => {
    const { getByText } = render(<TipsCarousel phase="luteal" />);
    expect(getByText('PHASE TIPS')).toBeTruthy();
  });

  it('renders tip text after load', async () => {
    const { findByText } = render(<TipsCarousel phase="luteal" />);
    expect(await findByText('Run to feel, not to pace.')).toBeTruthy();
  });

  it('renders category label for each tip', async () => {
    const { findByText } = render(<TipsCarousel phase="luteal" />);
    expect(await findByText(/TRAINING/i)).toBeTruthy();
    expect(await findByText(/NUTRITION/i)).toBeTruthy();
  });

  it('renders shimmer while loading', () => {
    const { getByTestId } = render(<TipsCarousel phase="luteal" />);
    expect(getByTestId('shimmer')).toBeTruthy();
  });

  it('renders with null phase (falls back to all tips)', async () => {
    const { findByText } = render(<TipsCarousel phase={null} />);
    expect(await findByText('Run to feel, not to pace.')).toBeTruthy();
  });
});
