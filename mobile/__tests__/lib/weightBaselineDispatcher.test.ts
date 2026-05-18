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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleMock      = require('@/store/cycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleBaseline  = require('@/lib/weightBaseline').computeBaseline;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const steadyBaseline = require('@/lib/weightBaselineSteady').computeSteadyBaseline;

describe('recomputeBaseline', () => {
  beforeEach(() => {
    cycleBaseline.mockClear();
    steadyBaseline.mockClear();
  });

  it('calls computeBaseline for cycleProfile=natural', async () => {
    cycleMock.__setProfile('natural');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).not.toHaveBeenCalled();
  });

  it('calls computeBaseline for cycleProfile=irregular', async () => {
    cycleMock.__setProfile('irregular');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).not.toHaveBeenCalled();
  });

  it('calls computeSteadyBaseline for cycleProfile=hormonal', async () => {
    cycleMock.__setProfile('hormonal');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
    expect(cycleBaseline).not.toHaveBeenCalled();
  });

  it('calls computeSteadyBaseline for cycleProfile=perimenopause', async () => {
    cycleMock.__setProfile('perimenopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });

  it('calls computeSteadyBaseline for cycleProfile=menopause', async () => {
    cycleMock.__setProfile('menopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });
});
