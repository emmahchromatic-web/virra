import { inferLoadFromLabel } from '@/lib/dailyTrainingContext';

test('long run → hard', () => {
  expect(inferLoadFromLabel('long', 'run')).toBe('hard');
});

test('tempo run → hard', () => {
  expect(inferLoadFromLabel('tempo', 'run')).toBe('hard');
});

test('interval run → hard', () => {
  expect(inferLoadFromLabel('interval', 'run')).toBe('hard');
});

test('race → hard', () => {
  expect(inferLoadFromLabel('race', 'run')).toBe('hard');
});

test('threshold → hard', () => {
  expect(inferLoadFromLabel('threshold', 'run')).toBe('hard');
});

test('easy run → easy', () => {
  expect(inferLoadFromLabel('easy', 'run')).toBe('easy');
});

test('recovery run → easy', () => {
  expect(inferLoadFromLabel('recovery', 'run')).toBe('easy');
});

test('base run → easy', () => {
  expect(inferLoadFromLabel('base', 'run')).toBe('easy');
});

test('moderate run → moderate', () => {
  expect(inferLoadFromLabel('moderate', 'run')).toBe('moderate');
});

test('progression → moderate', () => {
  expect(inferLoadFromLabel('progression', 'run')).toBe('moderate');
});

test('strength lower → moderate', () => {
  expect(inferLoadFromLabel('lower', 'strength')).toBe('moderate');
});

test('strength upper → moderate', () => {
  expect(inferLoadFromLabel('upper', 'strength')).toBe('moderate');
});

test('strength general → easy', () => {
  expect(inferLoadFromLabel('general', 'strength')).toBe('easy');
});

test('unknown label → easy fallback', () => {
  expect(inferLoadFromLabel('custom-session', 'run')).toBe('easy');
});

test('unknown strength label → easy fallback', () => {
  expect(inferLoadFromLabel('unknown', 'strength')).toBe('easy');
});
