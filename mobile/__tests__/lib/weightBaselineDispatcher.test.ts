import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';

jest.mock('@/lib/weightBaseline', () => ({
  computeBaseline: jest.fn().mockResolvedValue(60.0),
}));
jest.mock('@/lib/weightBaselineSteady', () => ({
  computeSteadyBaseline: jest.fn().mockResolvedValue(60.5),
}));
jest.mock('@/store/cycle', () => {
  let profile = 'natural';
  return {
    useCycleStore: { getState: () => ({ cycleProfile: profile }) },
    __setProfile: (p: string) => { profile = p; },
  };
});
jest.mock('@/store/profile', () => {
  const setLocal = jest.fn();
  return {
    useProfileStore: { getState: () => ({ setLocal }) },
    __setLocal: setLocal,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleMock      = require('@/store/cycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const setLocal       = require('@/store/profile').__setLocal;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleBaseline  = require('@/lib/weightBaseline').computeBaseline;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const steadyBaseline = require('@/lib/weightBaselineSteady').computeSteadyBaseline;

describe('recomputeBaseline', () => {
  beforeEach(() => {
    cycleBaseline.mockClear();
    steadyBaseline.mockClear();
    setLocal.mockClear();
  });

  // The steady baseline used to be skipped entirely for cycle profiles, which
  // left weight_steady_baseline_kg null forever and pinned the weight screen on
  // CALIBRATING. It is now computed for everyone.
  it('computes both baselines for cycleProfile=natural', async () => {
    cycleMock.__setProfile('natural');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });

  it('computes both baselines for cycleProfile=irregular', async () => {
    cycleMock.__setProfile('irregular');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });

  it('computes only the steady baseline for cycleProfile=hormonal', async () => {
    cycleMock.__setProfile('hormonal');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
    expect(cycleBaseline).not.toHaveBeenCalled();
  });

  it('computes only the steady baseline for cycleProfile=perimenopause', async () => {
    cycleMock.__setProfile('perimenopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
    expect(cycleBaseline).not.toHaveBeenCalled();
  });

  it('computes only the steady baseline for cycleProfile=menopause', async () => {
    cycleMock.__setProfile('menopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
    expect(cycleBaseline).not.toHaveBeenCalled();
  });

  // Without this the badge only cleared on the next app launch, because the
  // compute functions write to Supabase and the profile store loads once.
  it('mirrors the computed steady baseline into the profile store', async () => {
    cycleMock.__setProfile('menopause');
    await recomputeBaseline('user-1');
    expect(setLocal).toHaveBeenCalledWith(
      expect.objectContaining({ weightSteadyBaselineKg: 60.5 }),
    );
  });

  it('mirrors the computed cycle baseline into the profile store', async () => {
    cycleMock.__setProfile('natural');
    await recomputeBaseline('user-1');
    expect(setLocal).toHaveBeenCalledWith(
      expect.objectContaining({ weightSteadyBaselineKg: 60.5 }),
    );
    expect(setLocal).toHaveBeenCalledWith({ weightBaselineKg: 60.0 });
  });
});
