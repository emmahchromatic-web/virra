import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FitnessUpdateCard } from '@/components/ui/FitnessUpdateCard';
import type { Verdict } from '@/lib/baselineCalibration';

const faster: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'x', nRuns: 6, windowDays: 42, wouldChangeUpcoming: true,
};

describe('FitnessUpdateCard', () => {
  it('shows the faster prompt and opens on press', () => {
    const onOpen = jest.fn();
    const { getByText } = render(
      <FitnessUpdateCard verdict={faster} onOpen={onOpen} onDismiss={() => {}} />,
    );
    expect(getByText(/getting faster/i)).toBeTruthy();
    fireEvent.press(getByText(/getting faster/i));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the recalibrate prompt for slower', () => {
    const { getByText } = render(
      <FitnessUpdateCard verdict={{ ...faster, direction: 'slower' }} onOpen={() => {}} onDismiss={() => {}} />,
    );
    expect(getByText(/recalibrate/i)).toBeTruthy();
  });

  it('fires onDismiss from the dismiss control', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <FitnessUpdateCard verdict={faster} onOpen={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByLabelText(/dismiss/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
