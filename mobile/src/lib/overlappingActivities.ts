/**
 * Card 216. One run, two workouts.
 *
 * Emma's week showed 12.89 km in Virra against 10.7 km on her Garmin. The three
 * rows behind that number were:
 *
 *   25 Aug 16:44:59   2.20 km   20 min   Health import
 *   25 Aug 16:45:22   4.60 km   41 min   Health import
 *   28 Aug 10:44:43   6.09 km   45 min   Health import
 *
 * The first two start 23 seconds apart and their windows overlap almost
 * entirely: one run reached HealthKit as two workouts, with two different
 * UUIDs. Garmin's own two runs are the 4.60 and the 6.09, which is the 10.7 she
 * expected.
 *
 * So this is NOT the cross-source duplicate the card first assumed, and the
 * import's `(user_id, started_at)` upsert could never have caught it: the
 * timestamps genuinely differ and both rows are legitimately distinct records.
 * What makes them wrong is that they describe the same stretch of time.
 *
 * Deduping at READ time rather than on import is deliberate. The rows already
 * in production are wrong today, and a read-time rule fixes the numbers without
 * a migration and without deleting anything a user might still want to see in
 * their activity list.
 */

export interface OverlapCandidate {
  started_at:       string;
  duration_seconds: number | null;
  distance_meters:  number | null;
}

/**
 * Two activities collide when one starts before the other ends. Keep the
 * longer: a split workout is a fragment of the real one, so the longest row is
 * the closest thing to the session the runner actually did.
 *
 * Equal durations keep the greater distance, then the earlier start, so the
 * result never depends on the order rows arrive in.
 */
export function dropOverlapping<T extends OverlapCandidate>(rows: T[]): T[] {
  const ordered = [...rows].sort((a, b) => {
    const byDuration = (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0);
    if (byDuration !== 0) return byDuration;
    const byDistance = (b.distance_meters ?? 0) - (a.distance_meters ?? 0);
    if (byDistance !== 0) return byDistance;
    return a.started_at.localeCompare(b.started_at);
  });

  const kept: { start: number; end: number; row: T }[] = [];
  for (const row of ordered) {
    const start = new Date(row.started_at).getTime();
    if (Number.isNaN(start)) continue;
    const end = start + (row.duration_seconds ?? 0) * 1000;
    // Strict overlap: a run that starts exactly as another ends is a genuine
    // back-to-back session, not a fragment.
    const collides = kept.some((k) => start < k.end && end > k.start);
    if (!collides) kept.push({ start, end, row });
  }

  // Back to chronological order, so callers can keep treating this as a list of
  // activities rather than a ranking.
  return kept.sort((a, b) => a.start - b.start).map((k) => k.row);
}

/** Kilometres, once overlapping fragments of the same session are removed. */
export function sumDistinctKm(rows: OverlapCandidate[]): number {
  return dropOverlapping(rows).reduce((acc, r) => acc + (r.distance_meters ?? 0), 0) / 1000;
}
