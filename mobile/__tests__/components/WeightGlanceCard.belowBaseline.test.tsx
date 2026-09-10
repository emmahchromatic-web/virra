import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

// A PERSONALISED band, which is the only way -0.6 kg is "in band" in the luteal
// phase: the population model runs 0.5 to 2.0 there and would call this below
// band. Emma's own chart on build 14 showed exactly this shape.
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            true,
    weightBaselineKg:       58.7,
    weightSteadyBaselineKg: null,
    weightPhaseBands: {
      menstrual:  { lower: -1.2, upper: 0.4 },
      follicular: { lower: -0.6, upper: 0.6 },
      ovulatory:  { lower: -0.4, upper: 0.9 },
      luteal:     { lower: -1.0, upper: 1.0 },
    },
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'natural',
    cycleInfo: { phase: 'luteal', dayOfCycle: 21, daysUntilNextPeriod: 7, cycleLength: 28 },
  }),
}));

/**
 * Build 14: in band, luteal, 0.6 kg BELOW the follicular baseline, and the copy
 * read "Right where your body wants to be today. This is water, not fat. It'll
 * resolve in 5-7 days."
 *
 * Being in band says nothing about WHICH SIDE of the baseline you are on, and
 * a personalised luteal band routinely spans both. The luteal and ovulatory
 * strings assumed the water lift was present and offered to explain it away, so
 * someone sitting below baseline was told to wait out a rise that never
 * happened.
 */
describe('WeightGlanceCard — in band but below baseline', () => {
  it('does not explain away a luteal water lift that is not there', () => {
    const { getByText, queryByText } = render(<WeightGlanceCard latestKg={58.1} />);

    expect(getByText(/IN BAND/i)).toBeTruthy();
    expect(getByText(/−0.6/)).toBeTruthy();
    expect(queryByText(/resolve in/i)).toBeNull();
    expect(queryByText(/water, not fat/i)).toBeNull();
    expect(getByText(/below your follicular baseline/i)).toBeTruthy();
  });
});
