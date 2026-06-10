import { buildNarrative } from '@/lib/phaseNarrative';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

describe('buildNarrative', () => {
  it('returns null when no cycle info and no sessions', () => {
    expect(buildNarrative(null, null, [], 'easy')).toBeNull();
  });

  it('combines phase + run day + luteal hard cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 3, [{ session_label: 'Long Run' }], 'hard');
    expect(result).toBe('Luteal Day 3 · Long Run today · Fuel hard, rest after.');
  });

  it('combines phase + rest day + luteal easy cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 12, [], 'easy');
    expect(result).toBe('Luteal Day 12 · Rest day · Keep it easy. Your body is working hard.');
  });

  it('handles follicular hard day', () => {
    const result = buildNarrative('follicular' as CyclePhase, 8, [{ session_label: 'Tempo' }], 'hard');
    expect(result).toBe('Follicular Day 8 · Tempo today · Your adaptation window — make it count.');
  });

  it('handles menstrual any load', () => {
    const result = buildNarrative('menstrual' as CyclePhase, 2, [], 'moderate');
    expect(result).toBe('Menstrual Day 2 · Rest day · Listen to your body today.');
  });

  it('handles ovulatory with session', () => {
    const result = buildNarrative('ovulatory' as CyclePhase, 14, [{ session_label: 'Intervals' }], 'hard');
    expect(result).toBe('Ovulatory Day 14 · Intervals today · Peak week. Go for it.');
  });

  it('omits phase segment when phase is null but session exists', () => {
    const result = buildNarrative(null, null, [{ session_label: 'Easy Run' }], 'easy');
    expect(result).toBe('Easy Run today · Fuel well today.');
  });

  it('capitalises first letter of session label', () => {
    const result = buildNarrative('follicular' as CyclePhase, 5, [{ session_label: 'easy run' }], 'easy');
    expect(result).toContain('Easy run today');
  });

  it('uses first session when multiple sessions planned', () => {
    const sessions = [{ session_label: 'Long Run' }, { session_label: 'Strength' }];
    const result = buildNarrative('luteal' as CyclePhase, 3, sessions, 'hard');
    expect(result).toContain('Long Run today');
  });
});
