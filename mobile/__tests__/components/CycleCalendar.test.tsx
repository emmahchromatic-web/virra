import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleCalendar } from '@/components/ui/CycleCalendar';

describe('CycleCalendar', () => {
  const periodStart = new Date('2025-01-01');

  it('renders one chip per day in the cycle', () => {
    const { getAllByTestId } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={periodStart} />
    );
    expect(getAllByTestId(/^cycle-day-/)).toHaveLength(28);
  });

  it('marks the today chip with testID cycle-day-today', () => {
    const today = new Date(periodStart);
    today.setDate(periodStart.getDate() + 6);
    const { getByTestId } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={today} />
    );
    expect(getByTestId('cycle-day-today')).toBeTruthy();
  });

  it('renders the legend row', () => {
    const { getByText } = render(
      <CycleCalendar periodStart={periodStart} cycleLength={28} today={periodStart} />
    );
    expect(getByText(/BLEED/i)).toBeTruthy();
    expect(getByText(/FOLLICULAR/i)).toBeTruthy();
    expect(getByText(/OVULATORY/i)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });
});
