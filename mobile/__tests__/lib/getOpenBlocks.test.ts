// The plan detail button names what pressing it will replace, and clearSlot is
// what actually replaces it. They must read the same set of blocks. Before this,
// the button read getActiveBlocks, which hides a block until its start date, so
// a runner whose plan started tomorrow saw "Start this plan" and clearSlot then
// replaced the plan anyway.

const mockFilters: Array<[string, unknown[]]> = [];

function mockChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'or', 'lte', 'gte', 'order']) {
    chain[m] = jest.fn((...args: unknown[]) => { mockFilters.push([m, args]); return chain; });
  }
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return chain;
}

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => mockChain() },
}));

import { getOpenBlocks, getActiveBlocks } from '@/lib/trainingBlocks';

beforeEach(() => { mockFilters.length = 0; });

describe('getOpenBlocks', () => {
  it('includes blocks that have not started yet', async () => {
    await getOpenBlocks('u');
    const startsOnFilter = mockFilters.find(([m, a]) => m === 'lte' && a[0] === 'starts_on');
    expect(startsOnFilter).toBeUndefined();
  });

  it('still excludes blocks that have already ended, as clearSlot does', async () => {
    await getOpenBlocks('u');
    const endsOn = mockFilters.find(([m]) => m === 'or');
    expect(String(endsOn?.[1][0])).toMatch(/^ends_on\.is\.null,ends_on\.gte\.\d{4}-\d{2}-\d{2}$/);
  });

  it('is scoped to the user', async () => {
    await getOpenBlocks('user-42');
    expect(mockFilters).toContainEqual(['eq', ['user_id', 'user-42']]);
  });
});

describe('getActiveBlocks is deliberately unchanged', () => {
  it('still hides a block until its start date', async () => {
    // Load and today's-context screens must not count a plan before its
    // sessions exist; only the replace label needed the wider view.
    await getActiveBlocks('u');
    expect(mockFilters.some(([m, a]) => m === 'lte' && a[0] === 'starts_on')).toBe(true);
  });
});
