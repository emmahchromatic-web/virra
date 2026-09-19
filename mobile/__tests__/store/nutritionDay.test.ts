import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) } },
}));

jest.mock('@/lib/nutritionLog', () => ({
  getNutritionDay: jest.fn(),
}));

import { useNutritionDay } from '@/store/nutritionDay';
import { getNutritionDay } from '@/lib/nutritionLog';
import { supabase } from '@/lib/supabase';

const mockGetNutritionDay = getNutritionDay as jest.MockedFunction<typeof getNutritionDay>;
const mockGetUser = supabase.auth.getUser as jest.MockedFunction<typeof supabase.auth.getUser>;

const entryA = {
  id: 'e1', meal_type: 'breakfast' as const, food_name: 'Porridge', calories: 300,
  carbs_g: 50, protein_g: 10, fat_g: 5, fibre_g: 4, quantity_g: 200, quantity_unit: 'g',
  source: 'manual' as const, haiku_input: null, log_id: 'log1',
};
const entryB = {
  id: 'e2', meal_type: 'lunch' as const, food_name: 'Chicken salad', calories: 450,
  carbs_g: 20, protein_g: 40, fat_g: 15, fibre_g: 6, quantity_g: 350, quantity_unit: 'g',
  source: 'off' as const, haiku_input: null, log_id: 'log1',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockGetNutritionDay.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } } as any);
  useNutritionDay.setState({ days: {}, inFlight: {} });
});

describe('nutritionDay store persistence', () => {
  it('hydrates cached days from storage before any network call', async () => {
    await AsyncStorage.setItem('virra:nutrition:v1', JSON.stringify({
      state: {
        days: {
          '2026-09-18': {
            logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy',
            targetsJson: { calories: 2000, carbs_g: 250, protein_g: 100, fat_g: 70, fibre_g: 30 },
            entries: [entryA],
            fetchedAt: '2026-09-18T08:00:00.000Z',
          },
        },
      },
      version: 1,
    }));

    await useNutritionDay.persist.rehydrate();

    expect(useNutritionDay.getState().days['2026-09-18']?.entries).toEqual([entryA]);
    expect(mockGetNutritionDay).not.toHaveBeenCalled();
  });

  it('persists the days map and excludes the in-flight request map', async () => {
    mockGetNutritionDay.mockResolvedValue({
      logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy',
      targetsJson: null, entries: [entryA],
    });
    await useNutritionDay.getState().refresh('2026-09-19');
    await new Promise((r) => setTimeout(r, 0));

    const raw = await AsyncStorage.getItem('virra:nutrition:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.days['2026-09-19'].entries).toEqual([entryA]);
    expect(parsed.state.inFlight).toBeUndefined();
  });
});

describe('nutritionDay store refresh()', () => {
  it('replaces that day\'s cached entries with fresh server data on success', async () => {
    useNutritionDay.setState({
      days: {
        '2026-09-19': {
          logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy', targetsJson: null,
          entries: [entryA], fetchedAt: '2026-09-19T06:00:00.000Z',
        },
      },
    });

    mockGetNutritionDay.mockResolvedValue({
      logId: 'log1', trainingLoad: 'moderate', inferredLoad: 'moderate',
      targetsJson: null, entries: [entryA, entryB],
    });

    await useNutritionDay.getState().refresh('2026-09-19');

    const day = useNutritionDay.getState().days['2026-09-19'];
    expect(day.entries).toEqual([entryA, entryB]);
    expect(day.trainingLoad).toBe('moderate');
    expect(new Date(day.fetchedAt).getTime()).toBeGreaterThan(new Date('2026-09-19T06:00:00.000Z').getTime());
  });

  it('a failed refresh leaves that day\'s existing cache untouched', async () => {
    const staleDay = {
      logId: 'log1', trainingLoad: 'easy' as const, inferredLoad: 'easy' as const, targetsJson: null,
      entries: [entryA], fetchedAt: '2026-09-19T06:00:00.000Z',
    };
    useNutritionDay.setState({ days: { '2026-09-19': staleDay } });

    mockGetNutritionDay.mockRejectedValue(new Error('offline'));

    await useNutritionDay.getState().refresh('2026-09-19');

    expect(useNutritionDay.getState().days['2026-09-19']).toEqual(staleDay);
  });

  it('a refresh with no signed-in user leaves the cache untouched', async () => {
    const staleDay = {
      logId: 'log1', trainingLoad: 'easy' as const, inferredLoad: 'easy' as const, targetsJson: null,
      entries: [entryA], fetchedAt: '2026-09-19T06:00:00.000Z',
    };
    useNutritionDay.setState({ days: { '2026-09-19': staleDay } });
    mockGetUser.mockResolvedValue({ data: { user: null } } as any);

    await useNutritionDay.getState().refresh('2026-09-19');

    expect(useNutritionDay.getState().days['2026-09-19']).toEqual(staleDay);
    expect(mockGetNutritionDay).not.toHaveBeenCalled();
  });

  it('a day with no logged row yet resolves as a legitimate empty day, not a failure', async () => {
    mockGetNutritionDay.mockResolvedValue({
      logId: null, trainingLoad: null, inferredLoad: null, targetsJson: null, entries: [],
    });

    await useNutritionDay.getState().refresh('2026-09-19');

    const day = useNutritionDay.getState().days['2026-09-19'];
    expect(day.logId).toBeNull();
    expect(day.entries).toEqual([]);
    expect(day.fetchedAt).toBeTruthy();
  });

  it('tracks fetchedAt per day, not globally, when the store holds several days at once', async () => {
    mockGetNutritionDay.mockResolvedValueOnce({
      logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy', targetsJson: null, entries: [entryA],
    });
    await useNutritionDay.getState().refresh('2026-09-18');
    const fetchedAtDay1 = useNutritionDay.getState().days['2026-09-18'].fetchedAt;

    await new Promise((r) => setTimeout(r, 5));

    mockGetNutritionDay.mockResolvedValueOnce({
      logId: 'log2', trainingLoad: 'hard', inferredLoad: 'hard', targetsJson: null, entries: [entryB],
    });
    await useNutritionDay.getState().refresh('2026-09-19');
    const fetchedAtDay2 = useNutritionDay.getState().days['2026-09-19'].fetchedAt;

    // Day 1's own fetchedAt is untouched by day 2's later refresh.
    expect(useNutritionDay.getState().days['2026-09-18'].fetchedAt).toBe(fetchedAtDay1);
    expect(fetchedAtDay2).not.toBe(fetchedAtDay1);
    expect(new Date(fetchedAtDay2).getTime()).toBeGreaterThan(new Date(fetchedAtDay1).getTime());
  });

  it('does not issue a second fetch for a day already in flight', async () => {
    let resolveFirst: (v: any) => void = () => {};
    mockGetNutritionDay.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));

    const first = useNutritionDay.getState().refresh('2026-09-19');
    // Let `first`'s execution reach its call into getNutritionDay (past its
    // own `await getUser()`) before checking the second call's guard.
    await new Promise((r) => setTimeout(r, 0));

    const second = useNutritionDay.getState().refresh('2026-09-19'); // should no-op, still fetching

    resolveFirst({ logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy', targetsJson: null, entries: [entryA] });
    await Promise.all([first, second]);

    expect(mockGetNutritionDay).toHaveBeenCalledTimes(1);
  });
});

describe('nutritionDay store removeEntryLocal()', () => {
  it('removes one entry from a cached day without touching other days', () => {
    useNutritionDay.setState({
      days: {
        '2026-09-19': {
          logId: 'log1', trainingLoad: 'easy', inferredLoad: 'easy', targetsJson: null,
          entries: [entryA, entryB], fetchedAt: '2026-09-19T06:00:00.000Z',
        },
        '2026-09-18': {
          logId: 'log0', trainingLoad: 'easy', inferredLoad: 'easy', targetsJson: null,
          entries: [entryA], fetchedAt: '2026-09-18T06:00:00.000Z',
        },
      },
    });

    useNutritionDay.getState().removeEntryLocal('2026-09-19', 'e1');

    expect(useNutritionDay.getState().days['2026-09-19'].entries).toEqual([entryB]);
    expect(useNutritionDay.getState().days['2026-09-18'].entries).toEqual([entryA]);
  });

  it('is a no-op for a day with nothing cached', () => {
    useNutritionDay.setState({ days: {} });
    expect(() => useNutritionDay.getState().removeEntryLocal('2026-09-19', 'e1')).not.toThrow();
    expect(useNutritionDay.getState().days).toEqual({});
  });
});
