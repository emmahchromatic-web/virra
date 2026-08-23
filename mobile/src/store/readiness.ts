// mobile/src/store/readiness.ts

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { computeReadiness } from '@/lib/readinessEngine'
import type { DailyReadiness, CyclePhase } from '@/lib/readinessEngine'
import { updateBaseline, isBackfillDone } from '@/lib/readinessBaseline'
import {
  fetchOvernightHRV, fetchRHR, fetchSleepSamples,
  fetchActivityLoad, mean,
} from '@/lib/healthKitReadiness'
import type { TodayCheckin } from '@/lib/dashboardData'

const DAILY_KEY = 'readiness_daily_v1'

interface ReadinessState {
  today:      DailyReadiness | null
  isLoading:  boolean
  isFirstRun: boolean   // true until first-run backfill completes; drives shimmer state
  refresh(phase: CyclePhase | null, checkin: TodayCheckin): Promise<void>
}

export const useReadinessStore = create<ReadinessState>((set, get) => ({
  today:      null,
  isLoading:  false,
  isFirstRun: false,

  async refresh(phase, checkin) {
    // Only show shimmer when there is no cached score yet; avoids flash on every foreground
    if (!get().today) set({ isLoading: true })

    try {
      const firstRun = !(await isBackfillDone())
      if (firstRun) set({ isFirstRun: true })

      const baseline = await updateBaseline(firstRun)

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const [{ values: hrvValues }, rhrValues, sleep, loadValues] = await Promise.all([
        fetchOvernightHRV(yesterday, today),
        fetchRHR(yesterday, today),
        fetchSleepSamples(todayStr),
        fetchActivityLoad(sevenDaysAgo, today),
      ])

      // TodayCheckin.sleep maps to sleep_quality in TodayInputs
      const checkinInput =
        checkin.done && checkin.energy && checkin.mood && checkin.sleep
          ? { energy: checkin.energy, mood: checkin.mood, sleep_quality: checkin.sleep }
          : null

      const readiness = computeReadiness(
        {
          hrv:           hrvValues.length ? mean(hrvValues) : null,
          rhr:           rhrValues.length ? mean(rhrValues) : null,
          sleepHours:    sleep?.sleepHours  ?? null,
          timeInBed:     sleep?.timeInBed   ?? null,
          deepHours:     sleep?.deepHours   ?? null,
          remHours:      sleep?.remHours    ?? null,
          acuteLoad7day: loadValues.length  ? loadValues.reduce((s, v) => s + v, 0) / loadValues.length : null,
          checkin:       checkinInput,
        },
        baseline,
        phase,
      )

      // Persist to daily cache; evict entries older than 14 days
      const raw = await AsyncStorage.getItem(DAILY_KEY)
      const cache: Record<string, DailyReadiness> = raw ? JSON.parse(raw) : {}
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      Object.keys(cache).forEach(k => { if (k < cutoffStr) delete cache[k] })
      cache[todayStr] = readiness
      await AsyncStorage.setItem(DAILY_KEY, JSON.stringify(cache))

      set({ today: readiness, isLoading: false, isFirstRun: false })
    } catch (e) {
      console.warn('[readiness] refresh error:', e instanceof Error ? e.message : String(e))
      set({ isLoading: false, isFirstRun: false })
    }
  },
}))
