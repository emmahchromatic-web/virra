import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: any[]) => mockBack(...a) },
  useLocalSearchParams: () => ({ id: 'batch-and-freeze' }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));

const mockSession = { user: { id: 'u1' } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: mockSession }) }));

const mockFetchRecipes = jest.fn();
const mockFetchPrefs   = jest.fn();
jest.mock('@/lib/recipes', () => {
  const actual = jest.requireActual('@/lib/recipes');
  return {
    ...actual,
    fetchRecipes:      (...a: any[]) => mockFetchRecipes(...a),
    fetchDietaryPrefs: (...a: any[]) => mockFetchPrefs(...a),
  };
});

import CollectionScreen from '@/app/(app)/collection/[id]';

function recipe(over: Partial<any> = {}) {
  return {
    id: 'r1', name: 'Mini Frittata Bites',
    collection: 'batch-and-freeze', collectionLabel: 'Batch and freeze',
    intro: null, meal_types: ['breakfast'], phases: [], loads: [], dietary: [],
    serves: 1, prepMinutes: 10, cookMinutes: 20, imageUrl: null, minTier: null,
    calories: 110, carbs_g: 2, protein_g: 11, fat_g: 6, fibre_g: 0,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchPrefs.mockResolvedValue([]);
  mockFetchRecipes.mockResolvedValue([recipe()]);
});

describe('a collection screen', () => {
  it('shows the collection name, its count and its recipes', async () => {
    mockFetchRecipes.mockResolvedValue([
      recipe({ id: 'r1', name: 'Mini Frittata Bites' }),
      recipe({ id: 'r2', name: 'Red Lentil Soup' }),
    ]);
    const { findByText, getByText } = render(<CollectionScreen />);
    expect(await findByText('Batch and freeze')).toBeTruthy();
    expect(getByText('2 RECIPES')).toBeTruthy();
    expect(getByText('Red Lentil Soup')).toBeTruthy();
  });

  it('only lists recipes from this collection', async () => {
    mockFetchRecipes.mockResolvedValue([
      recipe({ id: 'r1', name: 'Mini Frittata Bites' }),
      recipe({ id: 'r9', name: 'Race Morning Bagel', collection: 'pre-run', collectionLabel: 'Pre-run' }),
    ]);
    const { findByText, queryByText } = render(<CollectionScreen />);
    await findByText('Mini Frittata Bites');
    expect(queryByText('Race Morning Bagel')).toBeNull();
  });

  // The dietary prompt promises the book is filtered. Until now only the rails
  // honoured that, which made the promise misleading once collections became a
  // place you deliberately go.
  describe('the dietary filter', () => {
    const twoOfWhichOneFits = () => {
      mockFetchPrefs.mockResolvedValue(['vegetarian']);
      mockFetchRecipes.mockResolvedValue([
        recipe({ id: 'r1', name: 'Veg Frittata', dietary: ['vegetarian'] }),
        recipe({ id: 'r2', name: 'Bacon Hash',   dietary: [] }),
      ]);
    };

    it('hides what does not fit, and says how much it held back', async () => {
      twoOfWhichOneFits();
      const { findByText, queryByText } = render(<CollectionScreen />);
      expect(await findByText(/Showing 1 of 2/)).toBeTruthy();
      expect(queryByText('Bacon Hash')).toBeNull();
      expect(queryByText('Veg Frittata')).toBeTruthy();
    });

    it('shows everything when the escape hatch is used, and offers the way back', async () => {
      twoOfWhichOneFits();
      const { findByText, getByText } = render(<CollectionScreen />);
      fireEvent.press(await findByText('Show everything'));
      expect(getByText('Bacon Hash')).toBeTruthy();
      expect(getByText(/Showing all 2/)).toBeTruthy();
      expect(getByText('Filter to what fits me')).toBeTruthy();
    });

    it('says nothing about filtering when nothing was filtered', async () => {
      const { findByText, queryByText } = render(<CollectionScreen />);
      await findByText('Batch and freeze');
      expect(queryByText(/Showing/)).toBeNull();
    });

    it('explains an empty collection rather than looking broken', async () => {
      mockFetchPrefs.mockResolvedValue(['vegan']);
      mockFetchRecipes.mockResolvedValue([recipe({ name: 'Bacon Hash', dietary: [] })]);
      const { findByText } = render(<CollectionScreen />);
      expect(await findByText(/Nothing here fits what you do not eat/)).toBeTruthy();
    });
  });
});
