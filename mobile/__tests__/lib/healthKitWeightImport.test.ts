/**
 * The import's WRITE path, which had no test at all.
 *
 * `sampleToRow` was tested and correct: with no period start it returns a row
 * whose phase is null, which is the honest answer. What nobody tested was what
 * the import then DID with that row, and the answer was that it upserted the
 * null straight over whatever stamp the row already carried.
 *
 * Same shape as card 224 and card 246: the unit was right, the boundary was
 * never exercised.
 */
const mockUpsert = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }) },
}));

jest.mock('@/lib/weightBaselineDispatcher', () => ({ recomputeBaseline: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/permissionsConfig', () => ({ initHealthKitForSession: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/store/profile', () => ({
  useProfileStore: { getState: () => ({ bumpWeightDataVersion: jest.fn() }) },
}));
jest.mock('react-native-health', () => ({ Constants: { Units: { gram: 'gram' } } }), { virtual: true });

const mockGetWeightSamples = jest.fn();
jest.mock('react-native', () => ({
  NativeModules: { AppleHealthKit: { getWeightSamples: (...a: unknown[]) => mockGetWeightSamples(...a) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { importNewWeightSamples } from '@/lib/healthKitWeight';

const SAMPLES = [
  { value: 58200, startDate: '2026-08-20T07:00:00.000Z', endDate: '2026-08-20T07:00:00.000Z' },
  { value: 58400, startDate: '2026-08-21T07:00:00.000Z', endDate: '2026-08-21T07:00:00.000Z' },
];

beforeEach(async () => {
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockGetWeightSamples.mockReset().mockImplementation((_opts: unknown, cb: (e: string | null, r: unknown[]) => void) => cb(null, SAMPLES));
  await AsyncStorage.clear();
});

describe('importNewWeightSamples', () => {
  it('never writes a null phase over a stamp the row already has', async () => {
    // No period start: sampleToRow cannot stamp anything, which is correct.
    await importNewWeightSamples({ userId: 'u1', periodStart: null, cycleLength: 28 });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [payload] = mockUpsert.mock.calls[0] as [Record<string, unknown>[]];

    // The phase columns must be ABSENT, not null. Present-and-null lands in the
    // ON CONFLICT SET list and destroys the existing value; absent does not.
    for (const row of payload) {
      expect(row).not.toHaveProperty('cycle_phase_at_time');
      expect(row).not.toHaveProperty('cycle_day_at_time');
      expect(row).toHaveProperty('weight_kg');
      expect(row).toHaveProperty('recorded_on');
    }
  });

  it('writes the phase whole when it can be worked out', async () => {
    await importNewWeightSamples({ userId: 'u1', periodStart: new Date('2026-08-17'), cycleLength: 28 });

    const stamped = (mockUpsert.mock.calls as [Record<string, unknown>[]][])
      .flatMap(([payload]) => payload)
      .filter((r) => 'cycle_phase_at_time' in r);

    expect(stamped.length).toBe(2);
    for (const row of stamped) expect(row.cycle_phase_at_time).not.toBeNull();
  });

  it('splits the write when only some readings can be stamped', async () => {
    // A period start recent enough that the older reading falls outside the
    // 60-day retro window while the newer one does not.
    mockGetWeightSamples.mockImplementation((_o: unknown, cb: (e: string | null, r: unknown[]) => void) => cb(null, [
      { value: 58000, startDate: '2026-01-01T07:00:00.000Z', endDate: '2026-01-01T07:00:00.000Z' },
      { value: 58400, startDate: '2026-08-21T07:00:00.000Z', endDate: '2026-08-21T07:00:00.000Z' },
    ]));

    await importNewWeightSamples({ userId: 'u1', periodStart: new Date('2026-08-17'), cycleLength: 28 });

    const payloads = (mockUpsert.mock.calls as [Record<string, unknown>[]][]).map(([p]) => p);
    expect(payloads.length).toBe(2);

    const withPhase    = payloads.flat().filter((r) => 'cycle_phase_at_time' in r);
    const withoutPhase = payloads.flat().filter((r) => !('cycle_phase_at_time' in r));
    expect(withPhase.length).toBe(1);
    expect(withoutPhase.length).toBe(1);
    // The unstampable one is the old reading, and it keeps whatever it had.
    expect(withoutPhase[0].recorded_on).toBe('2026-01-01');
  });
});
