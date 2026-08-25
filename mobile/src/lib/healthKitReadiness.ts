// mobile/src/lib/healthKitReadiness.ts

import type { SleepWindow } from './readinessEngine'
import { hkQuantitySamples, hkCategorySamples, hkDailySums } from './healthKitBridge'

// Pure helper: filter SDNN samples to overnight hours (9pm–10am) to exclude
// noisy daytime readings. Uses local hours so it matches the user's sleep schedule.
export function filterToOvernightHours(
  samples: Array<{ value: number; startDate: string }>,
): number[] {
  return samples
    .filter(s => {
      const h = new Date(s.startDate).getHours()
      return h >= 21 || h < 10
    })
    .map(s => s.value)
}

// Returns mean of values, or 0 for empty array
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

// Overnight SDNN samples filtered to 9pm–10am window across the date range.
// Returns { values, sampleDays } where sampleDays is the count of distinct dates.
export async function fetchOvernightHRV(
  startDate: Date,
  endDate: Date,
): Promise<{ values: number[]; sampleDays: number }> {
  const samples = await hkQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', {
    start: startDate,
    end:   endDate,
    unit:  'ms',
  })

  const overnight = samples.filter(s => {
    const h = new Date(s.startDate).getHours()
    return h >= 21 || h < 10
  })
  const distinctDates = new Set(overnight.map(s => s.startDate.split('T')[0]))

  return { values: overnight.map(s => s.value), sampleDays: distinctDates.size }
}

export async function fetchRHR(startDate: Date, endDate: Date): Promise<number[]> {
  const samples = await hkQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
    start: startDate,
    end:   endDate,
    unit:  'count/min',
  })
  return samples.map(s => s.value)
}

// Sleep analysis for a single night identified by date string (YYYY-MM-DD).
// Queries 6pm the day before to 2pm on the given date to capture the full night.
export async function fetchSleepSamples(date: string): Promise<SleepWindow | null> {
  // Parse YYYY-MM-DD as local midnight (new Date('YYYY-MM-DD') is UTC midnight, wrong for UTC-N)
  const [y, m, d] = date.split('-').map(Number)
  const windowStart = new Date(y, m - 1, d - 1, 18, 0, 0, 0)  // 6pm local, night before
  const windowEnd   = new Date(y, m - 1, d,     14, 0, 0, 0)  // 2pm local, given day

  const results = await hkCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
    start: windowStart,
    end:   windowEnd,
  })
  if (results.length === 0) return null

  const asleepValues = new Set(['ASLEEP', 'ASLEEPCORE', 'ASLEEPDEEP', 'ASLEEPREM'])

  let sleepHours = 0, inBedHours = 0, deepHours = 0, remHours = 0
  let hasStages = false

  for (const s of results) {
    const dur = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 3_600_000
    if (s.value === 'INBED')        { inBedHours += dur; continue }
    if (asleepValues.has(s.value))    sleepHours += dur
    if (s.value === 'ASLEEPDEEP')   { deepHours += dur; hasStages = true }
    if (s.value === 'ASLEEPREM')    { remHours  += dur; hasStages = true }
  }

  if (sleepHours === 0) return null

  return {
    sleepHours,
    timeInBed:  inBedHours > 0 ? inBedHours : sleepHours,
    deepHours:  hasStages ? deepHours : null,
    remHours:   hasStages ? remHours  : null,
  }
}

// Total active energy per day across the date range, as an array of per-day sums.
export async function fetchActivityLoad(startDate: Date, endDate: Date): Promise<number[]> {
  // Was getActivitySummary, which the new library has no equivalent for: it
  // exposes HKActivitySummaryType for authorization only. A daily statistics
  // collection answers the same question more directly, by summing the
  // underlying samples rather than reading Apple's ring aggregate, so it also
  // works without a paired Watch. Card 216.
  return hkDailySums('HKQuantityTypeIdentifierActiveEnergyBurned', {
    start: startDate,
    end:   endDate,
    unit:  'kcal',
  })
}
