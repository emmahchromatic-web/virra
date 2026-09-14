import { buildNarrative } from '@/lib/phaseNarrative';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

describe('buildNarrative', () => {
  it('returns null when no cycle info and no sessions', () => {
    expect(buildNarrative(null, null, [], 'easy')).toBeNull();
  });

  // Real session_label values are lowercase keys (long, easy, run_walk), not
  // display text. These fixtures used 'Long Run' and 'Easy Run', which never
  // reach this function in production and hid the run_walk bug below.
  it('combines phase + run day + luteal hard cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 3, [{ session_label: 'long' }], 'hard');
    expect(result).toBe('Luteal Day 3 · Long run today · Fuel hard, rest after.');
  });

  it('combines phase + rest day + luteal easy cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 12, [], 'easy');
    expect(result).toBe('Luteal Day 12 · Rest day · Keep it easy. Your body is working hard.');
  });

  it('handles follicular hard day', () => {
    const result = buildNarrative('follicular' as CyclePhase, 8, [{ session_label: 'tempo' }], 'hard');
    expect(result).toBe('Follicular Day 8 · Tempo today · Your adaptation window. Make it count.');
  });

  it('handles menstrual any load', () => {
    const result = buildNarrative('menstrual' as CyclePhase, 2, [], 'moderate');
    expect(result).toBe('Menstrual Day 2 · Rest day · Listen to your body today.');
  });

  it('handles ovulatory with session', () => {
    const result = buildNarrative('ovulatory' as CyclePhase, 14, [{ session_label: 'intervals' }], 'hard');
    expect(result).toBe('Ovulatory Day 14 · Intervals today · Peak week. Go for it.');
  });

  it('omits phase segment when phase is null but session exists', () => {
    const result = buildNarrative(null, null, [{ session_label: 'easy' }], 'easy');
    expect(result).toBe('Easy today · Fuel well today.');
  });

  it('writes a two-word label as words, not with its underscore showing', () => {
    // The dashboard said "Run_walk today" on build 14's walk-run plans.
    const result = buildNarrative('follicular' as CyclePhase, 7, [{ session_label: 'run_walk' }], 'easy');
    expect(result).toContain('Run/walk today');
    expect(result).not.toContain('_');
  });

  it('uses first session when multiple sessions planned', () => {
    const sessions = [{ session_label: 'long' }, { session_label: 'strength' }];
    const result = buildNarrative('luteal' as CyclePhase, 3, sessions, 'hard');
    expect(result).toContain('Long run today');
  });
});
