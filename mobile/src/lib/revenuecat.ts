import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!;

export const ENTITLEMENT_ID = 'virra_pro';

export function configureRevenueCat(userId: string) {
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
}

export async function getActiveEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: !!customerInfo.entitlements.active[ENTITLEMENT_ID] };
  } catch (e: any) {
    // Backing out of the Apple sheet is a decision, not a failure. RevenueCat
    // reports it as an error like everything else, so it is separated here —
    // telling someone their purchase "failed" because they chose not to buy
    // reads as a bug and makes the paywall feel broken.
    if (e?.userCancelled) return { success: false, cancelled: true };

    console.error('[revenuecat] purchasePackage failed:', e);
    // readableErrorCode is a machine token (PURCHASE_NOT_ALLOWED_ERROR); it
    // belongs in the log, not on screen. The caller supplies human copy.
    return { success: false, error: e?.userInfo?.readableErrorCode ?? e?.message ?? String(e) };
  }
}

export interface EntitlementInfo {
  isActive:      boolean;
  isTrial:       boolean;
  trialEnd:      Date | null;
  managementURL: string | null;
}

export async function getEntitlementInfo(): Promise<EntitlementInfo> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const ent = customerInfo.entitlements.active[ENTITLEMENT_ID];
    return {
      isActive:      !!ent,
      isTrial:       (ent?.periodType as string | undefined)?.toUpperCase() === 'TRIAL',
      trialEnd:      ent?.expirationDate ? new Date(ent.expirationDate) : null,
      managementURL: customerInfo.managementURL ?? null,
    };
  } catch {
    return { isActive: false, isTrial: false, trialEnd: null, managementURL: null };
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
