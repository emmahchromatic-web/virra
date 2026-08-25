let mockLogs: any[] = [];
let mockEntries: any[] = [];
let mockLogErr: any = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rows = () => (table === 'nutrition_logs' ? mockLogs : mockEntries);
      const err  = () => (table === 'nutrition_logs' ? mockLogErr : null);
      const chain: any = new Proxy({}, {
        get: (_t, prop) => {
          if (prop === 'then') return (resolve: any) => resolve({ data: rows(), error: err() });
          return () => chain;
        },
      });
      return chain;
    },
  },
}));

import { searchMyFoods } from '@/lib/myFoods';

const entry = (over: Partial<any> = {}) => ({
  food_name: 'Oatly Barista', quantity_g: 200, quantity_unit: 'ml',
  calories: 120, carbs_g: 13, protein_g: 2, fat_g: 6, fibre_g: 1,
  created_at: '2026-08-20T08:00:00Z', ...over,
});

beforeEach(() => {
  mockLogs = [{ id: 'log-1' }];
  mockEntries = [];
  mockLogErr = null;
});

it('ignores queries that are too short to be meaningful', async () => {
  mockEntries = [entry()];
  expect(await searchMyFoods('u1', 'o')).toEqual([]);
});

it('returns nothing when the user has no logs in the window', async () => {
  mockLogs = [];
  expect(await searchMyFoods('u1', 'oatly')).toEqual([]);
});

// The bug on card 220: a scanned product logged in the past was unfindable,
// because search only looked at the static list and Open Food Facts.
it('finds a food the user has logged before', async () => {
  mockEntries = [entry()];
  const res = await searchMyFoods('u1', 'oatly');
  expect(res).toHaveLength(1);
  expect(res[0].name).toBe('Oatly Barista');
  expect(res[0].detail).toBe('Logged before');
});

// Stored macros are for the portion logged; the picker scales from per-100.
it('converts the logged portion to a per-100 basis', async () => {
  mockEntries = [entry({ quantity_g: 200, calories: 120, protein_g: 2 })];
  const [food] = await searchMyFoods('u1', 'oatly');
  expect(food.calories).toBe(60);   // 120 per 200 -> 60 per 100
  expect(food.protein_g).toBe(1);
  expect(food.serving_g).toBe(200); // still offers the portion actually eaten
});

it('carries the unit through so millilitres do not become grams', async () => {
  mockEntries = [entry({ quantity_unit: 'ml' })];
  const [food] = await searchMyFoods('u1', 'oatly');
  expect(food.unit).toBe('ml');
});

// Manual entries have no portion at all, so there is nothing to scale from and
// guessing one would silently misreport them.
it('skips foods logged without a quantity', async () => {
  mockEntries = [entry({ food_name: 'Post-run smoothie', quantity_g: null })];
  expect(await searchMyFoods('u1', 'smoothie')).toEqual([]);
});

it('shows each food once, keeping the most recent version', async () => {
  mockEntries = [
    entry({ created_at: '2026-08-24T08:00:00Z', calories: 100, quantity_g: 100 }),
    entry({ created_at: '2026-08-01T08:00:00Z', calories: 999, quantity_g: 100 }),
  ];
  const res = await searchMyFoods('u1', 'oatly');
  expect(res).toHaveLength(1);
  expect(res[0].calories).toBe(100);
});
