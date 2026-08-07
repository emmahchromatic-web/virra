import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightSteadyChart, type WeightReading } from '@/components/ui/WeightSteadyChart';

const today = new Date('2026-05-18');

function reading(daysAgo: number, weightKg: number): WeightReading {
  const d = new Date(today);
  d.setDate(today.getDate() - daysAgo);
  return { recorded_on: d.toLocaleDateString('en-CA'), weight_kg: weightKg };
}

describe('WeightSteadyChart', () => {
  it('renders the legend regardless of calibration state', () => {
    const { getByText } = render(
      <WeightSteadyChart
        baselineKg={60}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(getByText(/STEADY LINE/i)).toBeTruthy();
    expect(getByText(/0.5 KG BAND/i)).toBeTruthy();
    expect(getByText(/READING/i)).toBeTruthy();
  });

  it('renders the calibrating ribbon when baselineKg is null', () => {
    const { getByText } = render(
      <WeightSteadyChart
        baselineKg={null}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });

  it('does not render the calibrating ribbon when baselineKg is set', () => {
    const { queryByText } = render(
      <WeightSteadyChart
        baselineKg={60}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(queryByText(/CALIBRATING/i)).toBeNull();
  });

  // The ribbon used to count the chart's 90-day window against the 7-reading
  // minimum, which applies to a 30-day window — producing "60/7 READINGS LOGGED".
  it('counts only readings inside the 30-day calibration window', () => {
    const readings = [
      ...Array.from({ length: 20 }, (_, i) => reading(40 + i, 60)), // outside the window
      ...Array.from({ length: 3 },  (_, i) => reading(i, 60)),      // inside it
    ];
    const { getByText } = render(
      <WeightSteadyChart baselineKg={null} readings={readings} today={today} />
    );
    expect(getByText('CALIBRATING — 3/7 READINGS LOGGED')).toBeTruthy();
  });

  it('never shows a count above the minimum it needs', () => {
    const readings = Array.from({ length: 25 }, (_, i) => reading(i, 60));
    const { getByText } = render(
      <WeightSteadyChart baselineKg={null} readings={readings} today={today} />
    );
    expect(getByText('CALIBRATING — 7/7 READINGS LOGGED')).toBeTruthy();
  });

  it('renders without crashing with an empty readings array', () => {
    const { toJSON } = render(
      <WeightSteadyChart baselineKg={null} readings={[]} today={today} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
