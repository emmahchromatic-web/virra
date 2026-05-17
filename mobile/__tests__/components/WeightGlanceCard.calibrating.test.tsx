import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      true,
    weightBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleInfo: { phase: 'follicular', dayOfCycle: 9, daysUntilNextPeriod: 19, cycleLength: 28 },
  }),
}));

describe('WeightGlanceCard (calibrating)', () => {
  it('renders the calibrating state when baseline is null', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.0} />);
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });
});
