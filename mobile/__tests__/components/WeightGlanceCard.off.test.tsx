import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      false,
    weightBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({ cycleInfo: null }),
}));

describe('WeightGlanceCard (off)', () => {
  it('returns null when trackWeight is false', () => {
    const { toJSON } = render(<WeightGlanceCard latestKg={60} />);
    expect(toJSON()).toBeNull();
  });
});
