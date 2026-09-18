// Card 298 measurement. One append-only table (pro_events) answers the
// questions RevenueCat cannot: which locked tile sent her to the paywall, how
// many open it and leave, and how many switch Pro features off.
//
// Fire-and-forget by design. A lost event costs a rounding error in a funnel;
// an awaited insert on the purchase path would cost a sale. Nothing here ever
// throws, blocks, or shows an error.
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';

export type ProEvent =
  | 'paywall_open' | 'paywall_close' | 'continue_free'
  | 'purchase_start' | 'purchase_success' | 'purchase_cancel' | 'purchase_fail'
  | 'restore_success' | 'restore_none'
  | 'show_pro_features_on' | 'show_pro_features_off';

export interface ProEventProps {
  feature?:   string | null;
  source?:    'onboarding' | 'app';
  productId?: string | null;
}

export function trackPro(event: ProEvent, props: ProEventProps = {}): void {
  try {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    // The internal "Preview as" pin is a tester looking around, not a customer.
    const sub = useSubscriptionStore.getState();
    if (sub.devOverride) return;

    void supabase
      .from('pro_events')
      .insert({
        user_id:    userId,
        event,
        feature:    props.feature ?? null,
        source:     props.source ?? null,
        status:     sub.status,
        product_id: props.productId ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn('[proEvents] not recorded:', error.message);
      });
  } catch {
    // Measurement never gets in the way of the thing being measured.
  }
}
