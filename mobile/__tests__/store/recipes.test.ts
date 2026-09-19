import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFetchRecipes      = jest.fn();
const mockFetchRecipeDetail = jest.fn();
const mockFetchFavouriteIds = jest.fn();
const mockToggleFavourite   = jest.fn();

jest.mock('@/lib/recipes', () => ({
  fetchRecipes:      (...a: any[]) => mockFetchRecipes(...a),
  fetchRecipeDetail: (...a: any[]) => mockFetchRecipeDetail(...a),
  fetchFavouriteIds: (...a: any[]) => mockFetchFavouriteIds(...a),
  toggleFavourite:   (...a: any[]) => mockToggleFavourite(...a),
}));

import { useRecipesStore } from '@/store/recipes';

function recipe(over: Partial<any> = {}) {
  return {
    id: 'r1', name: 'Mini Frittata Bites', collection: 'batch-and-freeze',
    collectionLabel: 'Batch and freeze', intro: null, meal_types: [], phases: [], loads: [],
    dietary: [], serves: 6, prepMinutes: 10, cookMinutes: 20, imageUrl: null, minTier: null,
    calories: 110, carbs_g: 2, protein_g: 11, fat_g: 6, fibre_g: 0.4,
    ...over,
  };
}

const detail = { ...recipe(), ingredients: [], steps: [] };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  useRecipesStore.setState({
    list: [], listFetchedAt: null, details: {}, favouriteIds: [], favouritesFetchedAt: null,
  });
});

describe('recipes store persistence', () => {
  it('hydrates the cached list, details and favourites from storage before any network call', async () => {
    await AsyncStorage.setItem('virra:recipes:v1', JSON.stringify({
      state: {
        list: [recipe()],
        listFetchedAt: '2026-09-18T08:00:00.000Z',
        details: { r1: { detail, fetchedAt: '2026-09-18T08:00:00.000Z' } },
        favouriteIds: ['r1'],
        favouritesFetchedAt: '2026-09-18T08:00:00.000Z',
      },
      version: 1,
    }));

    await useRecipesStore.persist.rehydrate();

    expect(useRecipesStore.getState().list).toEqual([recipe()]);
    expect(useRecipesStore.getState().details.r1.detail).toEqual(detail);
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
    expect(mockFetchRecipes).not.toHaveBeenCalled();
    expect(mockFetchRecipeDetail).not.toHaveBeenCalled();
    expect(mockFetchFavouriteIds).not.toHaveBeenCalled();
  });

  it('persists list/details/favourites and excludes the action functions', async () => {
    mockFetchRecipes.mockResolvedValue([recipe()]);
    await useRecipesStore.getState().refreshList();
    await new Promise((r) => setTimeout(r, 0));

    const raw = await AsyncStorage.getItem('virra:recipes:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.list).toEqual([recipe()]);
    expect(parsed.state.refreshList).toBeUndefined();
    expect(parsed.state.toggleFavourite).toBeUndefined();
  });
});

describe('recipes store refreshList()', () => {
  it('replaces the cached list with fresh server data on success', async () => {
    mockFetchRecipes.mockResolvedValue([recipe(), recipe({ id: 'r2', name: 'Fruity Cous Cous' })]);
    await useRecipesStore.getState().refreshList();

    expect(useRecipesStore.getState().list).toHaveLength(2);
    expect(useRecipesStore.getState().listFetchedAt).not.toBeNull();
  });

  it('a rejected refresh leaves the cached list and listFetchedAt untouched', async () => {
    useRecipesStore.setState({ list: [recipe()], listFetchedAt: '2026-09-18T08:00:00.000Z' });
    mockFetchRecipes.mockRejectedValue(new Error('offline'));

    await useRecipesStore.getState().refreshList();

    expect(useRecipesStore.getState().list).toEqual([recipe()]);
    expect(useRecipesStore.getState().listFetchedAt).toBe('2026-09-18T08:00:00.000Z');
  });

  // fetchRecipes() itself degrades to [] on a Supabase error rather than
  // throwing (see recipes.ts's own doc comment) -- the store can't tell that
  // apart from a genuinely empty book by return value alone, so a
  // non-empty -> empty transition is treated as a suspected failure and the
  // existing cache is kept. See recipes.ts (the store)'s header comment.
  it('treats a non-empty cache going to empty as a suspected failure and keeps the old list', async () => {
    useRecipesStore.setState({ list: [recipe()], listFetchedAt: '2026-09-18T08:00:00.000Z' });
    mockFetchRecipes.mockResolvedValue([]);

    await useRecipesStore.getState().refreshList();

    expect(useRecipesStore.getState().list).toEqual([recipe()]);
    expect(useRecipesStore.getState().listFetchedAt).toBe('2026-09-18T08:00:00.000Z');
  });

  it('accepts an empty result when nothing was cached yet', async () => {
    mockFetchRecipes.mockResolvedValue([]);
    await useRecipesStore.getState().refreshList();

    expect(useRecipesStore.getState().list).toEqual([]);
    expect(useRecipesStore.getState().listFetchedAt).not.toBeNull();
  });
});

describe('recipes store refreshDetail()', () => {
  it('fills the cached detail on success, keyed by id', async () => {
    mockFetchRecipeDetail.mockResolvedValue(detail);
    await useRecipesStore.getState().refreshDetail('r1');

    expect(useRecipesStore.getState().details.r1.detail).toEqual(detail);
    expect(useRecipesStore.getState().details.r1.fetchedAt).toBeTruthy();
  });

  it('a rejected refresh leaves an existing cached detail untouched', async () => {
    useRecipesStore.setState({ details: { r1: { detail, fetchedAt: '2026-09-18T08:00:00.000Z' } } });
    mockFetchRecipeDetail.mockRejectedValue(new Error('offline'));

    await useRecipesStore.getState().refreshDetail('r1');

    expect(useRecipesStore.getState().details.r1).toEqual({ detail, fetchedAt: '2026-09-18T08:00:00.000Z' });
  });

  it('a null result (fetchRecipeDetail\'s degrade-on-failure or not-found) leaves an existing cached detail untouched', async () => {
    useRecipesStore.setState({ details: { r1: { detail, fetchedAt: '2026-09-18T08:00:00.000Z' } } });
    mockFetchRecipeDetail.mockResolvedValue(null);

    await useRecipesStore.getState().refreshDetail('r1');

    expect(useRecipesStore.getState().details.r1).toEqual({ detail, fetchedAt: '2026-09-18T08:00:00.000Z' });
  });
});

describe('recipes store refreshFavourites()', () => {
  it('replaces the cached favourite ids on success', async () => {
    mockFetchFavouriteIds.mockResolvedValue(['r1', 'r2']);
    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1', 'r2']);
    expect(useRecipesStore.getState().favouritesFetchedAt).not.toBeNull();
  });

  it('a rejected refresh leaves cached favourite ids untouched', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1'], favouritesFetchedAt: '2026-09-18T08:00:00.000Z' });
    mockFetchFavouriteIds.mockRejectedValue(new Error('offline'));

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
    expect(useRecipesStore.getState().favouritesFetchedAt).toBe('2026-09-18T08:00:00.000Z');
  });

  it('treats non-empty -> empty as a suspected failure and keeps the cached favourite ids', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1'], favouritesFetchedAt: '2026-09-18T08:00:00.000Z' });
    mockFetchFavouriteIds.mockResolvedValue([]);

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });
});

describe('recipes store toggleFavourite()', () => {
  it('flips favouriteIds optimistically before the write resolves', async () => {
    let resolveWrite: (v: boolean | null) => void = () => {};
    mockToggleFavourite.mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }));

    const promise = useRecipesStore.getState().toggleFavourite('u1', 'r1', true);
    // The optimistic flip must be visible synchronously, before the write settles.
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);

    resolveWrite(true);
    await promise;
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });

  it('reverts favouriteIds to the pre-toggle snapshot when the write fails', async () => {
    useRecipesStore.setState({ favouriteIds: [] });
    mockToggleFavourite.mockResolvedValue(null); // toggleFavouriteApi's failure signal

    const result = await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
    expect(result).toBe(false);
  });

  it('reverts an unfavourite back to favourited when the write fails', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1', 'r2'] });
    mockToggleFavourite.mockResolvedValue(null);

    const result = await useRecipesStore.getState().toggleFavourite('u1', 'r1', false);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1', 'r2']);
    expect(result).toBe(true);
  });

  it('does not duplicate an id already present when toggling on again', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1'] });
    mockToggleFavourite.mockImplementation((_u: string, _r: string, next: boolean) => Promise.resolve(next));

    await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });
});
