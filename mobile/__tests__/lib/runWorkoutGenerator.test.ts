import { inferWorkoutType } from '@/lib/runWorkoutGenerator';

describe('inferWorkoutType', () => {
  test('maps "easy" to easy', () => {
    expect(inferWorkoutType('easy')).toBe('easy');
  });
  test('maps "long run" to long', () => {
    expect(inferWorkoutType('long run')).toBe('long');
  });
  test('maps "tempo" to tempo', () => {
    expect(inferWorkoutType('tempo')).toBe('tempo');
  });
  test('maps "threshold" to threshold', () => {
    expect(inferWorkoutType('threshold')).toBe('threshold');
  });
  test('maps "intervals" or "vo2" to intervals', () => {
    expect(inferWorkoutType('intervals')).toBe('intervals');
    expect(inferWorkoutType('vo2 max')).toBe('intervals');
  });
  test('maps "progression" to progression', () => {
    expect(inferWorkoutType('progression run')).toBe('progression');
  });
  test('maps "race" to race', () => {
    expect(inferWorkoutType('race day')).toBe('race');
  });
  test('maps "recovery" to recovery', () => {
    expect(inferWorkoutType('recovery jog')).toBe('recovery');
  });
  test('falls back to easy', () => {
    expect(inferWorkoutType('shakeout')).toBe('easy');
  });
});
