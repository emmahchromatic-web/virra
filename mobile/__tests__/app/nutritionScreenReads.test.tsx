import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

/**
 * Card offline-J2 follow-up. `loadData()` used to run its OWN direct
 * `nutrition_logs` read (to decide whether the user hand-overrode today's
 * load) on top of the cache-first store's `refresh()` read of the exact same
 * row -- two `nutrition_logs` reads per screen load where there was only one
 * before Task 5. This test pins the fixed behaviour: exactly one
 * `nutrition_logs` SELECT per mount, no matter that both the mount effect and
 * the focus effect ask for "today" at nearly the same moment.
 */

type FromOp = 'select' | 'upsert';
type FromCall = { table: string; op: FromOp };

/**
 * Ordering log, so the timing this test depends on is asserted rather than
 * assumed. `getDailyTrainingContext` is mocked SLOWER than the store's own
 * fetch below (2-3 real round trips vs. one), which is the production
 * relationship -- and the one the original version of this test had backwards.
 */
const mockOrder: string[] = [];
/** Longer than the store's mocked fetch, which resolves on microtasks. */
const MOCK_CTX_DELAY_MS = 50;

// Referenced inside the jest.mock factory below -- must be prefixed with
// "mock" so Babel's jest-hoist allows the reference across the hoist boundary
// (same convention already used by __tests__/app/offlinePlanScreens.test.tsx).
const mockFromCalls: FromCall[] = [];
const mockLogRow = { id: 'log1', training_load: 'easy', inferred_load: 'easy', targets_json: null };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      let recorded = false;
      const record = (op: FromOp) => {
        if (!recorded) {
          recorded = true;
          mockFromCalls.push({ table, op });
          mockOrder.push(`${table}:${op}`);
        }
      };
      const chain: any = {};
      chain.select = (..._args: any[]) => { record('select'); return chain; };
      chain.upsert = (..._args: any[]) => { record('upsert'); return chain; };
      chain.eq     = () => chain;
      chain.delete = () => chain;
      chain.maybeSingle = () => Promise.resolve(
        table === 'nutrition_logs' ? { data: mockLogRow, error: null } : { data: null, error: null },
      );
      chain.single = () => Promise.resolve({ data: { id: 'log1' }, error: null });
      // A plain `await supabase.from(x).select(...).eq(...)` (no maybeSingle/
      // single) resolves the chain object itself as a thenable.
      chain.then = (resolve: (v: unknown) => void) => resolve(
        table === 'food_entries' ? { data: [], error: null } : { data: null, error: null },
      );
      return chain;
    },
  },
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  Swipeable: ({ children }: any) => children,
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));

const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));

const mockCycle = { cycleInfo: null as null };
jest.mock('@/store/cycle', () => ({ useCycleStore: () => mockCycle }));

const mockProfileState = {
  weightSteadyBaselineKg: null, weightBaselineKg: null, heightCm: null, dateOfBirth: null, sex: null,
};
jest.mock('@/store/profile', () => {
  const useProfileStore: any = () => mockProfileState;
  useProfileStore.getState = () => mockProfileState;
  return {
    useProfileStore,
    personalMetricsFields: (s: any) => ({
      weightKg: s.weightSteadyBaselineKg ?? s.weightBaselineKg,
      heightCm: s.heightCm,
      dateOfBirth: s.dateOfBirth,
      sex: s.sex,
    }),
  };
});

jest.mock('@/lib/pro', () => ({ useIsPro: () => true }));
jest.mock('@/components/ui/ProLockedCard', () => ({ ProLockedCard: () => null }));
jest.mock('@/components/ui/FoodEntryEditModal', () => ({ FoodEntryEditModal: () => null }));
jest.mock('@/components/ui/CopyMealFromDayModal', () => ({ CopyMealFromDayModal: () => null }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn() }));

// PRODUCTION TIMING, not test-convenient timing. `getDailyTrainingContext`
// makes 2-3 real network round trips (hundreds of ms); the store's own
// `nutrition_logs` + `food_entries` read is a single, faster one. The earlier
// version of this mock resolved instantly, which quietly guaranteed the
// favourable ordering: `loadData()`'s own `refresh()` landed while the focus
// effect's fetch was still in flight and joined it. In production the focus
// effect's fetch had usually already FINISHED and cleared `inFlight` by then,
// so `loadData()` issued a genuinely second `nutrition_logs` read -- the exact
// regression this file exists to pin. The delay below reproduces that.
jest.mock('@/lib/dailyTrainingContext', () => ({
  getDailyTrainingContext: jest.fn(
    () => new Promise((resolve) => setTimeout(() => {
      mockOrderPush('ctx-resolved');
      resolve({
        inferred_load: 'easy', planned_sessions: [], phase: null, phase_guidance: '', source_label: null, stacked: false,
      });
    }, MOCK_CTX_DELAY_MS)),
  ),
}));

function mockOrderPush(entry: string) { mockOrder.push(entry); }

// recentFoods' store no longer has any call site (the final review pass
// removed its two triggers -- nothing in the app reads it yet), so it is
// stubbed only so an accidental re-introduction can't quietly add a second,
// unrelated `nutrition_logs` SELECT to the counts below.
jest.mock('@/store/recentFoods', () => ({ useRecentFoods: { getState: () => ({ refresh: jest.fn() }) } }));

import NutritionScreen from '@/app/(app)/(tabs)/nutrition';
import { useNutritionDay } from '@/store/nutritionDay';

const today = new Date().toISOString().split('T')[0];

beforeEach(() => {
  mockFromCalls.length = 0;
  mockOrder.length     = 0;
  // Pre-seed today's entry with a STABLE array reference (rather than leaving
  // `days` empty) purely so the screen's `s.days[today]?.entries ?? []`
  // selector doesn't manufacture a brand-new `[]` on every render before the
  // first refresh resolves -- unrelated to what this test is proving, which
  // is the read count, not the render-count of an unmemoized selector.
  useNutritionDay.setState({
    days: {
      [today]: {
        logId: null, trainingLoad: null, inferredLoad: null, targetsJson: null,
        entries: [], fetchedAt: new Date(0).toISOString(),
      },
    },
    inFlight: {},
  } as any);
});

describe('Nutrition screen -- single nutrition_logs read per load', () => {
  it('issues exactly one nutrition_logs SELECT (and leaves the upsert alone) even with the focus effect racing the same day', async () => {
    render(<NutritionScreen />);

    await waitFor(() => {
      const upserts = mockFromCalls.filter((c) => c.table === 'nutrition_logs' && c.op === 'upsert');
      expect(upserts.length).toBe(1);
    });

    const reads = mockFromCalls.filter((c) => c.table === 'nutrition_logs' && c.op === 'select');
    expect(reads.length).toBe(1);

    const writes = mockFromCalls.filter((c) => c.table === 'nutrition_logs' && c.op === 'upsert');
    expect(writes.length).toBe(1);

    // Proof the UNFAVOURABLE ordering was actually exercised: the store's read
    // was started (and, being faster, finished) before the training context
    // resolved. That is the arrangement under which the old code fired its
    // second read, so a test passing here is a test that would have caught it.
    expect(mockOrder.indexOf('nutrition_logs:select')).toBeGreaterThanOrEqual(0);
    expect(mockOrder.indexOf('ctx-resolved')).toBeGreaterThan(
      mockOrder.indexOf('nutrition_logs:select'),
    );
  });
});
