import AsyncStorage from '@react-native-async-storage/async-storage';

// A minimal chainable Supabase query-builder mock, since recentFoods.ts
// issues its own inline queries (there's no existing lib function to wrap --
// see the store's own header comment on why).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: () => builder,
    eq:     () => builder,
    gte:    () => builder,
    in:     () => builder,
    order:  () => builder,
    limit:  () => Promise.resolve(result),
    then:   (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: any[]) => mockGetUser(...a) },
    from: (...a: any[]) => mockFrom(...a),
  },
}));

import { useRecentFoods } from '@/store/recentFoods';

const entryRow = {
  food_name: 'Porridge', quantity_g: 200, quantity_unit: 'g',
  calories: 300, carbs_g: 50, protein_g: 10, fat_g: 5, fibre_g: 4,
  created_at: '2026-09-18T08:00:00.000Z',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  useRecentFoods.setState({ foods: [], fetchedAt: null });
});

function mockLogsThenEntries(logIds: string[], entries: any[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'nutrition_logs') {
      return makeQueryBuilder({ data: logIds.map((id) => ({ id })), error: null });
    }
    if (table === 'food_entries') {
      return makeQueryBuilder({ data: entries, error: null });
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('recentFoods store persistence', () => {
  it('hydrates cached foods from storage before any network call', async () => {
    await AsyncStorage.setItem('virra:recent_foods:v1', JSON.stringify({
      state: {
        foods: [{
          name: 'Porridge', unit: 'g', lastPortionG: 200,
          calories: 150, carbs_g: 25, protein_g: 5, fat_g: 2.5, fibre_g: 2,
          lastUsedAt: '2026-09-18T08:00:00.000Z',
        }],
        fetchedAt: '2026-09-18T08:00:00.000Z',
      },
      version: 1,
    }));

    await useRecentFoods.persist.rehydrate();

    expect(useRecentFoods.getState().foods).toHaveLength(1);
    expect(useRecentFoods.getState().foods[0].name).toBe('Porridge');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('persists foods/fetchedAt and excludes the refresh function', async () => {
    mockLogsThenEntries(['log1'], [entryRow]);
    await useRecentFoods.getState().refresh();
    await new Promise((r) => setTimeout(r, 0));

    const raw = await AsyncStorage.getItem('virra:recent_foods:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.foods).toHaveLength(1);
    expect(parsed.state.refresh).toBeUndefined();
  });
});

describe('recentFoods store refresh()', () => {
  it('scales a logged entry to a per-100g basis, deduped by food name, newest first', async () => {
    mockLogsThenEntries(['log1'], [
      entryRow,
      { ...entryRow, food_name: 'porridge', created_at: '2026-09-17T08:00:00.000Z' }, // dup, older
      { ...entryRow, food_name: 'Chicken salad', quantity_g: 350, calories: 450, carbs_g: 20, protein_g: 40, fat_g: 15, fibre_g: 6 },
    ]);

    await useRecentFoods.getState().refresh();

    const foods = useRecentFoods.getState().foods;
    expect(foods).toHaveLength(2);
    expect(foods[0].name).toBe('Porridge');
    expect(foods[0].calories).toBe(150); // 300 kcal / 200g * 100
    expect(foods[0].lastPortionG).toBe(200);
    expect(useRecentFoods.getState().fetchedAt).not.toBeNull();
  });

  it('skips an entry with no recorded portion, same rule as myFoods.ts', async () => {
    mockLogsThenEntries(['log1'], [{ ...entryRow, quantity_g: null }]);

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods).toEqual([]);
  });

  it('a day with no nutrition_logs rows resolves as a legitimate empty cache, not a failure', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'nutrition_logs') return makeQueryBuilder({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods).toEqual([]);
    expect(useRecentFoods.getState().fetchedAt).not.toBeNull();
  });

  it('a failed nutrition_logs read leaves the existing cache untouched', async () => {
    useRecentFoods.setState({
      foods: [{ name: 'Porridge', unit: 'g', lastPortionG: 200, calories: 150, carbs_g: 25, protein_g: 5, fat_g: 2.5, fibre_g: 2, lastUsedAt: '2026-09-18T08:00:00.000Z' }],
      fetchedAt: '2026-09-18T08:00:00.000Z',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'nutrition_logs') return makeQueryBuilder({ data: null, error: { message: 'offline' } });
      throw new Error(`unexpected table ${table}`);
    });

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods).toHaveLength(1);
    expect(useRecentFoods.getState().fetchedAt).toBe('2026-09-18T08:00:00.000Z');
  });

  it('a failed food_entries read leaves the existing cache untouched', async () => {
    useRecentFoods.setState({
      foods: [{ name: 'Porridge', unit: 'g', lastPortionG: 200, calories: 150, carbs_g: 25, protein_g: 5, fat_g: 2.5, fibre_g: 2, lastUsedAt: '2026-09-18T08:00:00.000Z' }],
      fetchedAt: '2026-09-18T08:00:00.000Z',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'nutrition_logs') return makeQueryBuilder({ data: [{ id: 'log1' }], error: null });
      if (table === 'food_entries')  return makeQueryBuilder({ data: null, error: { message: 'offline' } });
      throw new Error(`unexpected table ${table}`);
    });

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods).toHaveLength(1);
    expect(useRecentFoods.getState().fetchedAt).toBe('2026-09-18T08:00:00.000Z');
  });

  it('a refresh with no signed-in user leaves the cache untouched', async () => {
    useRecentFoods.setState({
      foods: [{ name: 'Porridge', unit: 'g', lastPortionG: 200, calories: 150, carbs_g: 25, protein_g: 5, fat_g: 2.5, fibre_g: 2, lastUsedAt: '2026-09-18T08:00:00.000Z' }],
      fetchedAt: '2026-09-18T08:00:00.000Z',
    });
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods).toHaveLength(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('caps the cache at 200 distinct foods', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      ...entryRow, food_name: `Food ${i}`, created_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
    }));
    mockLogsThenEntries(['log1'], rows);

    await useRecentFoods.getState().refresh();

    expect(useRecentFoods.getState().foods.length).toBe(200);
  });
});
