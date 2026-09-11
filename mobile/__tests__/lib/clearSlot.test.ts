// Card 256. `clearSlot` is what runs when you start a plan while another one
// occupies the same slot. It closed the old block but left its future
// `planned_sessions` alone, and those are read by user and date with no join
// back to `training_blocks` — so the displaced plan kept booking sessions
// alongside the new one.

type Call = { table: string; op: string; args: Record<string, unknown> };
const mockCalls: Call[] = [];

function mockBuilder(table: string, op: string) {
  const args: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  const record = () => { mockCalls.push({ table, op, args }); };
  for (const method of ['select', 'eq', 'in', 'or', 'gte', 'gt', 'lte', 'update', 'insert']) {
    chain[method] = jest.fn((...a: unknown[]) => {
      args[method] = a.length === 1 ? a[0] : a;
      if (method === 'update') args.payload = a[0];
      record();
      return chain;
    });
  }
  // The block lookup is awaited directly, so the mockBuilder has to be thenable.
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: mockBlockRows, error: null });
  return chain;
}

let mockBlockRows: Array<{ id: string; template_id: string | null }> = [];

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockBuilder(table, 'from') },
}));

import { clearSlot } from '@/lib/trainingBlocks';

const sessionUpdates = () =>
  mockCalls.filter((c) => c.table === 'planned_sessions' && c.args.payload !== undefined);

beforeEach(() => {
  mockCalls.length = 0;
  mockBlockRows = [{ id: 'block-a', template_id: 'tmpl-a' }];
});

describe('clearSlot', () => {
  it('drops the displaced block\'s still-planned future sessions', async () => {
    await clearSlot('user-1', 'run');
    const drop = sessionUpdates()[0];
    expect(drop).toBeDefined();
    expect(drop.args.payload).toEqual({ status: 'dropped' });
  });

  it('scopes the drop to the displaced blocks, not the whole user', async () => {
    mockBlockRows = [{ id: 'block-a', template_id: 'tmpl-a' }, { id: 'block-b', template_id: null }];
    await clearSlot('user-1', 'run');
    const scoped = mockCalls.find((c) => c.table === 'planned_sessions' && c.args.in);
    expect(scoped?.args.in).toEqual(['block_id', ['block-a', 'block-b']]);
  });

  it('only touches sessions still planned, so completed work is untouched', async () => {
    await clearSlot('user-1', 'run');
    const scoped = mockCalls.find((c) => c.table === 'planned_sessions' && c.args.eq);
    expect(scoped?.args.eq).toEqual(['status', 'planned']);
  });

  it('leaves the past alone: a plan you left does not un-happen', async () => {
    await clearSlot('user-1', 'run');
    const scoped = mockCalls.find((c) => c.table === 'planned_sessions' && c.args.gte);
    const [column, date] = scoped?.args.gte as [string, string];
    expect(column).toBe('scheduled_date');
    expect(date).toBe(new Date().toISOString().split('T')[0]);
  });

  it('still closes the block and deactivates the user_plans row', async () => {
    const out = await clearSlot('user-1', 'run');
    expect(mockCalls.some((c) => c.table === 'training_blocks' && c.args.payload)).toBe(true);
    expect(mockCalls.some((c) => c.table === 'user_plans' && c.args.payload)).toBe(true);
    expect(out).toEqual(['tmpl-a']);
  });

  it('does nothing at all when the slot is already empty', async () => {
    mockBlockRows = [];
    const out = await clearSlot('user-1', 'run');
    expect(out).toEqual([]);
    expect(sessionUpdates()).toHaveLength(0);
  });
});
