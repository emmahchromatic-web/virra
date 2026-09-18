// Card 298 measurement. The tracker must never throw, never block, and never
// record a tester who is only previewing a tier.
const mockInsert = jest.fn(() => ({ then: (cb: any) => cb({ error: null }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ insert: mockInsert })) } }));
jest.mock('@/lib/notifications', () => ({ cancelAllNotifications: jest.fn() }));
jest.mock('@/lib/revenuecat', () => ({ logOutRevenueCat: jest.fn() }));

import { trackPro } from '@/lib/proEvents';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';

const session = { user: { id: 'user-1' } } as any;

describe('trackPro', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    useAuthStore.setState({ session, user: session.user });
    useSubscriptionStore.setState({ status: 'free', isActive: false, devOverride: null });
  });

  it('records the event with who, what sent her, and her tier at the time', () => {
    trackPro('paywall_open', { feature: 'recipes', source: 'app' });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-1', event: 'paywall_open', feature: 'recipes', source: 'app',
      status: 'free', product_id: null,
    });
  });

  it('records nothing when nobody is signed in', () => {
    useAuthStore.setState({ session: null, user: null });
    trackPro('paywall_open');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('records nothing while the internal Preview-as pin is set', () => {
    useSubscriptionStore.setState({ devOverride: 'expired', status: 'expired' });
    trackPro('paywall_open', { feature: 'plans' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('never throws, even when the insert blows up', () => {
    mockInsert.mockImplementationOnce(() => { throw new Error('offline'); });
    expect(() => trackPro('purchase_start', { productId: 'pro.month' })).not.toThrow();
  });
});
