const mockGetOfferings = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure:   jest.fn(),
    logIn:       jest.fn(),
    getOfferings: (...args: any[]) => mockGetOfferings(...args),
  },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

import { getOfferings, configureRevenueCat } from '@/lib/revenuecat';

describe('getOfferings', () => {
  beforeEach(async () => {
    mockGetOfferings.mockReset();
    // Configure once so `ready` resolves immediately for every test below,
    // matching how the real app always configures RevenueCat before a
    // screen can call getOfferings().
    await configureRevenueCat('user-1');
  });

  it('returns the current offering\'s packages with failed:false on success', async () => {
    const pkg = { identifier: 'monthly', product: { identifier: 'virra_pro_monthly' } };
    mockGetOfferings.mockResolvedValue({ current: { availablePackages: [pkg] } });

    const result = await getOfferings();

    expect(result).toEqual({ packages: [pkg], failed: false });
  });

  it('returns an empty, non-failed result when there is genuinely no current offering', async () => {
    mockGetOfferings.mockResolvedValue({ current: null });

    const result = await getOfferings();

    expect(result).toEqual({ packages: [], failed: false });
  });

  it('reports failed:true (not a silent empty array) when the SDK call throws', async () => {
    mockGetOfferings.mockRejectedValue(new Error('Network request failed'));

    const result = await getOfferings();

    expect(result).toEqual({ packages: [], failed: true });
  });
});
