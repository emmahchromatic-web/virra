import { haversineMeters, createRunTrackState, addGpsPoint, type GpsPoint } from '@/lib/runTracking';

// ~100m per step north, starting at a fixed point. 1 degree latitude ≈ 111.32km.
const LAT_STEP = 0.0009;
const START = { lat: 51.5, lon: -0.1 };

function pointAt(step: number, ts: number): GpsPoint {
  return { lat: START.lat + LAT_STEP * step, lon: START.lon, ts };
}

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    const p = pointAt(0, 0);
    expect(haversineMeters(p, p)).toBeCloseTo(0, 3);
  });

  it('returns a plausible distance for a ~100m step', () => {
    const d = haversineMeters(pointAt(0, 0), pointAt(1, 1000));
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('addGpsPoint', () => {
  const startedAtMs = 0;

  it('does not accumulate distance from a single point', () => {
    const state = addGpsPoint(createRunTrackState(), pointAt(0, 0), startedAtMs, 0);
    expect(state.distanceM).toBe(0);
    expect(state.trace).toHaveLength(1);
  });

  it('accumulates distance across points without mutating the input state', () => {
    const initial = createRunTrackState();
    const afterFirst = addGpsPoint(initial, pointAt(0, 0), startedAtMs, 0);
    const afterSecond = addGpsPoint(afterFirst, pointAt(1, 1000), startedAtMs, 0);

    expect(initial.trace).toHaveLength(0); // original untouched
    expect(afterFirst.distanceM).toBe(0);
    expect(afterSecond.distanceM).toBeGreaterThan(90);
  });

  it('records a split the moment cumulative distance crosses 1km, with correct elapsed time', () => {
    let state = createRunTrackState();
    // 11 steps of ~100m ≈ 1.1km, one point per second.
    for (let i = 0; i <= 11; i++) {
      state = addGpsPoint(state, pointAt(i, i * 1000), startedAtMs, 0);
    }
    expect(state.splits).toHaveLength(1);
    expect(state.distanceM).toBeGreaterThan(1000);
    // The split should land close to 10s in (10 steps of ~100m to cross 1000m).
    expect(state.splits[0]).toBeGreaterThan(5);
    expect(state.splits[0]).toBeLessThan(15);
  });

  it('accounts for paused time when deriving elapsed seconds for a split', () => {
    let state = createRunTrackState();
    for (let i = 0; i <= 11; i++) {
      // Same point timestamps as above, but with a 5s pause subtracted.
      state = addGpsPoint(state, pointAt(i, i * 1000), startedAtMs, 5000);
    }
    expect(state.splits).toHaveLength(1);
    expect(state.splits[0]).toBeGreaterThanOrEqual(0);
    expect(state.splits[0]).toBeLessThan(10); // shifted earlier than the no-pause case
  });

  it('computes a current pace once enough recent points exist', () => {
    let state = createRunTrackState();
    for (let i = 0; i <= 5; i++) {
      state = addGpsPoint(state, pointAt(i, i * 1000), startedAtMs, 0);
    }
    expect(state.currentPaceSecPerKm).not.toBeNull();
    expect(state.currentPaceSecPerKm!).toBeGreaterThan(0);
  });

  it('ignores GPS noise (near-zero movement) for current pace', () => {
    let state = createRunTrackState();
    state = addGpsPoint(state, { lat: START.lat, lon: START.lon, ts: 0 }, startedAtMs, 0);
    state = addGpsPoint(state, { lat: START.lat, lon: START.lon, ts: 1000 }, startedAtMs, 0);
    expect(state.currentPaceSecPerKm).toBeNull();
  });
});
