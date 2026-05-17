import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleWeightChart, type WeightReading } from '@/components/ui/CycleWeightChart';

const periodStart = new Date('2025-01-01');

function reading(day: number, weightKg: number, cycleOffset: 0 | -1 | -2 = 0): WeightReading {
  const d = new Date(periodStart);
  d.setDate(periodStart.getDate() + day - 1 + cycleOffset * 28);
  return { recorded_on: d.toLocaleDateString('en-CA'), weight_kg: weightKg };
}

describe('CycleWeightChart', () => {
  it('renders the legend regardless of calibration state', () => {
    const { getByText } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(5, 60), reading(8, 60.1)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(getByText(/EXPECTED BAND/i)).toBeTruthy();
    expect(getByText(/CURRENT CYCLE/i)).toBeTruthy();
    expect(getByText(/PRIOR CYCLES/i)).toBeTruthy();
  });

  it('renders the calibrating ribbon when baselineKg is null', () => {
    const { getByText } = render(
      <CycleWeightChart
        baselineKg={null}
        readings={[reading(5, 60)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });

  it('does not render the calibrating ribbon when baselineKg is set', () => {
    const { queryByText } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(5, 60)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(queryByText(/CALIBRATING/i)).toBeNull();
  });

  it('renders without crashing when today is mid-cycle', () => {
    const today = new Date(periodStart);
    today.setDate(periodStart.getDate() + 23);
    const { toJSON } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(24, 61.5)]}
        periodStart={periodStart}
        cycleLength={28}
        today={today}
      />
    );
    expect(toJSON()).toBeTruthy();
  });
});
