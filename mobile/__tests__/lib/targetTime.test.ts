import { parseTargetTime } from '@/components/ui/AddEventModal';

// user_events.target_finish_time is the highest-priority pace source in
// volumePlan, so a misread goal sets the pace target on every run in the plan.
// It is stored as HH:MM:SS.
describe('parseTargetTime', () => {
  it('reads a full hours:minutes:seconds entry', () => {
    expect(parseTargetTime('3:45:30', 'marathon')).toBe('03:45:30');
    expect(parseTargetTime('00:22:30', '5k')).toBe('00:22:30');
  });

  // Two parts are ambiguous on their own: "3:45" is 3h45 for a marathon and
  // 3min45 would be absurd, while "22:30" for a 5K is plainly minutes.
  it('reads a two-part entry as hours:minutes for long races', () => {
    expect(parseTargetTime('3:45', 'marathon')).toBe('03:45:00');
    expect(parseTargetTime('1:45', 'half_marathon')).toBe('01:45:00');
  });

  it('reads a two-part entry as minutes:seconds for short races', () => {
    expect(parseTargetTime('22:30', '5k')).toBe('00:22:30');
    expect(parseTargetTime('48:00', '10k')).toBe('00:48:00');
  });

  it('pads single-digit input', () => {
    expect(parseTargetTime('3:5', 'marathon')).toBe('03:05:00');
  });

  it('returns null for empty or whitespace input', () => {
    expect(parseTargetTime('', 'marathon')).toBeNull();
    expect(parseTargetTime('   ', 'marathon')).toBeNull();
  });

  it('rejects anything that is not a time', () => {
    for (const bad of ['soon', '3h45', '3.45', '345', '3:45:30:15', '::', '3:']) {
      expect(parseTargetTime(bad, 'marathon')).toBeNull();
    }
  });

  it('rejects impossible minutes and seconds', () => {
    expect(parseTargetTime('3:75', 'marathon')).toBeNull();
    expect(parseTargetTime('1:20:99', 'marathon')).toBeNull();
  });

  // Zero is not a goal, and dividing by it downstream would poison the pace.
  it('rejects a zero time', () => {
    expect(parseTargetTime('0:00', 'marathon')).toBeNull();
    expect(parseTargetTime('00:00:00', '5k')).toBeNull();
  });

  it('produces a value volumePlan can parse back to seconds', () => {
    const stored = parseTargetTime('3:45', 'marathon')!;
    const [h, m, s] = stored.split(':').map(Number);
    expect(h * 3600 + m * 60 + s).toBe(13500); // 3h45m
  });
});
