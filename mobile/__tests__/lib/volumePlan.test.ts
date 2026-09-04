import {
  getSessionPaceTarget,
  distributeWeeklyKm,
  formatPace,
  buildVolumeAdjustmentNote,
} from '@/lib/volumePlan';

// --- getSessionPaceTarget ---

test('easy session in follicular phase is slower than goal pace', () => {
  // goal 300 s/km (5:00/km), easy modifier 1.20, follicular 0.98
  const result = getSessionPaceTarget(300, 'easy', 'follicular');
  expect(result).toBeCloseTo(300 * 1.20 * 0.98, 1); // 352.8
});

test('interval session in ovulatory phase is faster than goal pace', () => {
  const result = getSessionPaceTarget(300, 'interval', 'ovulatory');
  expect(result).toBeCloseTo(300 * 0.92 * 0.97, 1); // 267.72
});

test('unknown session label defaults to 1.0 type modifier', () => {
  const result = getSessionPaceTarget(300, 'unknown_label', null);
  expect(result).toBeCloseTo(300 * 1.0 * 1.0, 1); // 300
});

test('null phase defaults to 1.0 phase modifier', () => {
  const result = getSessionPaceTarget(300, 'tempo', null);
  expect(result).toBeCloseTo(300 * 1.0 * 1.0, 1); // 300
});

// --- distributeWeeklyKm ---

test('long session gets 40% when present', () => {
  const sessions = [
    { id: 'long-1', session_label: 'long' },
    { id: 'easy-1', session_label: 'easy' },
    { id: 'tempo-1', session_label: 'tempo' },
  ];
  const dist = distributeWeeklyKm(sessions, 40);
  expect(dist['long-1']).toBeCloseTo(16, 0); // 40% of 40
  // total should equal 40
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  expect(total).toBeCloseTo(40, 1);
});

test('without long session, all sessions split by type modifier weight', () => {
  const sessions = [
    { id: 'easy-1', session_label: 'easy' },   // modifier 1.20
    { id: 'tempo-1', session_label: 'tempo' },  // modifier 1.00
  ];
  const dist = distributeWeeklyKm(sessions, 22);
  // easy: 1.20/(1.20+1.00) * 22 = 12.0; tempo: 1.00/2.20 * 22 = 10.0
  expect(dist['easy-1']).toBeCloseTo(12.0, 0);
  expect(dist['tempo-1']).toBeCloseTo(10.0, 0);
});

// --- formatPace ---

test('formatPace 300 s/km → 5:00/km', () => {
  expect(formatPace(300)).toBe('5:00/km');
});

test('formatPace 323 s/km → 5:23/km', () => {
  expect(formatPace(323)).toBe('5:23/km');
});

test('formatPace 60 s/km → 1:00/km', () => {
  expect(formatPace(60)).toBe('1:00/km');
});

test('formatPace 59.5 s/km rounds to 1:00/km, not 0:60/km', () => {
  expect(formatPace(59.5)).toBe('1:00/km');
});

// --- buildVolumeAdjustmentNote ---

test('returns null when loadScale is 1.0 and phase is follicular', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'follicular')).toBeNull();
});

test('returns null when loadScale is 1.0 and phase is null', () => {
  expect(buildVolumeAdjustmentNote(1.0, null)).toBeNull();
});

test('returns gym note when loadScale < 1.0 and phase is neutral', () => {
  expect(buildVolumeAdjustmentNote(0.8, 'follicular')).toBe('Volume adjusted · gym block');
});

test('returns phase note when loadScale is 1.0 and phase is luteal', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'luteal')).toBe('Volume adjusted · luteal phase');
});

test('returns combined note when gym block and luteal phase both apply', () => {
  expect(buildVolumeAdjustmentNote(0.8, 'luteal')).toBe('Volume adjusted · gym block + luteal phase');
});

test('returns phase note for menstrual phase with no gym block', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'menstrual')).toBe('Volume adjusted · menstrual phase');
});

test('returns null for ovulatory phase with no gym block', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'ovulatory')).toBeNull();
});
