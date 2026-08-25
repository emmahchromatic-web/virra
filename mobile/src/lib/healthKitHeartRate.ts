// mobile/src/lib/healthKitHeartRate.ts

import { hkQuantitySamples } from './healthKitBridge'

export interface HeartRateSample { value: number; startDate: string }

// Epoch-millisecond interval, end exclusive at the boundary check below.
export interface TimeWindow { start: number; end: number }

export interface RunHeartRate { hrAvg: number | null; hrMax: number | null }

// A wrist sensor losing contact reports values well outside these bounds; a
// single 0 or 300 would wreck both the mean and the max.
export const MIN_PLAUSIBLE_BPM = 30
export const MAX_PLAUSIBLE_BPM = 240

// Split [start, end] into the intervals the runner was actually moving, by
// removing paused stretches. Pauses are clamped to the run and merged first, so
// overlapping or out-of-range input can't produce negative or duplicate windows.
export function activeWindows(start: number, end: number, pauses: TimeWindow[]): TimeWindow[] {
  if (end <= start) return []

  const clamped = pauses
    .map(p => ({ start: Math.max(p.start, start), end: Math.min(p.end, end) }))
    .filter(p => p.end > p.start)
    .sort((a, b) => a.start - b.start)

  const merged: TimeWindow[] = []
  for (const p of clamped) {
    const last = merged[merged.length - 1]
    if (last && p.start <= last.end) last.end = Math.max(last.end, p.end)
    else merged.push({ ...p })
  }

  const active: TimeWindow[] = []
  let cursor = start
  for (const p of merged) {
    if (p.start > cursor) active.push({ start: cursor, end: p.start })
    cursor = Math.max(cursor, p.end)
  }
  if (cursor < end) active.push({ start: cursor, end })

  return active
}

// Mean and peak bpm across the active windows. Samples are counted equally
// rather than time-weighted: the Watch samples at a near-constant cadence
// during a workout, so weighting adds error-prone arithmetic for no real gain.
export function aggregateHeartRate(
  samples: HeartRateSample[],
  windows: TimeWindow[],
): RunHeartRate {
  const values = samples
    .filter(s => {
      const ts = new Date(s.startDate).getTime()
      if (Number.isNaN(ts)) return false
      return windows.some(w => ts >= w.start && ts <= w.end)
    })
    .map(s => s.value)
    .filter(v => Number.isFinite(v) && v >= MIN_PLAUSIBLE_BPM && v <= MAX_PLAUSIBLE_BPM)

  if (values.length === 0) return { hrAvg: null, hrMax: null }

  return {
    hrAvg: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    hrMax: Math.round(Math.max(...values)),
  }
}

// This sits in the run-save path, so a native callback that never fires would
// strand the user on the saving spinner with an unsaved run. Give up and write
// nulls instead.
export const HR_QUERY_TIMEOUT_MS = 5000

// Heart rate for a completed run. Returns nulls whenever HealthKit has nothing
// to give: no paired watch, read access denied, or samples not yet synced
// so the caller can always write the result straight through.
export async function fetchRunHeartRate(
  startedAt: Date,
  endedAt: Date,
  pauses: TimeWindow[] = [],
): Promise<RunHeartRate> {
  const windows = activeWindows(startedAt.getTime(), endedAt.getTime(), pauses)
  if (windows.length === 0) return { hrAvg: null, hrMax: null }

  // The bridge resolves rather than throws, but the timeout stays: a native
  // query that never settles would strand the user on the saving spinner with
  // an unsaved run, and no heart rate is a far better outcome than no run.
  const nothing: RunHeartRate = { hrAvg: null, hrMax: null }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<RunHeartRate>(resolve => {
    timer = setTimeout(() => {
      console.warn('[healthKitHeartRate] query timed out, saving run without heart rate')
      resolve(nothing)
    }, HR_QUERY_TIMEOUT_MS)
  })

  const query = hkQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
    start:     startedAt,
    end:       endedAt,
    unit:      'count/min',
    ascending: true,
  })
    .then(samples => aggregateHeartRate(samples, windows))
    // The bridge catches its own failures, but this sits in the run-save path
    // and a rejection here would lose the user's run. Belt and braces.
    .catch(() => nothing)

  // Clear the timer whichever side wins, so a finished query does not leave it
  // holding the event loop open for the rest of the timeout.
  return Promise.race([query, timeout]).finally(() => clearTimeout(timer))
}
