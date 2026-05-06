import { act, renderHook } from '@testing-library/react-native';
import { useCycleStore } from '@/store/cycle';

const d = (iso: string) => new Date(iso);

describe('useCycleStore', () => {
  beforeEach(() => {
    useCycleStore.setState({
      periodStart:  null,
      cycleLength:  28,
      currentPhase: null,
    });
  });

  // ── Initial state ─────────────────────────────────────────────────
  it('starts with no period date, 28-day default, and no phase', () => {
    const { result } = renderHook(() => useCycleStore());
    expect(result.current.periodStart).toBeNull();
    expect(result.current.cycleLength).toBe(28);
    expect(result.current.currentPhase).toBeNull();
  });

  // ── setPeriodStart ────────────────────────────────────────────────
  it('setting periodStart computes currentPhase immediately', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      // today = day 1 → menstrual
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-01'));
    });
    expect(result.current.currentPhase).toBe('menstrual');
    expect(result.current.periodStart).toEqual(d('2025-01-01'));
  });

  it('currentPhase is null when periodStart has never been set', () => {
    const { result } = renderHook(() => useCycleStore());
    expect(result.current.currentPhase).toBeNull();
  });

  // ── setCycleLength ────────────────────────────────────────────────
  it('changing cycleLength recomputes phase', () => {
    const { result } = renderHook(() => useCycleStore());

    act(() => {
      // day 17 of a 28-day cycle → luteal
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-17'));
    });
    expect(result.current.currentPhase).toBe('luteal');

    act(() => {
      // same day 17, but 35-day cycle: ovulation day = 21, day 17 → follicular
      result.current.setCycleLength(35, d('2025-01-17'));
    });
    expect(result.current.currentPhase).toBe('follicular');
  });

  // ── refreshPhase ──────────────────────────────────────────────────
  it('refreshPhase updates currentPhase for a new today', () => {
    const { result } = renderHook(() => useCycleStore());

    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-01'));
    });
    expect(result.current.currentPhase).toBe('menstrual');

    act(() => {
      result.current.refreshPhase(d('2025-01-20')); // day 20 → luteal
    });
    expect(result.current.currentPhase).toBe('luteal');
  });

  it('refreshPhase does nothing when periodStart is not set', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.refreshPhase(d('2025-01-20'));
    });
    expect(result.current.currentPhase).toBeNull();
  });

  // ── Phase accuracy spot-checks ────────────────────────────────────
  it('returns follicular on day 8 of 28-day cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-08'));
    });
    expect(result.current.currentPhase).toBe('follicular');
  });

  it('returns ovulatory on day 14 of 28-day cycle', () => {
    const { result } = renderHook(() => useCycleStore());
    act(() => {
      result.current.setPeriodStart(d('2025-01-01'), d('2025-01-14'));
    });
    expect(result.current.currentPhase).toBe('ovulatory');
  });
});
