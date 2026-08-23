import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NutritionArcCard } from '@/components/ui/NutritionArcCard';
import type { NutritionTotals } from '@/lib/dashboardData';

const base: NutritionTotals = {
  caloriesLogged: 1400, caloriesTarget: 2300,
  carbsLogged:    180,  carbsTarget:    275,
  proteinLogged:  80,   proteinTarget:  130,
  fatLogged:      50,   fatTarget:      72,
};

describe('NutritionArcCard', () => {
  it('renders the FUELLING TODAY kicker', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('FUELLING TODAY')).toBeTruthy();
  });

  it('shows the calorie percentage', () => {
    // 1400/2300 ≈ 61%
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('61%')).toBeTruthy();
  });

  it('shows macro gram values', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('180g')).toBeTruthy();
    expect(getByText('80g')).toBeTruthy();
    expect(getByText('50g')).toBeTruthy();
  });

  it('shows 0% when nothing logged', () => {
    const empty: NutritionTotals = { ...base, caloriesLogged: 0, carbsLogged: 0, proteinLogged: 0, fatLogged: 0 };
    const { getByText } = render(<NutritionArcCard totals={empty} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('caps percentage display at 100%', () => {
    const over: NutritionTotals = { ...base, caloriesLogged: 9999, caloriesTarget: 2300 };
    const { getByText } = render(<NutritionArcCard totals={over} />);
    expect(getByText('100%')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(<NutritionArcCard totals={base} onPress={onPress} />);
    fireEvent.press(getByLabelText('Fuelling today, open nutrition'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without onPress (non-pressable)', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('FUELLING TODAY')).toBeTruthy();
  });
});
