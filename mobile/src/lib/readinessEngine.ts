// mobile/src/lib/readinessEngine.ts

export type Confidence = 'high' | 'medium' | 'low'
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal'

export interface ReadinessBaseline {
  hrvMean: number
  hrvSD: number
  rhrMean: number
  rhrSD: number
  sleepNeedHours: number        // personalised or default 8.0
  chronicLoad: number           // 28-day rolling mean of daily active energy (kcal)
  lastUpdated: string           // YYYY-MM-DD
  sampleDays: number            // distinct days with HRV data
}

export interface DailyReadiness {
  date: string                  // YYYY-MM-DD
  score: number                 // 0–100
  confidence: Confidence
  hrvSub: number
  rhrSub: number
  sleepSub: number
  loadSub: number
  checkinSub: number | null
  phase: CyclePhase | null
  rawInputs: Record<string, unknown>
}

export interface SleepDebt {
  hours: number
  windowDays: number            // 14
  trend: 'accruing' | 'recovering' | 'stable'
  lastUpdated: string
}

export interface TodayInputs {
  hrv: number | null
  rhr: number | null
  sleepHours: number | null
  timeInBed: number | null
  deepHours: number | null      // null when watch doesn't report sleep stages
  remHours: number | null
  acuteLoad7day: number | null  // total active energy burned over last 7 days (kcal)
  checkin: { energy: number; mood: number; sleep_quality: number } | null
}

export interface SleepWindow {
  sleepHours: number
  timeInBed: number
  deepHours: number | null
  remHours: number | null
}

// All tuning constants in one place — tune on real data, never hardcode inline
export const READINESS_CONFIG = {
  deviationK: 15,               // z-score multiplier (1 SD → 65, 2 SD → 80)
  weights: { hrv: 0.35, rhr: 0.20, sleep: 0.25, load: 0.20 },
  sleepWeights: { duration: 0.50, continuity: 0.25, stage: 0.25 },
  sleepWeightsFallbackNoStages: { duration: 0.65, continuity: 0.35 },
  acwrThresholds: { low: 0.8, sweet: 1.3, caution: 1.5 },
  sleepEfficiencyRange: 0.25,   // denominator in continuity formula; maps 0.70→0.95 to 0–100
  sleepRestorativeTarget: 0.40, // fraction of sleep that should be deep+REM
  confidenceThresholds: { high: 60, medium: 21 },
} as const

// Population priors — used in v1; replaced by per-user learned offsets post-launch
export const PHASE_OFFSETS: Record<CyclePhase, { hrv: number; rhr: number }> = {
  menstrual:  { hrv: -0.05, rhr: +1.0 },
  follicular: { hrv: +0.05, rhr: -1.0 },
  ovulatory:  { hrv:  0.00, rhr:  0.0 },
  luteal:     { hrv: -0.12, rhr: +3.0 },
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function computeHrvSub(hrv: number | null, baseline: ReadinessBaseline, phase: CyclePhase | null): number {
  if (hrv === null || baseline.hrvSD === 0) return 50
  const offset = phase ? PHASE_OFFSETS[phase].hrv : 0
  const expected = baseline.hrvMean * (1 + offset)
  const z = (hrv - expected) / baseline.hrvSD
  return clamp(50 + READINESS_CONFIG.deviationK * z, 0, 100)
}

function computeRhrSub(rhr: number | null, baseline: ReadinessBaseline, phase: CyclePhase | null): number {
  if (rhr === null || baseline.rhrSD === 0) return 50
  const offset = phase ? PHASE_OFFSETS[phase].rhr : 0
  const expected = baseline.rhrMean + offset
  const z = (rhr - expected) / baseline.rhrSD
  return clamp(50 - READINESS_CONFIG.deviationK * z, 0, 100)
}

function computeSleepSub(inputs: TodayInputs, sleepNeedHours: number): number {
  if (inputs.sleepHours === null) return 50

  const { sleepHours, timeInBed, deepHours, remHours } = inputs
  const durationScore = clamp(100 * (sleepHours / sleepNeedHours), 0, 100)

  if (timeInBed === null) return durationScore

  const efficiency = timeInBed > 0 ? sleepHours / timeInBed : 0
  const continuityScore = clamp(
    100 * (efficiency - 0.70) / READINESS_CONFIG.sleepEfficiencyRange,
    0, 100,
  )

  const hasStages = deepHours !== null && remHours !== null
  if (!hasStages) {
    const { duration, continuity } = READINESS_CONFIG.sleepWeightsFallbackNoStages
    return clamp(duration * durationScore + continuity * continuityScore, 0, 100)
  }

  const restorativeFrac = (deepHours! + remHours!) / sleepHours
  const stageScore = clamp(100 * restorativeFrac / READINESS_CONFIG.sleepRestorativeTarget, 0, 100)
  const { duration, continuity, stage } = READINESS_CONFIG.sleepWeights
  return clamp(duration * durationScore + continuity * continuityScore + stage * stageScore, 0, 100)
}

function computeLoadSub(acuteLoad7day: number | null, chronicLoad: number): number {
  if (acuteLoad7day === null || chronicLoad === 0) return 70
  const acwr = acuteLoad7day / chronicLoad
  const { low, sweet, caution } = READINESS_CONFIG.acwrThresholds
  if (acwr <= low)     return 70
  if (acwr <= sweet)   return 100
  if (acwr <= caution) return 80
  return Math.max(40, 100 - (acwr - caution) * 60)
}

function computeCheckinSub(checkin: TodayInputs['checkin']): number | null {
  if (checkin === null) return null
  const avg = (checkin.energy + checkin.mood + checkin.sleep_quality) / 3
  return clamp(((avg - 1) / 4) * 100, 0, 100)
}

function computeConfidence(sampleDays: number): Confidence {
  const { high, medium } = READINESS_CONFIG.confidenceThresholds
  if (sampleDays >= high)   return 'high'
  if (sampleDays >= medium) return 'medium'
  return 'low'
}

export function computeReadiness(
  inputs: TodayInputs,
  baseline: ReadinessBaseline,
  phase: CyclePhase | null,
): DailyReadiness {
  const date = new Date().toISOString().split('T')[0]

  const hrvSub     = computeHrvSub(inputs.hrv, baseline, phase)
  const rhrSub     = computeRhrSub(inputs.rhr, baseline, phase)
  const sleepSub   = computeSleepSub(inputs, baseline.sleepNeedHours)
  const loadSub    = computeLoadSub(inputs.acuteLoad7day, baseline.chronicLoad)
  const checkinSub = computeCheckinSub(inputs.checkin)

  const { hrv: wHrv, rhr: wRhr, sleep: wSleep, load: wLoad } = READINESS_CONFIG.weights
  const raw = wHrv * hrvSub + wRhr * rhrSub + wSleep * sleepSub + wLoad * loadSub

  const score = clamp(
    checkinSub !== null ? Math.round(0.8 * raw + 0.2 * checkinSub) : Math.round(raw),
    0, 100,
  )

  return {
    date,
    score,
    confidence: computeConfidence(baseline.sampleDays),
    hrvSub,
    rhrSub,
    sleepSub,
    loadSub,
    checkinSub,
    phase,
    rawInputs: { ...inputs },
  }
}
