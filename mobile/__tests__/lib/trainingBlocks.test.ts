import { computeBlockLoad, planSlot, blockCloseDate, SLOT_LOAD, SLOT_LABEL } from '@/lib/trainingBlocks';

type BlockInput = { modality: string; load_modifier: number };

describe('computeBlockLoad', () => {
  it('returns full load for a single run block (no supplement pressure)', () => {
    // capacity = 1.8 * 1.1 (follicular) = 1.98; budget = 1.98; scale = min(1, 1.98) = 1.0
    const result = computeBlockLoad([{ modality: 'run', load_modifier: 1.0 }], 'follicular');
    expect(result[0].effective_load).toBe(1.0);
  });

  it('reduces run load when a heavy strength supplement is added in luteal phase', () => {
    // capacity = 1.8 * 0.9 (luteal) = 1.62; suppLoad = 1.0; runBudget = 0.62
    // scale = 0.62; effective_run = max(0.5, round(0.62 * 100)/100) = 0.62
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
    ];
    const result = computeBlockLoad(blocks, 'luteal');
    expect(result[0].effective_load).toBe(0.62);
    expect(result[1].effective_load).toBe(1.0); // supplement never scaled
  });

  it('follicular phase allows higher run load than luteal under the same stack', () => {
    // follicular: budget = 1.98 - 1.0 = 0.98 → effective_run = 0.98
    // luteal:     budget = 1.62 - 1.0 = 0.62 → effective_run = 0.62
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
    ];
    const follicular = computeBlockLoad(blocks, 'follicular')[0].effective_load;
    const luteal     = computeBlockLoad(blocks, 'luteal')[0].effective_load;
    expect(follicular).toBeGreaterThan(luteal);
  });

  it('floors run effective_load at 0.5 when supplement stack exceeds capacity', () => {
    // capacity = 1.8 * 0.85 (menstrual) = 1.53; suppLoad = 3.0; runBudget = 0
    // scale = 0; effective_run = max(0.5, 0) = 0.5
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
      { modality: 'swim',     load_modifier: 1.0 },
      { modality: 'yoga',     load_modifier: 1.0 },
    ];
    const result = computeBlockLoad(blocks, 'menstrual');
    expect(result[0].effective_load).toBe(0.5);
  });

  it('never scales supplement blocks regardless of total load', () => {
    const blocks: BlockInput[] = [
      { modality: 'strength', load_modifier: 0.6 },
      { modality: 'yoga',     load_modifier: 0.4 },
    ];
    const result = computeBlockLoad(blocks, 'luteal');
    expect(result[0].effective_load).toBe(0.6);
    expect(result[1].effective_load).toBe(0.4);
  });

  it('handles an empty block array', () => {
    expect(computeBlockLoad([], 'follicular')).toEqual([]);
  });
});

describe('plan slots', () => {
  it('gives run and strength their own slot', () => {
    expect(planSlot('run')).toBe('run');
    expect(planSlot('strength')).toBe('strength');
  });

  it('collapses swim, yoga and other into one mobility slot', () => {
    // Emma's rule is one run, one strength, one mobility/misc — not one of
    // each of five modalities. If this ever splits, someone can hold three
    // support plans at once and the load ceiling stops meaning anything.
    expect((['swim', 'yoga', 'other'] as const).map(planSlot)).toEqual(['support', 'support', 'support']);
  });

  it('labels every slot', () => {
    (['run', 'strength', 'support'] as const).forEach((s) => {
      expect(SLOT_LABEL[s]).toBeTruthy();
    });
  });
});

describe('slot loads', () => {
  const MAX_TOTAL_LOAD = 1.8; // mirrors the constant in trainingBlocks.ts

  it('fits the full permitted setup inside the ceiling', () => {
    // The whole point of the numbers: someone running the maximum the rules
    // allow — one of each — should be at capacity, not over it. If this fails,
    // a legal setup silently scales the run block down.
    const total = SLOT_LOAD.run + SLOT_LOAD.strength + SLOT_LOAD.support;
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_LOAD);
  });

  it('leaves the run block unscaled for a legal three-plan setup', () => {
    const computed = computeBlockLoad([
      { modality: 'run',      load_modifier: SLOT_LOAD.run },
      { modality: 'strength', load_modifier: SLOT_LOAD.strength },
      { modality: 'yoga',     load_modifier: SLOT_LOAD.support },
    ], 'follicular');
    const run = computed.find((b) => b.modality === 'run')!;
    expect(run.effective_load).toBe(SLOT_LOAD.run);
  });

  it('never starts a sole plan below full load for its slot', () => {
    // The bug this replaced: a runner's first and only plan was written at
    // 0.5 and the Training tab reported "50% load" from day one.
    const run = computeBlockLoad([{ modality: 'run', load_modifier: SLOT_LOAD.run }], 'follicular');
    expect(run[0].effective_load).toBe(1.0);
  });
});

describe('blockCloseDate', () => {
  const isoDay = (d: Date) => d.toISOString().split('T')[0];

  it('closes a block strictly before today', () => {
    // The whole bug in one assertion. getActiveBlocks keeps anything with
    // ends_on >= today, so closing with today's date leaves the block in the
    // stack until tomorrow and the replaced plan keeps counting all day.
    // Found in prod: the backfill's "closed" duplicate was still open.
    expect(blockCloseDate() < isoDay(new Date())).toBe(true);
  });

  it('is the day before the date it is given', () => {
    expect(blockCloseDate(new Date('2026-08-26T09:00:00Z'))).toBe('2026-08-25');
  });

  it('steps back across a month boundary', () => {
    expect(blockCloseDate(new Date('2026-09-01T00:30:00Z'))).toBe('2026-08-31');
  });
});
