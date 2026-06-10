import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuickLogRow } from '@/components/ui/QuickLogRow';

describe('QuickLogRow', () => {
  it('renders FOOD and ACTIVITY buttons always', () => {
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(getByLabelText('Log food')).toBeTruthy();
    expect(getByLabelText('Log activity')).toBeTruthy();
  });

  it('hides WEIGHT button when trackWeight is false', () => {
    const { queryByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(queryByLabelText('Log weight')).toBeNull();
  });

  it('shows WEIGHT button when trackWeight is true', () => {
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={true} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(getByLabelText('Log weight')).toBeTruthy();
  });

  it('calls onFoodPress when food button tapped', () => {
    const onFoodPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={onFoodPress} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    fireEvent.press(getByLabelText('Log food'));
    expect(onFoodPress).toHaveBeenCalledTimes(1);
  });

  it('calls onActivityPress when activity button tapped', () => {
    const onActivityPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={onActivityPress} onWeightPress={() => {}} />,
    );
    fireEvent.press(getByLabelText('Log activity'));
    expect(onActivityPress).toHaveBeenCalledTimes(1);
  });

  it('calls onWeightPress when weight button tapped', () => {
    const onWeightPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={true} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={onWeightPress} />,
    );
    fireEvent.press(getByLabelText('Log weight'));
    expect(onWeightPress).toHaveBeenCalledTimes(1);
  });
});
