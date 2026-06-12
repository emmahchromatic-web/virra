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
