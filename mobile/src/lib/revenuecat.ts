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

export async function purchasePackage(pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: !!customerInfo.entitlements.active[ENTITLEMENT_ID] };
  } catch (e: any) {
    const msg = e?.userInfo?.readableErrorCode ?? e?.message ?? String(e);
    console.error('[revenuecat] purchasePackage failed:', e);
    return { success: false, error: msg };
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
