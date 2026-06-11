import { act, renderHook } from '@testing-library/react-native';

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

  it('clears cycleInfo when switching to perimenopause', () => {
    useCycleStore.setState({ cycleProfile: 'natural', cycleInfo: mockCycleInfo });
    useCycleStore.getState().setCycleProfile('perimenopause');
    expect(useCycleStore.getState().cycleInfo).toBeNull();
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
