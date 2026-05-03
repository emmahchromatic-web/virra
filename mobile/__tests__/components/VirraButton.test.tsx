import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VirraButton } from '@/components/ui/VirraButton';

describe('VirraButton', () => {
  it('renders label', () => {
    const { getByText } = render(
      <VirraButton onPress={() => {}} label="Start" />
    );
    expect(getByText('Start')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <VirraButton onPress={onPress} label="Go" />
    );
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <VirraButton onPress={onPress} label="No" disabled />
    );
    fireEvent.press(getByText('No'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
