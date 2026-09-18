// Card 300. DROP on the Training tab's plan stack closed the block but left the
// plan's user_plans row active, so Browse and plan detail still said you were
// on a plan you had left.

type Call = { table: string; method: string; args: unknown[] };
const mockCalls: Call[] = [];
let mockBlock: { user_id: string; template_id: string | null } | null = null;
let mockOtherOpen: Array<{ id: string }> = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let op = 'select';
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'or', 'gte', 'update']) {
        chain[method] = jest.fn((...args: unknown[]) => {
          if (method === 'update') op = 'update';
          mockCalls.push({ table, method, args });
          return chain;
        });
      }
      chain.maybeSingle = () => Promise.resolve({ data: mockBlock, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(op === 'select' && table === 'training_blocks'
          ? { data: mockOtherOpen, error: null }
          : { data: null, error: null });
      return chain;
    },
  },
}));

import { endTrainingBlock } from '@/lib/trainingBlocks';

const planUpdates = () => mockCalls.filter((c) => c.table === 'user_plans' && c.method === 'update');
const planFilters = () => mockCalls.filter((c) => c.table === 'user_plans' && c.method === 'eq').map((c) => c.args);

beforeEach(() => {
  mockCalls.length = 0;
  mockBlock = { user_id: 'user-1', template_id: 'tmpl-10k' };
  mockOtherOpen = [];
});

describe('endTrainingBlock', () => {
  it("deactivates the plan's user_plans row, scoped to that user and template", async () => {
    await endTrainingBlock('block-3');
    expect(planUpdates()).toHaveLength(1);
    expect(planUpdates()[0].args[0]).toEqual({ is_active: false });
    expect(planFilters()).toEqual(expect.arrayContaining([
      ['user_id', 'user-1'], ['template_id', 'tmpl-10k'], ['is_active', true],
    ]));
  });

  it('still closes the block and drops its future sessions', async () => {
    await endTrainingBlock('block-3');
    const updates = mockCalls.filter((c) => c.method === 'update').map((c) => [c.table, c.args[0]]);
    expect(updates).toEqual(expect.arrayContaining([
      ['planned_sessions', { status: 'dropped' }],
      ['training_blocks',  expect.objectContaining({ ends_on: expect.any(String) })],
    ]));
  });

  it('leaves the plan active when another open block still uses the same template', async () => {
    mockOtherOpen = [{ id: 'block-4' }];
    await endTrainingBlock('block-3');
    expect(planUpdates()).toHaveLength(0);
    const check = mockCalls.find((c) => c.table === 'training_blocks' && c.method === 'neq');
    expect(check?.args).toEqual(['id', 'block-3']);
  });

  it('touches no plan row for a block with no template', async () => {
    mockBlock = { user_id: 'user-1', template_id: null };
    await endTrainingBlock('block-3');
    expect(planUpdates()).toHaveLength(0);
  });
});
