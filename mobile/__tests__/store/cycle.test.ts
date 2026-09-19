import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { useCycleStore } from '@/store/cycle';

const d = (iso: string) => new Date(iso);

describe('useCycleStore', () => {
  beforeEach(() => {
    useCycleStore.setState({
      periodStart:       null,
      cycleLength:       28,
      cycleInfo:         null,
      cycleMode:         'flow',
      contraceptionType: null,
      hasPlaceboWeek:    null,
      currentPackStart:  null,
    });
  });

  // ── Initial state ─────────────────────────────────────────────────
  it('starts with no period date, 28-day default, and no cycleInfo', () => {
    const { result } = renderHook(() => useCycleStore());
    expect(result.current.periodStart).toBeNull();
    expect(result.current.cycleLength).toBe(28);
    expect(result.current.cycleInfo).toBeNull();
  });

  // ── setPeriodStart ────────────────────────────────────────────────
  it('setting periodStart computes cycleInfo immediately', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-01'));
    });
    expect(result.current.cycleInfo?.phase).toBe('menstrual');
    expect(result.current.cycleInfo?.dayOfCycle).toBe(1);
    expect(result.current.periodStart).toEqual(d('2025-01-01'));
  });

  it('cycleInfo is null when periodStart has never been set', () => {
    const { result } = renderHook(() => useCycleStore());
    expect(result.current.cycleInfo).toBeNull();
  });

  // ── setCycleLength ────────────────────────────────────────────────
  it('changing cycleLength recomputes phase', () => {
    const { result } = renderHook(() => useCycleStore());

    act(() => {
      // day 17 of a 28-day cycle → luteal
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-17'));
    });
    expect(result.current.cycleInfo?.phase).toBe('luteal');

    act(() => {
      // same day 17, but 35-day cycle: ovulation day = 21, day 17 → follicular
      result.current.setCycleLength(35, d('2025-01-17'));
    });
    expect(result.current.cycleInfo?.phase).toBe('follicular');
  });

  // ── refreshPhase ──────────────────────────────────────────────────
  it('refreshPhase updates cycleInfo for a new today', () => {
    const { result } = renderHook(() => useCycleStore());

    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-01'));
    });
    expect(result.current.cycleInfo?.phase).toBe('menstrual');

    act(() => {
      result.current.refreshPhase(d('2025-01-20')); // day 20 → luteal
    });
    expect(result.current.cycleInfo?.phase).toBe('luteal');
  });

  it('refreshPhase does nothing when periodStart is not set', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.refreshPhase(d('2025-01-20'));
    });
    expect(result.current.cycleInfo).toBeNull();
  });

  // ── Phase accuracy spot-checks ────────────────────────────────────
  it('returns follicular on day 8 of 28-day cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-08'));
    });
    expect(result.current.cycleInfo?.phase).toBe('follicular');
  });

  it('returns ovulatory on day 14 of 28-day cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-14'));
    });
    expect(result.current.cycleInfo?.phase).toBe('ovulatory');
  });

  // ── CycleInfo fields ──────────────────────────────────────────────
  it('daysUntilNextPeriod is correct on day 20 of 28-day cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-20'));
    });
    expect(result.current.cycleInfo?.daysUntilNextPeriod).toBe(9);
  });

  it('wraps correctly into the next cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      // day 29 of 28-day cycle = day 1 of next cycle → menstrual
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-29'));
    });
    expect(result.current.cycleInfo?.phase).toBe('menstrual');
    expect(result.current.cycleInfo?.dayOfCycle).toBe(1);
  });
});

import type { CycleInfo } from '@/store/cycle';

const mockCycleInfo: CycleInfo = {
  phase: 'follicular',
  dayOfCycle: 7,
  daysUntilNextPeriod: 21,
  cycleLength: 28,
};

describe('useCycleStore — setCycleProfile', () => {
  it('clears cycleInfo when switching to hormonal', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('hormonal');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
    expect(useCycleStore.getState().cycleProfile).toBe('hormonal');
  });

  // Card 238. Perimenopause is a cycling profile now, so switching to it must
  // KEEP the cycle info rather than wiping it the way menopause does.
  it('keeps cycleInfo when switching to perimenopause', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('perimenopause');
    expect(useCycleStore.getState().cycleMode).toBe('flow');
    expect(useCycleStore.getState().cycleInfo).not.toBeNull();
  });

  it('clears cycleInfo when switching to menopause', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('menopause');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
  });

  it('recomputes cycleInfo from periodStart when switching to natural', () => {
    // Set periodStart so computeForProfile can recompute phase for a flow-mode profile.
    // Day 7 of a 28-day cycle starting 2025-01-01 → follicular.
    const periodStart = new Date('2025-01-01');
    const today       = new Date('2025-01-07'); // day 7
    useCycleStore.setState({ cycleProfile: 'irregular', periodStart, cycleLength: 28, cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('natural');
    useCycleStore.getState().refreshPhase(today);
    // cycleInfo must not have been cleared — phase and dayOfCycle must match
    expect(useCycleStore.getState().cycleInfo?.phase).toBe('follicular');
    expect(useCycleStore.getState().cycleInfo?.dayOfCycle).toBe(7);
  });

  it('recomputes cycleInfo from periodStart when switching to irregular', () => {
    const periodStart = new Date('2025-01-01');
    const today       = new Date('2025-01-07'); // day 7
    useCycleStore.setState({ cycleProfile: 'natural', periodStart, cycleLength: 28, cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('irregular');
    useCycleStore.getState().refreshPhase(today);
    // cycleInfo must not have been cleared — phase and dayOfCycle must match
    expect(useCycleStore.getState().cycleInfo?.phase).toBe('follicular');
    expect(useCycleStore.getState().cycleInfo?.dayOfCycle).toBe(7);
  });
});

describe('useCycleStore — pack mode', () => {
  beforeEach(() => {
    useCycleStore.setState({
      cycleProfile:      'natural',
      periodStart:       null,
      cycleLength:       28,
      cycleInfo:         null,
      cycleMode:         'flow',
      contraceptionType: null,
      hasPlaceboWeek:    null,
      currentPackStart:  null,
    });
  });

  it('pack mode computes cycleInfo from currentPackStart, not periodStart', () => {
    const packStart = new Date('2026-06-01');
    // day 20 of 28-day cycle: luteal (ovulatory window is days 13–15; day 16+ = luteal)
    const today = new Date('2026-06-20');
    useCycleStore.setState({
      cycleProfile:     'hormonal',
      hasPlaceboWeek:   true,
      cycleMode:        'pack',
      currentPackStart: packStart,
      periodStart:      new Date('2025-01-01'), // stale — must NOT be used
      cycleLength:      28,
    });
    useCycleStore.getState().refreshPhase(today);
    const { cycleInfo, cycleMode } = useCycleStore.getState();
    expect(cycleMode).toBe('pack');
    expect(cycleInfo).not.toBeNull();
    expect(cycleInfo!.phase).toBe('luteal'); // day 20 of 28-day cycle
    expect(cycleInfo!.dayOfCycle).toBe(20);
  });

  it('pack mode with null currentPackStart returns null cycleInfo', () => {
    useCycleStore.setState({
      cycleProfile:     'hormonal',
      hasPlaceboWeek:   true,
      cycleMode:        'pack',
      currentPackStart: null,
      cycleLength:      28,
    });
    useCycleStore.getState().refreshPhase();
    expect(useCycleStore.getState().cycleInfo).toBeNull();
  });

  it('setHormonalSubData sets pack mode and computes cycleInfo from packStart', () => {
    const packStart = new Date('2026-06-01');
    const today     = new Date('2026-06-08'); // day 8 = follicular
    useCycleStore.setState({ cycleProfile: 'hormonal', cycleLength: 28 });
    useCycleStore.getState().setHormonalSubData({
      contraceptionType: 'combined_pill',
      hasPlaceboWeek:    true,
      currentPackStart:  packStart,
    });
    useCycleStore.getState().refreshPhase(today);
    const { cycleMode, cycleInfo } = useCycleStore.getState();
    expect(cycleMode).toBe('pack');
    expect(cycleInfo?.phase).toBe('follicular');
  });
});

// ── Persistence ─────────────────────────────────────────────────────────
function mockSupabaseFrom(overrides: {
  cycleLogsRow?: { period_start: string; cycle_length_days: number } | null;
  profileRow?: {
    cycle_profile: string; contraception_type: string | null;
    has_placebo_week: boolean | null; current_pack_start: string | null;
  } | null;
  recentRows?: { period_start: string; period_length_days: number | null }[];
}) {
  const { supabase } = require('@/lib/supabase');
  supabase.from = (table: string) => {
    if (table === 'user_profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: overrides.profileRow ?? null }) }) }) };
    }
    // 'cycle_logs' is queried twice: once `.limit(1).maybeSingle()` for the
    // current cycle, once `.limit(12)` (no maybeSingle) for recent lengths.
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({
              limit: (n: number) => (n === 1
                ? { maybeSingle: () => Promise.resolve({ data: overrides.cycleLogsRow ?? null }) }
                : Promise.resolve({ data: overrides.recentRows ?? [], error: null })),
            }),
          }),
        }),
      }),
    };
  };
}

describe('cycle store persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useCycleStore.setState({
      cycleProfile: 'natural', periodStart: null, cycleLength: 28, periodDays: 5,
      periodDaysLogged: false, recentPeriodDays: [], cycleInfo: null, cycleMode: 'flow',
      contraceptionType: null, hasPlaceboWeek: null, currentPackStart: null, fetchedAt: null,
    });
  });

  it('persists periodStart as a serialisable value and rehydrates it back to a real Date instance', async () => {
    const date = new Date('2026-09-01T00:00:00.000Z');
    useCycleStore.setState({ periodStart: date });
    await new Promise((r) => setTimeout(r, 0)); // let persist's async AsyncStorage write land
    const raw = await AsyncStorage.getItem('virra:cycle:v1');
    expect(raw).not.toBeNull();
    // Whatever the serialised shape is (ISO string via partialize+merge, or a
    // reviver/replacer pair), it must not be a bare Date -- JSON has no Date
    // type, so the round trip through JSON.parse would silently turn it into
    // a string if this weren't handled.
    expect(typeof JSON.parse(raw!).state.periodStart).toBe('string');

    // Simulate a genuinely fresh cold start: plant a DIFFERENT date directly
    // in storage -- bypassing the store, which cannot be "corrupted" first
    // without persist's own write-through immediately re-syncing storage to
    // match memory -- then force the store to read from it.
    const otherDate = new Date('2025-01-15T00:00:00.000Z');
    await AsyncStorage.setItem('virra:cycle:v1', JSON.stringify({
      state: { ...JSON.parse(raw!).state, periodStart: otherDate.toISOString() },
      version: 1,
    }));

    await useCycleStore.persist.rehydrate();

    const rehydrated = useCycleStore.getState().periodStart;
    expect(rehydrated).toBeInstanceOf(Date);
    expect(rehydrated?.toISOString()).toBe(otherDate.toISOString());
  });

  it('persists currentPackStart as a serialisable value and rehydrates it back to a real Date instance', async () => {
    const date = new Date('2026-06-01T00:00:00.000Z');
    useCycleStore.setState({ currentPackStart: date });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:cycle:v1');
    expect(typeof JSON.parse(raw!).state.currentPackStart).toBe('string');

    const otherDate = new Date('2025-03-10T00:00:00.000Z');
    await AsyncStorage.setItem('virra:cycle:v1', JSON.stringify({
      state: { ...JSON.parse(raw!).state, currentPackStart: otherDate.toISOString() },
      version: 1,
    }));

    await useCycleStore.persist.rehydrate();

    const rehydrated = useCycleStore.getState().currentPackStart;
    expect(rehydrated).toBeInstanceOf(Date);
    expect(rehydrated?.toISOString()).toBe(otherDate.toISOString());
  });

  it('never persists cycleInfo -- it must be recomputed from raw fields, not cached stale', async () => {
    useCycleStore.setState({ periodStart: new Date('2026-09-01'), cycleInfo: { phase: 'menstrual' } as any });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:cycle:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.cycleInfo).toBeUndefined();
  });

  it('recomputes cycleInfo using the current date on rehydration, not a stale in-memory one', async () => {
    useCycleStore.setState({
      cycleProfile: 'natural', hasPlaceboWeek: null, currentPackStart: null, cycleMode: 'flow',
      periodStart: new Date('2026-09-01T00:00:00.000Z'), cycleLength: 28, periodDays: 5,
      cycleInfo: null, // as if this session hasn't computed a phase yet
    });
    await new Promise((r) => setTimeout(r, 0));

    jest.useFakeTimers();
    try {
      // Day 20 of a 28-day cycle starting 2026-09-01 -> luteal (matches the
      // plain-state spot-check above for day 20 of a 28-day cycle).
      jest.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
      await useCycleStore.persist.rehydrate();
    } finally {
      jest.useRealTimers();
    }

    const info = useCycleStore.getState().cycleInfo;
    expect(info?.dayOfCycle).toBe(20);
    expect(info?.phase).toBe('luteal');
  });

  it('stamps fetchedAt on a successful loadFromSupabase()', async () => {
    mockSupabaseFrom({
      cycleLogsRow: { period_start: '2026-09-01', cycle_length_days: 28 },
      profileRow: { cycle_profile: 'natural', contraception_type: null, has_placebo_week: null, current_pack_start: null },
      recentRows: [],
    });
    await useCycleStore.getState().loadFromSupabase('user-1', new Date('2026-09-20'));
    expect(useCycleStore.getState().fetchedAt).not.toBeNull();
    expect(useCycleStore.getState().isLoading).toBe(false);
  });

  it('a failed loadFromSupabase() leaves fetchedAt and existing raw fields untouched', async () => {
    useCycleStore.setState({
      periodStart: new Date('2026-09-01'), cycleLength: 28, fetchedAt: '2026-09-01T00:00:00.000Z',
    });
    const { supabase } = require('@/lib/supabase');
    supabase.from = () => { throw new Error('offline'); };

    await useCycleStore.getState().loadFromSupabase('user-1').catch(() => {});

    expect(useCycleStore.getState().periodStart).toEqual(new Date('2026-09-01'));
    expect(useCycleStore.getState().cycleLength).toBe(28);
    expect(useCycleStore.getState().fetchedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(useCycleStore.getState().isLoading).toBe(false);
  });
});
