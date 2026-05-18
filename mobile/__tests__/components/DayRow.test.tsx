import React from 'react';
import { render } from '@testing-library/react-native';
import { DayRow } from '@/components/ui/DayRow';

describe('DayRow', () => {
  it('renders the day kicker', () => {
    const { getByText } = render(
      <DayRow
        date="2026-05-19"
        weekdayLabel="TUE 19"
        isToday={false}
        highlighted={false}
        onMeasure={() => {}}
      >
        {null}
      </DayRow>
    );
    expect(getByText('TUE 19')).toBeTruthy();
  });

  it('appends · TODAY to the kicker when isToday', () => {
    const { getByText } = render(
      <DayRow
        date="2026-05-18"
        weekdayLabel="MON 18"
        isToday={true}
        highlighted={false}
        onMeasure={() => {}}
      >
        {null}
      </DayRow>
    );
    expect(getByText(/MON 18 · TODAY/i)).toBeTruthy();
  });

  it('renders the empty placeholder when children is empty', () => {
    const { getByText } = render(
      <DayRow
        date="2026-05-20"
        weekdayLabel="WED 20"
        isToday={false}
        highlighted={false}
        onMeasure={() => {}}
      >
        {[]}
      </DayRow>
    );
    expect(getByText('EMPTY')).toBeTruthy();
  });
});
