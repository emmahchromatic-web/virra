import { computeBreakDays } from '@/lib/scheduleGenerator';

const sessions = [
  { id: 's1', scheduled_date: '2026-05-12' }, // before break — unaffected
  { id: 's2', scheduled_date: '2026-05-15' }, // in break window → drop
  { id: 's3', scheduled_date: '2026-05-18' }, // in break window → drop
  { id: 's4', scheduled_date: '2026-05-23' }, // after break → shift in reschedule
  { id: 's5', scheduled_date: '2026-05-26' }, // after break → shift in reschedule
];
// break_start=2026-05-14, break_end=2026-05-21 → 8 days inclusive

test('reschedule: drops sessions in window, shifts sessions after', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).toEqual(['s2', 's3']);
  expect(r.toShiftIds).toEqual(['s4', 's5']);
  expect(r.shiftDays).toBe(8);
});

test('skip: drops sessions in window, no shifts', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'skip');
  expect(r.toDropIds).toEqual(['s2', 's3']);
  expect(r.toShiftIds).toEqual([]);
  expect(r.shiftDays).toBe(0);
});

test('sessions before break start are untouched', () => {
  const r = computeBreakDays(sessions, '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).not.toContain('s1');
  expect(r.toShiftIds).not.toContain('s1');
});

test('single-day break: shiftDays = 1', () => {
  const r = computeBreakDays(sessions, '2026-05-15', '2026-05-15', 'reschedule');
  expect(r.shiftDays).toBe(1);
  expect(r.toDropIds).toEqual(['s2']);
  expect(r.toShiftIds).toEqual(['s4', 's5']);
});

test('break with no sessions: all arrays empty', () => {
  const r = computeBreakDays([], '2026-05-14', '2026-05-21', 'reschedule');
  expect(r.toDropIds).toEqual([]);
  expect(r.toShiftIds).toEqual([]);
  expect(r.shiftDays).toBe(8);
});
