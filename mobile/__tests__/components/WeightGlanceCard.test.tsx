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
    const { getByText, queryByText } = render(<WeightGlanceCard latestKg={null} />);
    expect(getByText(/water, not fat/i)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
    // With no reading and no baseline we cannot know which side of her own
    // range she is on, so this copy must teach the phase rather than forecast
    // her number. Emma read "Expect a 1-2 kg lift" while sitting BELOW her
    // baseline on the build 14 regression pass.
    expect(queryByText(/^Expect a/)).toBeNull();
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

  it('still explains the lift when the reading is actually above baseline', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={61.5} />);
    expect(getByText(/water, not fat/i)).toBeTruthy();
  });
});
