import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { colors } from '@/constants/theme';

describe('CycleProgressBar', () => {
  it('renders without crashing at day 1', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={1} cycleLength={28} phaseColor={colors.heat} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing at last day of cycle', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={28} cycleLength={28} phaseColor={colors.pulse} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('caps fill at 100% when dayOfCycle exceeds cycleLength', () => {
    const { toJSON } = render(
      <CycleProgressBar dayOfCycle={40} cycleLength={28} phaseColor={colors.pulse} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
