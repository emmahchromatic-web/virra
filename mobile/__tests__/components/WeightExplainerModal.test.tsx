import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';

describe('WeightExplainerModal', () => {
  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <WeightExplainerModal visible={false} mode="cycle" onDismiss={() => {}} />
    );
    expect(queryByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeNull();
  });

  it('renders cycle copy in cycle mode', () => {
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="cycle" onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/Your weight rises and falls with your cycle/i)).toBeTruthy();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('renders steady copy in steady mode', () => {
    const { getByText, queryByText } = render(
      <WeightExplainerModal visible={true} mode="steady" onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/bounces day-to-day from water/i)).toBeTruthy();
    expect(queryByText(/Your weight rises and falls with your cycle/i)).toBeNull();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed in cycle mode', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="cycle" onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Got it is pressed in steady mode', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="steady" onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
