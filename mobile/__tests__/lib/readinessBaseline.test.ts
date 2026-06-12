// mobile/__tests__/lib/readinessBaseline.test.ts

import { rollingMean, rollingSD } from '@/lib/readinessBaseline'

describe('rollingMean', () => {
  it('returns the mean of an array', () => {
    expect(rollingMean([10, 20, 30])).toBe(20)
    expect(rollingMean([50])).toBe(50)
  })

  it('returns 0 for an empty array', () => {
    expect(rollingMean([])).toBe(0)
  })
})

describe('rollingSD', () => {
  it('returns the population SD', () => {
    // values [2, 4, 4, 4, 5, 5, 7, 9], mean = 5, variance = 4, SD = 2
    expect(rollingSD([2, 4, 4, 4, 5, 5, 7, 9], 5)).toBe(2)
  })

  it('returns 1 for a single value to avoid division by zero', () => {
    expect(rollingSD([50], 50)).toBe(1)
  })

  it('returns 1 for an empty array', () => {
    expect(rollingSD([], 0)).toBe(1)
  })
})
