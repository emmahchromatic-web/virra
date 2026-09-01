import { dropOverlapping, sumDistinctKm } from '@/lib/overlappingActivities';

/** Emma's real week, from production. 12.89 km in Virra against 10.7 on Garmin. */
const EMMAS_WEEK = [
  { started_at: '2026-08-25T15:44:59Z', duration_seconds: 20 * 60, distance_meters: 2200 },
  { started_at: '2026-08-25T15:45:22Z', duration_seconds: 41 * 60, distance_meters: 4600 },
  { started_at: '2026-08-28T09:44:43Z', duration_seconds: 45 * 60, distance_meters: 6090 },
];

describe('dropOverlapping — card 216', () => {
  it('drops the fragment and keeps the real run', () => {
    const kept = dropOverlapping(EMMAS_WEEK);
    expect(kept).toHaveLength(2);
    expect(kept.map((r) => r.distance_meters)).toEqual([4600, 6090]);
  });

  it('produces the number Garmin produces', () => {
    // 4.60 + 6.09 = 10.69, which is the 10.7 Emma expected.
    expect(sumDistinctKm(EMMAS_WEEK)).toBeCloseTo(10.69, 2);
  });

  it('counted 12.89 before the fix', () => {
    // Guards the regression by pinning what the naive sum gives.
    const naive = EMMAS_WEEK.reduce((a, r) => a + r.distance_meters, 0) / 1000;
    expect(naive).toBeCloseTo(12.89, 2);
  });

  it('keeps genuine back-to-back runs that merely touch', () => {
    // A run starting exactly as another ends is a real second session, not a
    // fragment. Strict overlap, not inclusive.
    const touching = [
      { started_at: '2026-08-25T10:00:00Z', duration_seconds: 1800, distance_meters: 5000 },
      { started_at: '2026-08-25T10:30:00Z', duration_seconds: 1800, distance_meters: 5000 },
    ];
    expect(dropOverlapping(touching)).toHaveLength(2);
  });

  it('keeps runs on different days', () => {
    expect(dropOverlapping([EMMAS_WEEK[0], EMMAS_WEEK[2]])).toHaveLength(2);
  });

  it('does not depend on the order rows arrive in', () => {
    const forward  = dropOverlapping(EMMAS_WEEK).map((r) => r.started_at);
    const reversed = dropOverlapping([...EMMAS_WEEK].reverse()).map((r) => r.started_at);
    expect(reversed).toEqual(forward);
  });

  it('returns rows in chronological order', () => {
    const kept = dropOverlapping([...EMMAS_WEEK].reverse());
    expect(kept.map((r) => r.started_at)).toEqual([...kept].map((r) => r.started_at).sort());
  });

  it('survives a missing duration or distance', () => {
    const messy = [
      { started_at: '2026-08-25T10:00:00Z', duration_seconds: null, distance_meters: null },
      { started_at: '2026-08-25T10:00:00Z', duration_seconds: 600,  distance_meters: 2000 },
    ];
    // The zero-length row cannot overlap anything, so both survive and only the
    // real distance counts.
    expect(sumDistinctKm(messy)).toBeCloseTo(2, 2);
  });

  it('ignores an unparseable timestamp rather than throwing', () => {
    expect(dropOverlapping([{ started_at: 'not a date', duration_seconds: 60, distance_meters: 1000 }])).toHaveLength(0);
  });
});
