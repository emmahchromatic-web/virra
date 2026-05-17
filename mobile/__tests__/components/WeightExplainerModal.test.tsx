import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';

describe('WeightExplainerModal', () => {
  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <WeightExplainerModal visible={false} onDismiss={() => {}} />
    );
    expect(queryByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeNull();
  });

  it('renders the framing copy when visible is true', () => {
    const { getByText } = render(
      <WeightExplainerModal visible={true} onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('calls onDismiss when the Got it button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
