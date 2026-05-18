import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            true,
    weightBaselineKg:       null,
    weightSteadyBaselineKg: 60.0,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'hormonal',
    cycleInfo:    null,
  }),
}));

describe('WeightGlanceCard (steady)', () => {
  it('renders the steady in-band state with delta and STEADY pill', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.2} />);
    expect(getByText(/\+0.2/)).toBeTruthy();
    expect(getByText('STEADY')).toBeTruthy();
    expect(getByText(/FROM YOUR STEADY BASELINE/i)).toBeTruthy();
  });

  it('renders the above-line state when delta > 0.5', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.8} />);
    expect(getByText(/ABOVE LINE/i)).toBeTruthy();
  });

  it('renders the below-line state when delta < -0.5', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={59.3} />);
    expect(getByText(/BELOW LINE/i)).toBeTruthy();
  });
});
