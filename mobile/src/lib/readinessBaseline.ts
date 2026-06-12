// mobile/src/lib/readinessBaseline.ts

import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetchOvernightHRV, fetchRHR, fetchActivityLoad } from './healthKitReadiness'
import type { ReadinessBaseline, SleepDebt } from './readinessEngine'

const BASELINE_KEY = 'readiness_baseline_v1'
const DEBT_KEY     = 'readiness_sleep_debt_v1'
export const BACKFILL_KEY = 'readiness_backfill_done_v1'

const SD_FLOOR = 1

export function rollingMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function rollingSD(values: number[], mean: number): number {
  if (values.length < 2) return SD_FLOOR
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) || SD_FLOOR
}

export async function isBackfillDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(BACKFILL_KEY)) === '1'
}

export async function loadBaseline(): Promise<ReadinessBaseline | null> {
  const raw = await AsyncStorage.getItem(BASELINE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ReadinessBaseline } catch { return null }
}

async function saveBaseline(b: ReadinessBaseline): Promise<void> {
  await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(b))
}

function defaultBaseline(today: string): ReadinessBaseline {
  return {
    hrvMean: 50, hrvSD: 10,
    rhrMean: 60, rhrSD: 5,
    sleepNeedHours: 8,
    chronicLoad: 300,
    lastUpdated: today,
    sampleDays: 0,
  }
}

// Runs once per day on first app foreground.
// isFirstRun = true → queries up to 2 years of history (backfill).
// isFirstRun = false → standard 60-day rolling window, skipped if already ran today.
export async function updateBaseline(isFirstRun: boolean): Promise<ReadinessBaseline> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const existing = await loadBaseline()

  if (!isFirstRun && existing?.lastUpdated === todayStr) return existing

  const windowDays = isFirstRun ? 730 : 60
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - windowDays)

  try {
    const [hrvResult, rhrValues, loadValues] = await Promise.all([
      fetchOvernightHRV(windowStart, today),
      fetchRHR(windowStart, today),
      fetchActivityLoad(windowStart, today),
    ])

    const { values: hrvValues, sampleDays } = hrvResult
    const hrvMean = rollingMean(hrvValues) || existing?.hrvMean || 50
    const rhrMean = rollingMean(rhrValues) || existing?.rhrMean || 60

    const recentLoad = loadValues.slice(-28)
    const chronicLoad = rollingMean(recentLoad) || existing?.chronicLoad || 300

    const baseline: ReadinessBaseline = {
      hrvMean,
      hrvSD:    rollingSD(hrvValues, hrvMean) || existing?.hrvSD || 10,
      rhrMean,
      rhrSD:    rollingSD(rhrValues, rhrMean) || existing?.rhrSD || 5,
      sleepNeedHours: existing?.sleepNeedHours ?? 8.0,
      chronicLoad,
      lastUpdated: todayStr,
      sampleDays: Math.min(sampleDays, 60),
    }

    await saveBaseline(baseline)
    if (isFirstRun) await AsyncStorage.setItem(BACKFILL_KEY, '1')

    return baseline
  } catch {
    if (existing) return existing
    return defaultBaseline(todayStr)
  }
}

// Rolling sleep-debt accumulator. Output for the Haiku insights engine —
// not fed back into the daily score (which already penalises short sleep via sleepSub).
export async function updateSleepDebt(
  sleepHours: number,
  sleepNeedHours: number,
): Promise<SleepDebt> {
  const raw = await AsyncStorage.getItem(DEBT_KEY)
  const existing: SleepDebt | null = raw ? JSON.parse(raw) : null

  const dailyDeficit = Math.max(0, sleepNeedHours - sleepHours)
  const prevHours = existing?.hours ?? 0
  const decayFactor = (14 - 1) / 14
  const newHours = parseFloat((prevHours * decayFactor + dailyDeficit).toFixed(1))

  const trend: SleepDebt['trend'] =
    newHours > prevHours ? 'accruing' :
    newHours < prevHours ? 'recovering' : 'stable'

  const debt: SleepDebt = {
    hours: newHours,
    windowDays: 14,
    trend,
    lastUpdated: new Date().toISOString().split('T')[0],
  }

  await AsyncStorage.setItem(DEBT_KEY, JSON.stringify(debt))
  return debt
}
