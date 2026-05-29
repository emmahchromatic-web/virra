import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FitnessUpdateModal } from '@/components/ui/FitnessUpdateModal';
import type { Verdict } from '@/lib/baselineCalibration';

const faster: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'your recent runs work out to about 5:36/km — quicker than the 6:00 your plan assumes',
  nRuns: 6, windowDays: 42, wouldChangeUpcoming: true,
};
const slower: Verdict = { ...faster, direction: 'slower', observed: 384, proposed: 372, evidence: 'easier copy' };

describe('FitnessUpdateModal', () => {
  it('renders nothing meaningful when hidden', () => {
    const { queryByText } = render(
      <FitnessUpdateModal visible={false} verdict={faster} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(queryByText(/getting faster/i)).toBeNull();
  });

  it('renders the faster headline, paces, and the cascade promise', () => {
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={faster} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(getByText(/getting faster/i)).toBeTruthy();
    expect(getByText(/6:00/)).toBeTruthy();
    expect(getByText(/5:48|5:36/)).toBeTruthy();
    expect(getByText(/refresh your upcoming sessions/i)).toBeTruthy();
  });

  it('uses recalibrate copy for the slower direction', () => {
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={slower} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(getByText(/recalibrate/i)).toBeTruthy();
  });

  it('softens the cascade promise when nothing upcoming would change', () => {
    const { getByText, queryByText } = render(
      <FitnessUpdateModal visible verdict={{ ...faster, wouldChangeUpcoming: false }} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(queryByText(/refresh your upcoming sessions/i)).toBeNull();
    expect(getByText(/next plan/i)).toBeTruthy();
  });

  it('fires onConfirm and onSnooze', () => {
    const onConfirm = jest.fn();
    const onSnooze = jest.fn();
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={faster} onConfirm={onConfirm} onSnooze={onSnooze} />,
    );
    fireEvent.press(getByText(/update my baseline/i));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText(/not yet/i));
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });
});
