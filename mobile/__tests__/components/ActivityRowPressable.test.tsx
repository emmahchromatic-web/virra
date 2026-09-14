import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { ActivityRow, type Activity } from '@/components/ui/ActivityRow';

const RUN: Activity = {
  id: 'act-1',
  activity_type: 'run',
  sub_type: null,
  started_at: '2026-08-28T10:44:43.000Z',
  duration_seconds: 2700,
  distance_meters: 6090,
  phase_at_time: 'luteal',
  run_details: [{ avg_pace_seconds_per_km: 443 }],
};

/**
 * Card 259, the half that made the detail screen unreachable: this row rendered
 * inside a plain View, so an imported run could be seen on the timeline and
 * never opened. The heart rate card 044 imports had nowhere to be read.
 */
describe('ActivityRow', () => {
  it('opens the activity when the caller provides a handler', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<ActivityRow activity={RUN} onPress={onPress} />);

    fireEvent.press(getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('stays a plain row when it has nowhere to go', () => {
    // The training tab and the timeline pass a handler; anything else keeps the
    // previous behaviour rather than becoming a button that does nothing.
    const { queryByRole, getByText } = render(<ActivityRow activity={RUN} />);

    expect(queryByRole('button')).toBeNull();
    expect(getByText('Run')).toBeTruthy();
  });
});
