import { applyRealignment } from '@/lib/runProgramme/realignmentActions';

/**
 * A small stand-in for the Supabase query builder. Records every write so the
 * tests can assert on what would actually have happened to someone's plan.
 */
interface Row { id: string; scheduled_date: string; status?: string }

const state: {
  missed:    Row[];
  future:    Row[];
  occupied:  Array<{ scheduled_date: string }>;
  blockEnds: string | null;
  planGoal:  string | null;
  writes:    Array<{ table: string; patch: Record<string, unknown>; ids?: string[] }>;
} = { missed: [], future: [], occupied: [], blockEnds: null, planGoal: null, writes: [] };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder: any = {
        _patch: null as Record<string, unknown> | null,
        _ids:   undefined as string[] | undefined,
        _mode:  'missed' as 'missed' | 'future',
        select() { return builder; },
        eq()     { return builder; },
        in(col: string, vals: string[]) {
          if (builder._patch) builder._ids = vals;
          return builder;
        },
        // The two reads differ only by their date filter: missed sessions are
        // `lt(today)`, upcoming ones `gte(today)`. Mirror that so the mock can
        // tell them apart.
        lt()  { builder._mode = 'missed'; return builder; },
        gte() { if (!builder._patch) builder._mode = 'future'; return builder; },
        maybeSingle() {
          if (table === 'training_blocks') return Promise.resolve({ data: { ends_on: state.blockEnds, template_id: 'tmpl-1' }, error: null });
          if (table === 'user_plans')      return Promise.resolve({ data: state.planGoal ? { id: 'p1', goal_date: state.planGoal } : null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Record<string, unknown>) { builder._patch = patch; return builder; },
        then(resolve: (v: unknown) => unknown) {
          if (builder._patch) {
            state.writes.push({ table, patch: builder._patch, ids: builder._ids });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          const data =
            table === 'training_blocks' ? { ends_on: state.blockEnds, template_id: 'tmpl-1' }
            : builder._mode === 'future' ? state.future
            : state.missed;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  },
}));

const INPUT = { userId: 'u1', blockId: 'b1', today: '2026-03-30' }; // a Monday

beforeEach(() => {
  state.missed    = [];
  state.future    = [];
  state.occupied  = [];
  state.blockEnds = null;
  state.planGoal  = null;
  state.writes    = [];
});

describe('skip and continue', () => {
  it('clears the missed sessions and nothing else', async () => {
    state.missed = [
      { id: 's1', scheduled_date: '2026-03-24' },
      { id: 's2', scheduled_date: '2026-03-26' },
    ];
    const result = await applyRealignment('skip_and_continue', INPUT);

    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].patch).toEqual({ status: 'dropped' });
    expect(state.writes[0].ids).toEqual(['s1', 's2']);
    expect(result.changedCount).toBe(2);
    expect(result.needsRebuild).toBe(false);
  });

  it('says so plainly, in the singular where that is right', async () => {
    state.missed = [{ id: 's1', scheduled_date: '2026-03-24' }];
    const result = await applyRealignment('skip_and_continue', INPUT);
    expect(result.summary).toContain('1 missed session');
    expect(result.summary).not.toContain('sessions');
  });

  it('writes nothing at all when there is nothing missed', async () => {
    const result = await applyRealignment('skip_and_continue', INPUT);
    expect(state.writes).toHaveLength(0);
    expect(result.changedCount).toBe(0);
  });
});

describe('carry on unchanged', () => {
  it('touches nothing — the runner was told what it means and chose it', async () => {
    state.missed = [{ id: 's1', scheduled_date: '2026-03-01' }];
    const result = await applyRealignment('continue_unchanged', INPUT);
    expect(state.writes).toHaveLength(0);
    expect(result.needsRebuild).toBe(false);
    expect(result.summary).toMatch(/ease into/i);
  });
});

describe('the rebuild actions', () => {
  it('do not regenerate anything from the modal', async () => {
    // Silently regenerating someone's training from a prompt would be the same
    // mistake the redistributor made, in a new place. They route to the plan
    // screen, where the runner sees what they are about to get.
    for (const action of ['rebuild_to_date', 'rebuild_from_today', 'restart_plan', 'start_new_plan'] as const) {
      state.writes = [];
      const result = await applyRealignment(action, INPUT);
      expect(result.needsRebuild).toBe(true);
      expect(state.writes).toHaveLength(0);
    }
  });
});

describe('extend the plan', () => {
  it('shifts future sessions by whole weeks, never part of one', async () => {
    // A four-day shift would land every session on a different weekday from the
    // one the runner picked.
    state.missed = [{ id: 'm1', scheduled_date: '2026-03-16' }]; // 14 days back
    state.future = [{ id: 'f1', scheduled_date: '2026-04-01' }];
    const result = await applyRealignment('extend_plan', INPUT);

    const dateWrite = state.writes.find((w) => 'scheduled_date' in w.patch);
    expect(dateWrite!.patch.scheduled_date).toBe('2026-04-15'); // +14 days
    expect(result.summary).toContain('2 weeks');
  });

  it('moves the block\'s end date with it', async () => {
    state.missed    = [{ id: 'm1', scheduled_date: '2026-03-23' }];
    state.future    = [];
    state.blockEnds = '2026-06-01';
    await applyRealignment('extend_plan', INPUT);

    const blockWrite = state.writes.find((w) => w.table === 'training_blocks');
    expect(blockWrite).toBeDefined();
    expect(blockWrite!.patch.ends_on).toBe('2026-06-08');
  });

  it('moves the plan\'s goal date with it, so the Training tab and the plan agree', async () => {
    state.missed    = [{ id: 'm1', scheduled_date: '2026-03-23' }];
    state.blockEnds = '2026-06-01';
    state.planGoal  = '2026-06-01';
    await applyRealignment('extend_plan', INPUT);

    const planWrite = state.writes.find((w) => w.table === 'user_plans');
    expect(planWrite!.patch.goal_date).toBe('2026-06-08');
  });

  it('leaves an open-ended plan alone rather than inventing a goal date', async () => {
    state.missed    = [{ id: 'm1', scheduled_date: '2026-03-23' }];
    state.blockEnds = null;
    state.planGoal  = null;
    await applyRealignment('extend_plan', INPUT);
    expect(state.writes.some((w) => w.table === 'user_plans')).toBe(false);
  });

  it('clears the missed weeks rather than making them up', async () => {
    state.missed = [{ id: 'm1', scheduled_date: '2026-03-23' }];
    await applyRealignment('extend_plan', INPUT);
    expect(state.writes.some((w) => w.patch.status === 'dropped')).toBe(true);
  });

  it('never shifts by less than a week', async () => {
    state.missed = [{ id: 'm1', scheduled_date: '2026-03-29' }]; // yesterday
    state.future = [{ id: 'f1', scheduled_date: '2026-04-01' }];
    const result = await applyRealignment('extend_plan', INPUT);
    expect(result.summary).toContain('1 week');
  });
});
