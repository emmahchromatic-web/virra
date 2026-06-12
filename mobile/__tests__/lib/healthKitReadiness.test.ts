// mobile/__tests__/lib/healthKitReadiness.test.ts

import { filterToOvernightHours } from '@/lib/healthKitReadiness'

describe('filterToOvernightHours', () => {
  it('keeps samples at 9pm, midnight, 2am, and 9:59am', () => {
    const samples = [
      { value: 45, startDate: '2026-06-11T21:30:00' },   // 9:30pm — keep
      { value: 38, startDate: '2026-06-12T00:00:00' },   // midnight — keep
      { value: 52, startDate: '2026-06-12T02:00:00' },   // 2am — keep
      { value: 51, startDate: '2026-06-12T09:59:00' },   // 9:59am — keep
    ]
    expect(filterToOvernightHours(samples)).toEqual([45, 38, 52, 51])
  })

  it('excludes samples at 10am and later', () => {
    const samples = [
      { value: 44, startDate: '2026-06-12T10:00:00' },   // 10am — exclude
      { value: 39, startDate: '2026-06-12T14:00:00' },   // 2pm — exclude
      { value: 48, startDate: '2026-06-12T20:59:00' },   // 8:59pm — exclude
    ]
    expect(filterToOvernightHours(samples)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(filterToOvernightHours([])).toEqual([])
  })
})
