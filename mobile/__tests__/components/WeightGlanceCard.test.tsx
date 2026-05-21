import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            true,
    weightBaselineKg:       60.0,
    weightSteadyBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'natural',
    cycleInfo: { phase: 'luteal', dayOfCycle: 24, daysUntilNextPeriod: 5, cycleLength: 28 },
  }),
}));

describe('WeightGlanceCard', () => {
  it('renders the generic phase expectation when no reading is provided', () => {
    // Phase G merge: the card absorbs the standalone WHAT TO EXPECT card on
    // cycle-detail, so a null reading still produces useful phase context
    // rather than rendering nothing.
    const { getByText } = render(<WeightGlanceCard latestKg={null} />);
    expect(getByText(/water retention/i)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });

  it('renders the in-band state with delta and phase pill', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={61.5} />);
    expect(getByText(/\+1.5/)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });

  it('renders an above-band state when the delta exceeds the band upper', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={62.5} />);
    expect(getByText(/ABOVE BAND/i)).toBeTruthy();
  });
});
