import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: any[]) => mockPush(...a), back: (...a: any[]) => mockBack(...a) },
  useLocalSearchParams: () => ({ slug: 'r1' }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@react-navigation/native', () => ({
  // Fire once on mount. Calling the callback inline on every render would
  // re-run the slot-totals fetch, which sets state, which renders again.
  useFocusEffect: (cb: any) => require('react').useEffect(cb, []),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/components/layout/AppHeader', () => ({
  AppHeader: ({ title }: any) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

// The session object must be referentially STABLE across renders. Zustand
// returns the same state object until it changes, and the screen's load effect
// lists `session` in its deps: a fresh object each render would re-run the
// fetch, set state, and render again, forever.
const mockSession   = { user: { id: 'u1' } };
const mockCycleInfo = { phase: 'luteal' };
jest.mock('@/store/auth',   () => ({ useAuthStore:  () => ({ session: mockSession }) }));
jest.mock('@/store/cycle',  () => ({ useCycleStore: () => ({ cycleInfo: mockCycleInfo }) }));
jest.mock('@/store/profile', () => ({
  useProfileStore:       () => ({}),
  personalMetricsFields: () => ({}),
}));
jest.mock('@/lib/dailyTrainingContext', () => ({
  getDailyTrainingContext: jest.fn().mockResolvedValue({ inferred_load: 'moderate' }),
}));

const mockFetchRecipes = jest.fn();
const mockSlotTotals   = jest.fn();
const mockFetchPrefs   = jest.fn();
const mockSavePrefs    = jest.fn();
const mockFetchDetail  = jest.fn();
const mockLogRecipe    = jest.fn();
const mockFetchFavs    = jest.fn();
const mockToggleFav    = jest.fn();
jest.mock('@/lib/recipes', () => {
  const actual = jest.requireActual('@/lib/recipes');
  return {
    ...actual,
    fetchRecipes:      (...a: any[]) => mockFetchRecipes(...a),
    fetchSlotTotals:   (...a: any[]) => mockSlotTotals(...a),
    fetchDietaryPrefs: (...a: any[]) => mockFetchPrefs(...a),
    saveDietaryPrefs:  (...a: any[]) => mockSavePrefs(...a),
    fetchRecipeDetail: (...a: any[]) => mockFetchDetail(...a),
    logRecipe:         (...a: any[]) => mockLogRecipe(...a),
    fetchFavouriteIds: (...a: any[]) => mockFetchFavs(...a),
    toggleFavourite:   (...a: any[]) => mockToggleFav(...a),
  };
});

const mockGetLogId = jest.fn();
jest.mock('@/lib/nutritionLog', () => ({
  ...jest.requireActual('@/lib/nutritionLog'),
  getOrCreateTodayLogId: (...a: any[]) => mockGetLogId(...a),
}));

const mockCancelReminder = jest.fn();
jest.mock('@/lib/notifications', () => ({
  cancelNutritionReminderForMeal: (...a: any[]) => mockCancelReminder(...a),
}));

const mockAppAlert = jest.fn();
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: (...a: any[]) => mockAppAlert(...a) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import RecipesScreen from '@/app/(app)/(tabs)/recipes';
import RecipeDetailScreen from '@/app/(app)/recipe/[slug]';
import { AppTabBar } from '@/components/layout/AppTabBar';

function recipe(over: Partial<any> = {}) {
  return {
    id: 'r1', name: 'Mini Frittata Bites',
    collection: 'batch-and-freeze', collectionLabel: 'Batch and freeze',
    intro: 'Six of these in the fridge.', meal_types: ['breakfast', 'lunch', 'dinner', 'snack'],
    phases: [], loads: [], dietary: [], serves: 6,
    prepMinutes: 10, cookMinutes: 20, imageUrl: null, minTier: null,
    calories: 110, carbs_g: 2, protein_g: 11, fat_g: 6, fibre_g: 0.4,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchRecipes.mockResolvedValue([recipe()]);
  mockSlotTotals.mockResolvedValue({ calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 });
  mockFetchPrefs.mockResolvedValue([]);
  mockSavePrefs.mockResolvedValue(true);
  mockFetchFavs.mockResolvedValue([]);
  mockToggleFav.mockImplementation((_u, _r, next) => Promise.resolve(next));
  mockLogRecipe.mockResolvedValue(null);
  mockGetLogId.mockResolvedValue('log-1');
});

const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('the Recipes tab', () => {
  it('is headed Recipes and lists what came back', async () => {
    const { getByText, findAllByText } = render(<RecipesScreen />);
    expect(getByText('Recipes')).toBeTruthy();
    expect((await findAllByText('Mini Frittata Bites')).length).toBeGreaterThan(0);
  });

  it('no longer says COMING SOON', async () => {
    const { queryByText } = render(<RecipesScreen />);
    await flush();
    expect(queryByText('COMING SOON')).toBeNull();
  });

  it('carries no em-dashes, per the copy rule', async () => {
    const { toJSON } = render(<RecipesScreen />);
    await flush();
    expect(JSON.stringify(toJSON())).not.toMatch(/—/);
  });

  it('opens the detail screen when a recipe is tapped', async () => {
    const { findAllByLabelText } = render(<RecipesScreen />);
    fireEvent.press((await findAllByLabelText('Open Mini Frittata Bites'))[0]);
    expect(mockPush).toHaveBeenCalledWith('/(app)/recipe/r1');
  });

  it('says so plainly when the book is empty rather than showing bare rails', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    const { findByText } = render(<RecipesScreen />);
    expect(await findByText('NOTHING HERE YET')).toBeTruthy();
  });

  // The "for your phase" rail must not be padded with untagged recipes, so
  // with nothing tagged to luteal it should be absent entirely.
  it('hides the phase rail when no recipe is tagged to the current phase', async () => {
    const { queryByText, findAllByText } = render(<RecipesScreen />);
    await findAllByText('Mini Frittata Bites');
    expect(queryByText('FOR YOUR PHASE')).toBeNull();
  });

  it('shows the phase rail when a recipe is tagged to it', async () => {
    mockFetchRecipes.mockResolvedValue([recipe({ phases: ['luteal'] })]);
    const { findByText } = render(<RecipesScreen />);
    expect(await findByText('FOR YOUR PHASE')).toBeTruthy();
  });

  describe('search', () => {
    it('filters to matches and hides the collections while searching', async () => {
      mockFetchRecipes.mockResolvedValue([recipe(), recipe({ id: 'r2', name: 'Fruity Cous Cous' })]);
      const { findByLabelText, getByText, queryByText } = render(<RecipesScreen />);
      fireEvent.changeText(await findByLabelText('Search recipes'), 'cous');
      await waitFor(() => expect(getByText('1 RECIPE')).toBeTruthy());
      expect(getByText('Fruity Cous Cous')).toBeTruthy();
      expect(queryByText('Mini Frittata Bites')).toBeNull();
    });

    it('says nothing matched rather than showing an empty list', async () => {
      const { findByLabelText, getByText } = render(<RecipesScreen />);
      fireEvent.changeText(await findByLabelText('Search recipes'), 'zzzz');
      await waitFor(() => expect(getByText(/Nothing matches that/)).toBeTruthy());
    });
  });

  describe('the first-open dietary prompt', () => {
    it('asks once when nothing is stored', async () => {
      const { findByText } = render(<RecipesScreen />);
      expect(await findByText('Anything you do not eat?')).toBeTruthy();
    });

    it('does not ask when preferences are already stored', async () => {
      mockFetchPrefs.mockResolvedValue(['vegetarian']);
      const { queryByText, findAllByText } = render(<RecipesScreen />);
      await findAllByText('Mini Frittata Bites');
      expect(queryByText('Anything you do not eat?')).toBeNull();
    });

    it('saves what was picked', async () => {
      const { findByText, getByLabelText } = render(<RecipesScreen />);
      await findByText('Anything you do not eat?');
      fireEvent.press(getByLabelText('Vegetarian'));
      fireEvent.press(getByLabelText('Save'));
      await waitFor(() => expect(mockSavePrefs).toHaveBeenCalledWith('u1', ['vegetarian']));
    });

    // Skipping must not write an empty array over anything, and must not
    // re-ask within the same session.
    it('writes nothing when skipped', async () => {
      const { findByText, getByLabelText, queryByText } = render(<RecipesScreen />);
      await findByText('Anything you do not eat?');
      fireEvent.press(getByLabelText('Skip'));
      await waitFor(() => expect(queryByText('Anything you do not eat?')).toBeNull());
      expect(mockSavePrefs).not.toHaveBeenCalled();
    });
  });
});

describe('the recipe detail screen', () => {
  const detail = {
    ...recipe(),
    ingredients: [
      { position: 1, groupLabel: null, foodName: 'Medium eggs', quantity: 300, unit: 'g',
        note: '6 eggs', commonFoodId: 'whole-egg-raw',
        calories: 429, carbs_g: 2.1, protein_g: 37.5, fat_g: 29.1, fibre_g: 0 },
    ],
    steps: [{ position: 1, body: 'Preheat the oven to 180C, fan assisted.', timerSeconds: null }],
  };

  beforeEach(() => { mockFetchDetail.mockResolvedValue(detail); });

  it('shows the recipe, its ingredients and its method', async () => {
    const { findByText, getByText } = render(<RecipeDetailScreen />);
    expect(await findByText('Mini Frittata Bites')).toBeTruthy();
    expect(getByText('Medium eggs')).toBeTruthy();
    expect(getByText('Preheat the oven to 180C, fan assisted.')).toBeTruthy();
  });

  // One serving of a recipe that makes six is a sixth of the ingredient list.
  it('opens on one serving, scaling ingredients down from what the recipe makes', async () => {
    const { findByText } = render(<RecipeDetailScreen />);
    expect(await findByText('50 g')).toBeTruthy();   // 300 g across 6 servings
  });

  it('scales macros and ingredients together when servings change', async () => {
    const { findByLabelText, getByText, queryByText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('More servings'));   // 1 -> 1.5
    await waitFor(() => expect(getByText('75 g')).toBeTruthy());
    expect(queryByText('50 g')).toBeNull();
    expect(getByText('165')).toBeTruthy();                     // 110 kcal x 1.5
  });

  it('will not go below half a serving', async () => {
    const { findByLabelText, getByText } = render(<RecipeDetailScreen />);
    const minus = await findByLabelText('Fewer servings');
    fireEvent.press(minus);
    fireEvent.press(minus);
    fireEvent.press(minus);
    await waitFor(() => expect(getByText('0.5')).toBeTruthy());
  });

  // Null fibre means "not known", and rendering it as 0 would be a claim we
  // cannot support.
  it('shows a dash for unknown fibre rather than zero', async () => {
    mockFetchDetail.mockResolvedValue({ ...detail, fibre_g: null });
    const { findByText } = render(<RecipeDetailScreen />);
    expect(await findByText('-')).toBeTruthy();
  });

  it('says so when the slug is not in the book', async () => {
    mockFetchDetail.mockResolvedValue(null);
    const { findByText } = render(<RecipeDetailScreen />);
    expect(await findByText('That recipe is not in the book.')).toBeTruthy();
  });
});

describe('logging a recipe', () => {
  const detail = {
    ...recipe(),
    ingredients: [],
    steps: [],
  };

  beforeEach(() => { mockFetchDetail.mockResolvedValue(detail); });

  it('writes one entry carrying exactly the macros on screen', async () => {
    const { findByLabelText, getByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('Log as lunch'));
    fireEvent.press(getByLabelText(/^Log this/));
    await waitFor(() => expect(mockLogRecipe).toHaveBeenCalledWith({
      logId: 'log-1', mealType: 'lunch', recipe: detail, servings: 1,
    }));
  });

  // The button quotes a calorie figure. Logging a different number than the
  // one on the button would be the worst possible bug in this screen.
  it('logs the scaled servings, not the recipe as written', async () => {
    const { findByLabelText, getByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('More servings'));   // 1 -> 1.5
    fireEvent.press(getByLabelText(/^Log this/));
    await waitFor(() =>
      expect(mockLogRecipe).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5 })));
  });

  it('goes back once the entry is written, and raises nothing', async () => {
    const { findByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText(/^Log this/));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockAppAlert).not.toHaveBeenCalled();
  });

  it('clears the meal reminder for a real meal but not for a snack', async () => {
    const { findByLabelText, getByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('Log as dinner'));
    fireEvent.press(getByLabelText(/^Log this/));
    await waitFor(() => expect(mockCancelReminder).toHaveBeenCalledWith('dinner'));

    mockCancelReminder.mockClear();
    fireEvent.press(getByLabelText('Log as snack'));
    fireEvent.press(getByLabelText(/^Log this/));
    await waitFor(() => expect(mockLogRecipe).toHaveBeenCalledTimes(2));
    expect(mockCancelReminder).not.toHaveBeenCalled();
  });

  it('says so and stays put when the write fails', async () => {
    mockLogRecipe.mockResolvedValue('network is down');
    const { findByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText(/^Log this/));
    await waitFor(() => expect(mockAppAlert).toHaveBeenCalledWith('Could not log that', 'network is down'));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not write an entry when today\'s log cannot be opened', async () => {
    mockGetLogId.mockResolvedValue(null);
    const { findByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText(/^Log this/));
    await waitFor(() => expect(mockAppAlert).toHaveBeenCalled());
    expect(mockLogRecipe).not.toHaveBeenCalled();
  });
});

describe('favourites', () => {
  const detail = { ...recipe(), ingredients: [], steps: [] };
  beforeEach(() => { mockFetchDetail.mockResolvedValue(detail); });

  it('saves a recipe and shows it as saved', async () => {
    const { findByLabelText, getByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('Save to favourites'));
    await waitFor(() => expect(mockToggleFav).toHaveBeenCalledWith('u1', 'r1', true));
    expect(getByLabelText('Remove from favourites')).toBeTruthy();
  });

  it('opens already saved when it is a favourite', async () => {
    mockFetchFavs.mockResolvedValue(['r1']);
    const { findByLabelText } = render(<RecipeDetailScreen />);
    expect(await findByLabelText('Remove from favourites')).toBeTruthy();
  });

  // Optimistic, so a failure has to put the heart back or the screen would
  // claim something the database does not hold.
  it('rolls the heart back when the write fails', async () => {
    mockToggleFav.mockResolvedValue(null);
    const { findByLabelText, getByLabelText } = render(<RecipeDetailScreen />);
    fireEvent.press(await findByLabelText('Save to favourites'));
    await waitFor(() => expect(mockAppAlert).toHaveBeenCalled());
    expect(getByLabelText('Save to favourites')).toBeTruthy();
  });

  it('gives saved recipes their own rail on the tab', async () => {
    mockFetchFavs.mockResolvedValue(['r1']);
    const { findByText } = render(<RecipesScreen />);
    expect(await findByText('SAVED')).toBeTruthy();
  });

  it('has no saved rail when nothing is saved', async () => {
    const { queryByText, findAllByText } = render(<RecipesScreen />);
    await findAllByText('Mini Frittata Bites');
    expect(queryByText('SAVED')).toBeNull();
  });
});

describe('the tab bar', () => {
  // The route was renamed from 'library', so the label map has to follow it or
  // the tab silently falls back to showing its raw route name.
  const state = {
    index: 0,
    routes: [
      { key: 'index-1',     name: 'index' },
      { key: 'training-1',  name: 'training' },
      { key: 'nutrition-1', name: 'nutrition' },
      { key: 'recipes-1',   name: 'recipes' },
    ],
  };

  it('labels the fourth tab Recipes, not Library or the bare route name', () => {
    const { getByText, queryByText } = render(
      <AppTabBar state={state as any} navigation={{ navigate: jest.fn() } as any} descriptors={{} as any} insets={{} as any} />,
    );
    expect(getByText('Recipes')).toBeTruthy();
    expect(queryByText('Library')).toBeNull();
    expect(queryByText('recipes')).toBeNull();
  });
});
