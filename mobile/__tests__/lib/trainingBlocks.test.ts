import { computeBlockLoad , blockEntry } from '@/lib/trainingBlocks';

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

describe('blockEntry', () => {
  it('makes a first plan primary at full load', () => {
    // The bug: this was written at 0.5, so a runner's only plan showed
    // "50% load" in the Training tab from the moment they started it.
    expect(blockEntry(false)).toEqual({ isPrimary: true, loadModifier: 1.0 });
  });

  it('adds a second plan of the same modality alongside, at half load', () => {
    expect(blockEntry(true)).toEqual({ isPrimary: false, loadModifier: 0.5 });
  });

  it('never marks a block both non-primary and full load', () => {
    // The inverted pair produced exactly this combination, which is what let
    // a supplementary plan contribute as much load as the plan it supplements.
    [true, false].forEach((has) => {
      const e = blockEntry(has);
      expect(e.isPrimary || e.loadModifier < 1.0).toBe(true);
    });
  });
});
