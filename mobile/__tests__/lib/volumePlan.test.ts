import {
  getSessionPaceTarget,
  _redistributeKm,
  distributeWeeklyKm,
  formatPace,
  buildVolumeAdjustmentNote,
  type WeekInput,
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

// --- _redistributeKm ---

const baseWeeks: WeekInput[] = [
  { week_number: 1, original_km: 30, phase: 'follicular', is_current: false, is_past: true, is_taper: false },
  { week_number: 2, original_km: 35, phase: 'ovulatory',  is_current: true,  is_past: false, is_taper: false },
  { week_number: 3, original_km: 40, phase: 'luteal',     is_current: false, is_past: false, is_taper: false },
  { week_number: 4, original_km: 25, phase: 'menstrual',  is_current: false, is_past: false, is_taper: true },
];

test('past weeks always get 0 from redistribution', () => {
  const result = _redistributeKm(70, baseWeeks);
  expect(result[0]).toBe(0); // week 1 is past
});

test('redistribution total equals remainingKm when no caps hit', () => {
  // Use small remaining_km so caps are not hit
  const result = _redistributeKm(30, baseWeeks);
  const remaining = result.slice(1).reduce((a, b) => a + b, 0);
  expect(remaining).toBeCloseTo(30, 1);
});

test('front-loading: earlier remaining weeks get more km than later weeks (equal phase weight)', () => {
  const equalPhaseWeeks: WeekInput[] = [
    { week_number: 1, original_km: 50, phase: null, is_current: true,  is_past: false, is_taper: false },
    { week_number: 2, original_km: 50, phase: null, is_current: false, is_past: false, is_taper: false },
    { week_number: 3, original_km: 50, phase: null, is_current: false, is_past: false, is_taper: false },
  ];
  const result = _redistributeKm(90, equalPhaseWeeks);
  expect(result[0]).toBeGreaterThan(result[1]);
  expect(result[1]).toBeGreaterThan(result[2]);
});

test('taper week capped at original_km', () => {
  // Week 4 is taper (25km). Redistribute 200km — would overflow, taper should cap at 25.
  const result = _redistributeKm(200, baseWeeks);
  expect(result[3]).toBeLessThanOrEqual(25);
});

test('non-taper week capped at 1.30 × original_km', () => {
  const result = _redistributeKm(200, baseWeeks);
  expect(result[1]).toBeLessThanOrEqual(35 * 1.30 + 0.01);
  expect(result[2]).toBeLessThanOrEqual(40 * 1.30 + 0.01);
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
