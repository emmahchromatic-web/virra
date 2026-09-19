import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router:               { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ logId: 'log-1', mealType: 'lunch' }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-camera', () => ({
  CameraView:           () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('@/lib/commonFoods', () => ({
  // Empty local results for every query, so a 3+ character query always
  // reaches the remote OFF branch this test is exercising.
  searchCommonFoods: () => [],
  scaleFood:         (f: any) => f,
}));
jest.mock('@/lib/myFoods', () => ({ searchMyFoods: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/notifications', () => ({ cancelNutritionReminderForMeal: jest.fn() }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

// Every Supabase read fails the way it does with no signal: supabase-js does not
// throw, it resolves with data null and an error. This covers the favourites
// and meal-combo prefetches this screen also makes; neither is under test here.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ then: (cb: any) => cb({ data: [], error: null }), limit: () => ({ then: (cb: any) => cb({ data: [], error: null }) }) }),
        }),
      }),
    }),
  },
}));

const mockNet = { offline: true };
const sampleFood = {
  id: 'off-123', name: 'Porridge oats', unit: 'g', serving_g: 100,
  calories: 350, carbs_g: 60, protein_g: 12, fat_g: 7, fibre_g: 9,
};
jest.mock('@/lib/openFoodFacts', () => ({
  lookupBarcode: jest.fn(),
  searchByName: jest.fn((q: string) => {
    if (mockNet.offline) return Promise.reject(new Error('TypeError: Network request failed'));
    return Promise.resolve(q === 'porridge' ? [sampleFood] : []);
  }),
}));

import FoodSearchScreen from '@/app/(app)/food-search';

beforeEach(() => { mockNet.offline = true; });

/**
 * Card 7 (offline sweep). Open Food Facts search is a live remote call by
 * design (no local cache in this plan's scope) -- but a network failure used
 * to clear remoteResults exactly like a genuine zero-match search, so "No
 * results for {query}" quietly lied about the search having actually run.
 */
describe('food-search OFF search with no signal', () => {
  it('says search needs signal instead of claiming no results, and Try again re-searches', async () => {
    const utils = render(<FoodSearchScreen />);
    fireEvent.changeText(utils.getByPlaceholderText('Search foods…'), 'porridge');

    await waitFor(() => expect(utils.getByText('Search needs signal to load.')).toBeTruthy());
    expect(utils.queryByText('No results for "porridge"')).toBeNull();

    mockNet.offline = false;
    await act(async () => { fireEvent.press(utils.getByText('Try again')); });

    await waitFor(() => expect(utils.getByText('Porridge oats')).toBeTruthy());
    expect(utils.queryByText('Search needs signal to load.')).toBeNull();
  });

  it('with signal and a genuine zero-match search, still says no results', async () => {
    mockNet.offline = false;
    const utils = render(<FoodSearchScreen />);
    fireEvent.changeText(utils.getByPlaceholderText('Search foods…'), 'xyznotfound');
    await waitFor(() => expect(utils.getByText('No results for "xyznotfound"')).toBeTruthy());
    expect(utils.queryByText('Search needs signal to load.')).toBeNull();
  });
});
