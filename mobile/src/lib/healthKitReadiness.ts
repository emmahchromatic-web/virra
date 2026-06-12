// mobile/src/lib/healthKitReadiness.ts

import { NativeModules } from 'react-native'
import type { SleepWindow } from './readinessEngine'

function hk(): any {
  return NativeModules.AppleHealthKit
}

// Pure helper — filter SDNN samples to overnight hours (9pm–10am) to exclude
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
  const HK = hk()
  if (!HK?.getHeartRateVariabilitySamples) return { values: [], sampleDays: 0 }

  return new Promise(resolve => {
    HK.getHeartRateVariabilitySamples(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: number; startDate: string }>) => {
        if (err || !Array.isArray(results)) {
          resolve({ values: [], sampleDays: 0 })
          return
        }
        const overnight = results.filter(s => {
          const h = new Date(s.startDate).getHours()
          return h >= 21 || h < 10
        })
        const distinctDates = new Set(overnight.map(s => s.startDate.split('T')[0]))
        resolve({ values: overnight.map(s => s.value), sampleDays: distinctDates.size })
      },
    )
  })
}

// Daily resting heart rate samples across the date range (Apple writes one per day).
export async function fetchRHR(startDate: Date, endDate: Date): Promise<number[]> {
  const HK = hk()
  if (!HK?.getRestingHeartRateSamples) return []

  return new Promise(resolve => {
    HK.getRestingHeartRateSamples(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: number }>) => {
        if (err || !Array.isArray(results)) { resolve([]); return }
        resolve(results.map(r => r.value))
      },
    )
  })
}

// Sleep analysis for a single night identified by date string (YYYY-MM-DD).
// Queries 6pm the day before to 2pm on the given date to capture the full night.
export async function fetchSleepSamples(date: string): Promise<SleepWindow | null> {
  const HK = hk()
  if (!HK?.getSleepSamples) return null

  const prevDay = new Date(date)
  prevDay.setDate(prevDay.getDate() - 1)
  const windowStart = new Date(prevDay)
  windowStart.setHours(18, 0, 0, 0)

  const windowEnd = new Date(date)
  windowEnd.setHours(14, 0, 0, 0)

  return new Promise(resolve => {
    HK.getSleepSamples(
      { startDate: windowStart.toISOString(), endDate: windowEnd.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: string; startDate: string; endDate: string }>) => {
        if (err || !Array.isArray(results) || results.length === 0) { resolve(null); return }

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

        if (sleepHours === 0) { resolve(null); return }

        resolve({
          sleepHours,
          timeInBed:  inBedHours > 0 ? inBedHours : sleepHours,
          deepHours:  hasStages ? deepHours : null,
          remHours:   hasStages ? remHours  : null,
        })
      },
    )
  })
}

// Total active energy per day across the date range, as an array of per-day sums.
// Uses getActivitySummary which returns one entry per day.
export async function fetchActivityLoad(startDate: Date, endDate: Date): Promise<number[]> {
  const HK = hk()
  if (!HK?.getActivitySummary) return []

  return new Promise(resolve => {
    HK.getActivitySummary(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      (err: unknown, results: unknown) => {
        if (err || !Array.isArray(results)) { resolve([]); return }
        const loads = (results as Array<{ activeEnergyBurned?: number }>)
          .map(d => d.activeEnergyBurned ?? 0)
          .filter(v => v > 0)
        resolve(loads)
      },
    )
  })
}
