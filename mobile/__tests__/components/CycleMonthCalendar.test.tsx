import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleMonthCalendar } from '@/components/ui/CycleMonthCalendar';

describe('CycleMonthCalendar', () => {
  const periodStart = new Date('2025-01-01');
  const today       = new Date('2025-01-10');

  it('renders weekday headers M T W T F S S', () => {
    const { getAllByText } = render(
      <CycleMonthCalendar periodStart={periodStart} cycleLength={28} year={2025} month={1} today={today} />
    );
    expect(getAllByText('M')).toHaveLength(1);
    expect(getAllByText('W')).toHaveLength(1);
    expect(getAllByText('F')).toHaveLength(1);
    // T and S each appear twice (Tue+Thu, Sat+Sun)
    expect(getAllByText('T')).toHaveLength(2);
    expect(getAllByText('S')).toHaveLength(2);
  });

  it('renders all 31 days of January 2025', () => {
    const { getByTestId } = render(
      <CycleMonthCalendar periodStart={periodStart} cycleLength={28} year={2025} month={1} today={today} />
    );
    for (let d = 1; d <= 31; d++) {
      const id = d === 10 ? 'cycle-month-day-today' : `cycle-month-day-${d}`;
      expect(getByTestId(id)).toBeTruthy();
    }
  });

  it('marks the today cell with testID cycle-month-day-today', () => {
    const { getByTestId } = render(
      <CycleMonthCalendar periodStart={periodStart} cycleLength={28} year={2025} month={1} today={today} />
    );
    expect(getByTestId('cycle-month-day-today')).toBeTruthy();
  });

  it('renders the legend row', () => {
    const { getByText } = render(
      <CycleMonthCalendar periodStart={periodStart} cycleLength={28} year={2025} month={1} today={today} />
    );
    expect(getByText(/BLEED/i)).toBeTruthy();
    expect(getByText(/FOLLICULAR/i)).toBeTruthy();
    expect(getByText(/OVULATORY/i)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });
});
