// mobile/__tests__/lib/healthKitHeartRate.test.ts

import {
  activeWindows,
  aggregateHeartRate,
  fetchRunHeartRate,
  HR_QUERY_TIMEOUT_MS,
} from '@/lib/healthKitHeartRate'

// The module talks to HealthKit only through the bridge now (card 216), so the
// tests mock the bridge rather than NativeModules.AppleHealthKit.
const mockQuantitySamples = jest.fn()
jest.mock('@/lib/healthKitBridge', () => ({
  hkQuantitySamples: (...args: any[]) => mockQuantitySamples(...args),
}))

// Fixed run window so sample timestamps read clearly: 10:00–10:30.
const RUN_START = new Date('2026-09-01T10:00:00Z').getTime()
const RUN_END   = new Date('2026-09-01T10:30:00Z').getTime()

function at(minutes: number): string {
  return new Date(RUN_START + minutes * 60_000).toISOString()
}

describe('activeWindows', () => {
  it('returns the whole run when there were no pauses', () => {
    expect(activeWindows(RUN_START, RUN_END, [])).toEqual([
      { start: RUN_START, end: RUN_END },
    ])
  })

  it('splits the run around a single pause', () => {
    const pause = { start: RUN_START + 10 * 60_000, end: RUN_START + 15 * 60_000 }
    expect(activeWindows(RUN_START, RUN_END, [pause])).toEqual([
      { start: RUN_START, end: pause.start },
      { start: pause.end, end: RUN_END },
    ])
  })

  it('handles several pauses in order', () => {
    const p1 = { start: RUN_START + 5 * 60_000,  end: RUN_START + 7 * 60_000 }
    const p2 = { start: RUN_START + 20 * 60_000, end: RUN_START + 22 * 60_000 }
    expect(activeWindows(RUN_START, RUN_END, [p2, p1])).toEqual([
      { start: RUN_START, end: p1.start },
      { start: p1.end,    end: p2.start },
      { start: p2.end,    end: RUN_END },
    ])
  })

  it('merges overlapping pauses instead of emitting a negative window', () => {
    const p1 = { start: RUN_START + 5 * 60_000,  end: RUN_START + 12 * 60_000 }
    const p2 = { start: RUN_START + 10 * 60_000, end: RUN_START + 15 * 60_000 }
    expect(activeWindows(RUN_START, RUN_END, [p1, p2])).toEqual([
      { start: RUN_START,  end: p1.start },
      { start: p2.end,     end: RUN_END },
    ])
  })

  it('clamps a pause that runs past the end of the run', () => {
    const pause = { start: RUN_START + 25 * 60_000, end: RUN_END + 10 * 60_000 }
    expect(activeWindows(RUN_START, RUN_END, [pause])).toEqual([
      { start: RUN_START, end: pause.start },
    ])
  })

  it('returns nothing when the run was paused end to end', () => {
    expect(activeWindows(RUN_START, RUN_END, [{ start: RUN_START, end: RUN_END }])).toEqual([])
  })

  it('returns nothing for a zero-length or inverted run', () => {
    expect(activeWindows(RUN_START, RUN_START, [])).toEqual([])
    expect(activeWindows(RUN_END, RUN_START, [])).toEqual([])
  })
})

describe('aggregateHeartRate', () => {
  const whole = [{ start: RUN_START, end: RUN_END }]

  it('averages and peaks the samples inside the run', () => {
    const samples = [
      { value: 140, startDate: at(1) },
      { value: 150, startDate: at(2) },
      { value: 160, startDate: at(3) },
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 150, hrMax: 160 })
  })

  it('rounds the average to a whole bpm', () => {
    const samples = [
      { value: 140, startDate: at(1) },
      { value: 141, startDate: at(2) },
      { value: 143, startDate: at(3) },
    ]
    // mean 141.33 → 141
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 141, hrMax: 143 })
  })

  it('ignores samples recorded before or after the run', () => {
    const samples = [
      { value:  60, startDate: at(-5) },   // warming up
      { value: 150, startDate: at(10) },
      { value:  70, startDate: at(45) },   // cooling down after the run
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 150, hrMax: 150 })
  })

  it('excludes samples recorded while the run was paused', () => {
    const windows = activeWindows(RUN_START, RUN_END, [
      { start: RUN_START + 10 * 60_000, end: RUN_START + 15 * 60_000 },
    ])
    const samples = [
      { value: 160, startDate: at(5) },
      { value:  80, startDate: at(12) },   // stopped at a crossing — must not drag the mean
      { value: 160, startDate: at(20) },
    ]
    expect(aggregateHeartRate(samples, windows)).toEqual({ hrAvg: 160, hrMax: 160 })
  })

  it('drops implausible sensor readings from both average and max', () => {
    const samples = [
      { value:   0, startDate: at(1) },    // lost wrist contact
      { value: 150, startDate: at(2) },
      { value: 160, startDate: at(3) },
      { value: 300, startDate: at(4) },    // spike
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 155, hrMax: 160 })
  })

  it('keeps readings on the plausible boundaries', () => {
    const samples = [
      { value:  30, startDate: at(1) },
      { value: 240, startDate: at(2) },
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 135, hrMax: 240 })
  })

  it('counts samples on the exact window boundaries', () => {
    const samples = [
      { value: 140, startDate: new Date(RUN_START).toISOString() },
      { value: 160, startDate: new Date(RUN_END).toISOString() },
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 150, hrMax: 160 })
  })

  it('returns nulls when there are no samples at all', () => {
    expect(aggregateHeartRate([], whole)).toEqual({ hrAvg: null, hrMax: null })
  })

  it('returns nulls when every sample falls outside the run', () => {
    const samples = [{ value: 65, startDate: at(90) }]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: null, hrMax: null })
  })

  it('returns nulls when every sample is implausible', () => {
    const samples = [
      { value: 0,   startDate: at(1) },
      { value: 500, startDate: at(2) },
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: null, hrMax: null })
  })

  it('ignores samples with an unparseable timestamp', () => {
    const samples = [
      { value: 150, startDate: 'not-a-date' },
      { value: 160, startDate: at(5) },
    ]
    expect(aggregateHeartRate(samples, whole)).toEqual({ hrAvg: 160, hrMax: 160 })
  })

  it('returns nulls when the run has no active windows', () => {
    const samples = [{ value: 150, startDate: at(5) }]
    expect(aggregateHeartRate(samples, [])).toEqual({ hrAvg: null, hrMax: null })
  })
})

describe('fetchRunHeartRate', () => {
  const started = new Date(RUN_START)
  const ended   = new Date(RUN_END)

  beforeEach(() => {
    mockQuantitySamples.mockReset()
    // Default: HealthKit has nothing, which is what the bridge returns on any
    // failure, denial or missing-permission path.
    mockQuantitySamples.mockResolvedValue([])
  })

  afterEach(() => { jest.useRealTimers() })

  it('queries the run window and aggregates what comes back', async () => {
    mockQuantitySamples.mockResolvedValue([
      { value: 140, startDate: at(5) },
      { value: 160, startDate: at(10) },
    ])

    await expect(fetchRunHeartRate(started, ended)).resolves.toEqual({ hrAvg: 150, hrMax: 160 })
    expect(mockQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      expect.objectContaining({ start: started, end: ended }),
    )
  })

  it('excludes paused stretches passed through to the aggregation', async () => {
    mockQuantitySamples.mockResolvedValue([
      { value: 160, startDate: at(5) },
      { value:  80, startDate: at(12) },   // during the pause
    ])

    const pauses = [{ start: RUN_START + 10 * 60_000, end: RUN_START + 15 * 60_000 }]
    await expect(fetchRunHeartRate(started, ended, pauses))
      .resolves.toEqual({ hrAvg: 160, hrMax: 160 })
  })

  // The bridge swallows errors and returns [], so "unavailable", "denied" and
  // "errored" are the same path from here: no samples, no heart rate, run saves.
  it('returns nulls when HealthKit gives nothing back', async () => {
    await expect(fetchRunHeartRate(started, ended)).resolves.toEqual({ hrAvg: null, hrMax: null })
  })

  it('returns nulls rather than rejecting if the bridge ever throws', async () => {
    mockQuantitySamples.mockRejectedValue(new Error('bridge exploded'))
    await expect(fetchRunHeartRate(started, ended)).resolves.toEqual({ hrAvg: null, hrMax: null })
  })

  it('does not query at all when the run was paused end to end', async () => {
    const pauses = [{ start: RUN_START, end: RUN_END }]
    await expect(fetchRunHeartRate(started, ended, pauses))
      .resolves.toEqual({ hrAvg: null, hrMax: null })
    expect(mockQuantitySamples).not.toHaveBeenCalled()
  })

  // A query that never settles must not strand the user on the saving spinner
  // with an unsaved run.
  it('gives up with nulls if the query never settles', async () => {
    jest.useFakeTimers()
    mockQuantitySamples.mockReturnValue(new Promise(() => { /* never settles */ }))

    const pending = fetchRunHeartRate(started, ended)
    jest.advanceTimersByTime(HR_QUERY_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({ hrAvg: null, hrMax: null })
  })

  it('ignores samples that arrive after the timeout has already won', async () => {
    jest.useFakeTimers()
    let settle: ((v: unknown) => void) | null = null
    mockQuantitySamples.mockReturnValue(new Promise(res => { settle = res }))

    const pending = fetchRunHeartRate(started, ended)
    jest.advanceTimersByTime(HR_QUERY_TIMEOUT_MS)
    await expect(pending).resolves.toEqual({ hrAvg: null, hrMax: null })

    // The straggler must not throw or change the already-resolved result.
    expect(() => settle!([{ value: 150, startDate: at(5) }])).not.toThrow()
    await expect(pending).resolves.toEqual({ hrAvg: null, hrMax: null })
  })
})
