// mobile/__tests__/lib/readinessEngine.test.ts

import { computeReadiness } from '@/lib/readinessEngine'
import type { ReadinessBaseline, TodayInputs } from '@/lib/readinessEngine'

const BASELINE: ReadinessBaseline = {
  hrvMean: 50, hrvSD: 10,
  rhrMean: 60, rhrSD: 5,
  sleepNeedHours: 8,
  chronicLoad: 400,
  lastUpdated: '2026-06-12',
  sampleDays: 60,
}

const FULL_INPUTS: TodayInputs = {
  hrv: 50, rhr: 60,
  sleepHours: 8, timeInBed: 8.5, deepHours: 1.6, remHours: 1.6,
  acuteLoad7day: 400,
  checkin: null,
}

describe('computeReadiness', () => {
  it('returns score ~72 and high confidence for at-mean inputs', () => {
    const r = computeReadiness(FULL_INPUTS, BASELINE, null)
    expect(r.score).toBe(72)
    expect(r.confidence).toBe('high')
    expect(r.hrvSub).toBe(50)
    expect(r.rhrSub).toBe(50)
    expect(r.loadSub).toBe(100)
    expect(r.checkinSub).toBeNull()
  })

  it('raises hrvSub when HRV is 1 SD above mean', () => {
    const r = computeReadiness({ ...FULL_INPUTS, hrv: 60 }, BASELINE, null)
    expect(r.hrvSub).toBe(65)
  })

  it('lowers rhrSub when RHR is 1 SD above mean (worse)', () => {
    const r = computeReadiness({ ...FULL_INPUTS, rhr: 65 }, BASELINE, null)
    expect(r.rhrSub).toBe(35)
  })

  it('raises hrvSub in luteal phase (same HRV reads higher after correction)', () => {
    const noPhase = computeReadiness(FULL_INPUTS, BASELINE, null)
    const luteal  = computeReadiness(FULL_INPUTS, BASELINE, 'luteal')
    expect(luteal.hrvSub).toBe(59)
    expect(luteal.hrvSub).toBeGreaterThan(noPhase.hrvSub)
  })

  it('sets confidence based on sampleDays', () => {
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 60 }, null).confidence).toBe('high')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 59 }, null).confidence).toBe('medium')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 21 }, null).confidence).toBe('medium')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 20 }, null).confidence).toBe('low')
  })

  it('blends check-in (20%) with objective score (80%)', () => {
    const r = computeReadiness(
      { ...FULL_INPUTS, checkin: { energy: 2, mood: 2, sleep_quality: 2 } },
      BASELINE,
      null,
    )
    expect(r.checkinSub).toBe(25)
    expect(r.score).toBe(63)
  })

  it('returns neutral sub-score (50) when HRV is null', () => {
    const r = computeReadiness({ ...FULL_INPUTS, hrv: null }, BASELINE, null)
    expect(r.hrvSub).toBe(50)
  })

  it('returns neutral sub-score (50) when RHR is null', () => {
    const r = computeReadiness({ ...FULL_INPUTS, rhr: null }, BASELINE, null)
    expect(r.rhrSub).toBe(50)
  })

  describe('loadSub ACWR curve', () => {
    it('returns 70 when under-training (acwr < 0.8)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 300 }, BASELINE, null)
      expect(r.loadSub).toBe(70)
    })

    it('returns 100 in sweet spot (0.8 ≤ acwr ≤ 1.3)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 440 }, BASELINE, null)
      expect(r.loadSub).toBe(100)
    })

    it('returns 80 in caution zone (1.3 < acwr ≤ 1.5)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 560 }, BASELINE, null)
      expect(r.loadSub).toBe(80)
    })

    it('applies overreaching penalty above 1.5', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 720 }, BASELINE, null)
      expect(r.loadSub).toBe(82)
    })

    it('floors loadSub at 40 in extreme overreaching', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 1600 }, BASELINE, null)
      expect(r.loadSub).toBe(40)
    })
  })

  it('uses fallback weights when sleep stages are absent', () => {
    const r = computeReadiness(
      { ...FULL_INPUTS, deepHours: null, remHours: null },
      BASELINE,
      null,
    )
    expect(r.sleepSub).toBeGreaterThan(95)
    expect(r.sleepSub).toBeLessThanOrEqual(100)
  })

  it('clamps score between 0 and 100', () => {
    const r = computeReadiness({ ...FULL_INPUTS, hrv: 200, rhr: 30 }, BASELINE, null)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })

  it('returns score 54 when all inputs are null', () => {
    const r = computeReadiness(
      { hrv: null, rhr: null, sleepHours: null, timeInBed: null,
        deepHours: null, remHours: null, acuteLoad7day: null, checkin: null },
      BASELINE,
      null,
    )
    expect(r.score).toBe(54)
  })
})
