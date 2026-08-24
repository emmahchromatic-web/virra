import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router:               { push: (...args: any[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ logId: 'log-1', mealType: 'lunch' }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-camera', () => ({
  CameraView:           () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('@/lib/commonFoods', () => ({
  searchCommonFoods: () => [],
  scaleFood:         (f: any) => f,
}));
jest.mock('@/lib/openFoodFacts', () => ({ lookupBarcode: jest.fn(), searchByName: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ cancelNutritionReminderForMeal: jest.fn() }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn() }));

function mockThenableChain() {
  return { then: (cb: any) => cb({ data: [] }) };
}
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ ...mockThenableChain(), limit: () => mockThenableChain() }),
        }),
      }),
    }),
  },
}));

import FoodSearchScreen from '@/app/(app)/food-search';

// Regression test: food-search's "Describe a meal" button once sent the
// active meal under the route param `activeMeal`, but describe-meal.tsx
// reads `mealType`. That mismatch made mealType undefined on every save
// reached this way, which violates food_entries.meal_type's NOT NULL
// constraint and made Save silently fail. The other call site
// (FoodEntryEditModal's re-estimate) already used the right key — this pins
// the one that didn't.
describe('food-search -> describe-meal navigation', () => {
  it('sends the active meal as `mealType`, the key describe-meal.tsx actually reads', () => {
    const { getByText } = render(<FoodSearchScreen />);
    fireEvent.press(getByText('Describe a meal'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const call = mockPush.mock.calls[0][0];
    expect(call.pathname).toBe('/(app)/describe-meal');
    expect(call.params).toMatchObject({ mealType: 'lunch' });
    expect(call.params).not.toHaveProperty('activeMeal');
  });
});
