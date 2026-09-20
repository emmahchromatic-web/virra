import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFetchRecipes      = jest.fn();
const mockFetchRecipeDetail = jest.fn();
const mockFetchFavouriteIds = jest.fn();

jest.mock('@/lib/recipes', () => ({
  fetchRecipes:      (...a: any[]) => mockFetchRecipes(...a),
  fetchRecipeDetail: (...a: any[]) => mockFetchRecipeDetail(...a),
  fetchFavouriteIds: (...a: any[]) => mockFetchFavouriteIds(...a),
}));

const mockEnqueue     = jest.fn();
const mockReadOutbox  = jest.fn();
const mockSyncPending = jest.fn();

jest.mock('@/lib/outbox', () => ({
  enqueue:    (...a: any[]) => mockEnqueue(...a),
  readOutbox: (...a: any[]) => mockReadOutbox(...a),
}));
jest.mock('@/lib/syncPending', () => ({ syncPending: (...a: any[]) => mockSyncPending(...a) }));

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
  mockEnqueue.mockResolvedValue({ id: 'ob_1', kind: 'toggleFavourite', payload: {}, createdAt: '', attempts: 0 });
  mockReadOutbox.mockResolvedValue([]);
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

  /**
   * The read path must not undo what the write path has not sent yet.
   *
   * An enqueued-but-undrained `toggleFavourite` happens ONLINE too -- `drain()`
   * halts at the first retryable failure, so anything behind it is
   * head-of-line blocked while the app is perfectly connected. A focus-driven
   * `refreshFavourites` landing in that window would read the server's
   * pre-toggle list and flip the heart straight back: the exact bug the
   * outbox-routed toggle exists to prevent, reintroduced through the refetch.
   */
  it('keeps an optimistic favourite that is still queued in the outbox, even though the server has not caught up', async () => {
    mockReadOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'toggleFavourite', payload: { userId: 'u1', recipeId: 'r9', desiredState: true }, createdAt: '', attempts: 0 },
    ]);
    // The server list predates the toggle.
    mockFetchFavouriteIds.mockResolvedValue(['r1']);

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r9', 'r1']);
  });

  it('keeps a queued UNfavourite off the list, even though the server still reports it', async () => {
    mockReadOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'toggleFavourite', payload: { userId: 'u1', recipeId: 'r1', desiredState: false }, createdAt: '', attempts: 0 },
    ]);
    mockFetchFavouriteIds.mockResolvedValue(['r1', 'r2']);

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r2']);
  });

  it('applies queued toggles in order, so the newest intent for a recipe wins', async () => {
    mockReadOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'toggleFavourite', payload: { userId: 'u1', recipeId: 'r9', desiredState: true }, createdAt: '', attempts: 0 },
      { id: 'ob_2', kind: 'toggleFavourite', payload: { userId: 'u1', recipeId: 'r9', desiredState: false }, createdAt: '', attempts: 0 },
    ]);
    mockFetchFavouriteIds.mockResolvedValue(['r1']);

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });

  it('ignores queued items of other kinds and other users', async () => {
    mockReadOutbox.mockResolvedValue([
      { id: 'ob_1', kind: 'checkIn', payload: { user_id: 'u1' }, createdAt: '', attempts: 0 },
      { id: 'ob_2', kind: 'toggleFavourite', payload: { userId: 'u2', recipeId: 'r9', desiredState: true }, createdAt: '', attempts: 0 },
    ]);
    mockFetchFavouriteIds.mockResolvedValue(['r1']);

    await useRecipesStore.getState().refreshFavourites('u1');

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });
});

describe('recipes store toggleFavourite()', () => {
  it('flips favouriteIds optimistically before the enqueue resolves', async () => {
    let resolveEnqueue: (v: unknown) => void = () => {};
    mockEnqueue.mockImplementation(() => new Promise((resolve) => { resolveEnqueue = resolve; }));

    const promise = useRecipesStore.getState().toggleFavourite('u1', 'r1', true);
    // The optimistic flip must be visible synchronously, before enqueue settles.
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);

    resolveEnqueue({ id: 'ob_1', kind: 'toggleFavourite', payload: {}, createdAt: '', attempts: 0 });
    await promise;
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });

  it('routes the write through the outbox, not a direct Supabase call', async () => {
    await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    expect(mockEnqueue).toHaveBeenCalledWith('u1', 'toggleFavourite', {
      userId: 'u1', recipeId: 'r1', desiredState: true,
    });
  });

  it('kicks off an immediate drain attempt via syncPending after enqueueing', async () => {
    await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    expect(mockSyncPending).toHaveBeenCalledWith('u1');
  });

  it('keeps the optimistic flip even though enqueue only queues -- no revert here regardless of outcome', async () => {
    useRecipesStore.setState({ favouriteIds: [] });

    const result = await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    // Unlike the old direct-write behaviour, a mere enqueue (which can mean
    // "queued while offline") never reverts the optimistic state. Only a
    // dead-lettered item does, via revertLocalToggle -- tested below.
    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
    expect(result).toBe(true);
  });

  it('does not duplicate an id already present when toggling on again', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1'] });

    await useRecipesStore.getState().toggleFavourite('u1', 'r1', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
  });

  it('flips favouriteIds off optimistically for an unfavourite', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1', 'r2'] });

    await useRecipesStore.getState().toggleFavourite('u1', 'r1', false);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r2']);
  });

  it('guards on a missing userId before touching state or the outbox', async () => {
    useRecipesStore.setState({ favouriteIds: ['r1'] });

    const result = await useRecipesStore.getState().toggleFavourite('', 'r2', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1']);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockSyncPending).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

describe('recipes store revertLocalToggle()', () => {
  it('undoes an "on" toggle back to unfavourited when the state still matches desiredState', () => {
    useRecipesStore.setState({ favouriteIds: ['r1', 'r2'] });

    useRecipesStore.getState().revertLocalToggle('r1', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r2']);
  });

  it('undoes an "off" toggle back to favourited when the state still matches desiredState', () => {
    useRecipesStore.setState({ favouriteIds: ['r2'] });

    useRecipesStore.getState().revertLocalToggle('r1', false);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r1', 'r2']);
  });

  it('does nothing when the cached state has already moved on from desiredState', () => {
    // A later, successful toggle already flipped this back -- reverting here
    // would undo that newer, correct state rather than the stale failed one.
    useRecipesStore.setState({ favouriteIds: ['r2'] });

    useRecipesStore.getState().revertLocalToggle('r1', true);

    expect(useRecipesStore.getState().favouriteIds).toEqual(['r2']);
  });

  it('is idempotent -- calling it twice for the same dead letter does nothing the second time', () => {
    useRecipesStore.setState({ favouriteIds: ['r1'] });

    useRecipesStore.getState().revertLocalToggle('r1', true);
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);

    useRecipesStore.getState().revertLocalToggle('r1', true);
    expect(useRecipesStore.getState().favouriteIds).toEqual([]);
  });
});
