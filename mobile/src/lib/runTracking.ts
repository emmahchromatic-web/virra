export interface GpsPoint { lat: number; lon: number; ts: number; alt?: number }

export interface RunTrackState {
  trace:               GpsPoint[];
  distanceM:            number;
  splits:               number[];  // sec/km per completed km
  lastSplitElapsedS:    number;
  currentPaceSecPerKm:  number | null;
}

export function haversineMeters(a: GpsPoint, b: GpsPoint): number {
  const R    = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x    = Math.sin(dLat / 2) ** 2
             + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
             * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function createRunTrackState(): RunTrackState {
  return { trace: [], distanceM: 0, splits: [], lastSplitElapsedS: 0, currentPaceSecPerKm: null };
}

// Pure so it works identically whether a point arrives live in the foreground
// or is delivered later by the background location task — elapsed time is
// derived from the point's own timestamp, not a separately-ticking UI timer,
// so splits stay correct even for points collected while backgrounded.
export function addGpsPoint(
  state:       RunTrackState,
  point:       GpsPoint,
  startedAtMs: number,
  pausedMs:    number,
): RunTrackState {
  const trace = [...state.trace, point];
  if (trace.length < 2) return { ...state, trace };

  const delta     = haversineMeters(trace[trace.length - 2], trace[trace.length - 1]);
  const distanceM = state.distanceM + delta;
  const elapsedS  = Math.max(0, Math.floor((point.ts - startedAtMs - pausedMs) / 1000));

  const kmNow  = Math.floor(distanceM / 1000);
  const kmPrev = Math.floor(state.distanceM / 1000);
  let splits            = state.splits;
  let lastSplitElapsedS = state.lastSplitElapsedS;
  if (kmNow > kmPrev) {
    splits            = [...splits, elapsedS - lastSplitElapsedS];
    lastSplitElapsedS = elapsedS;
  }

  // Current pace: distance + time over the last ~30s of points.
  const cutoff = point.ts - 30000;
  const recent = trace.filter((p) => p.ts >= cutoff);
  let currentPaceSecPerKm: number | null = null;
  if (recent.length >= 2) {
    let d = 0;
    for (let i = 1; i < recent.length; i++) d += haversineMeters(recent[i - 1], recent[i]);
    const t = (recent[recent.length - 1].ts - recent[0].ts) / 1000;
    currentPaceSecPerKm = d > 10 && t > 0 ? Math.round(t / (d / 1000)) : null;
  }

  return { trace, distanceM, splits, lastSplitElapsedS, currentPaceSecPerKm };
}
