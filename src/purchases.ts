import { Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { PlanId, Subscription } from './models';
import { planIdFor, plansFromPackages, subscriptionFrom } from './purchasesMapping';

/**
 * Everything the app knows about buying a subscription, behind one interface.
 *
 * Two implementations. Real purchases go through RevenueCat, which talks to
 * the App Store (and later Google Play). The pretend service stays for the
 * places a store cannot run: the web preview, Expo Go and tests. No screen
 * imports the SDK, and no screen knows which one it has.
 */

export interface Plan {
  id: PlanId;
  title: string;
  /** '$29.00', localised by the store. */
  priceLabel: string;
  periodLabel: string;
  footnote: string;
  savingLabel?: string;
}

export interface PurchaseService {
  /** Async so a real SDK's product fetch drops straight in. */
  getOfferings(): Promise<Plan[]>;
  /** Resolves with the new subscription; rejects on failure or cancellation. */
  purchase(planId: PlanId): Promise<Subscription>;
  /** Resolves with what was restored, or null when there is nothing to restore. */
  restore(): Promise<Subscription | null>;
  /** Last known value, synchronously, so the first paint never flashes a paywall. */
  cached(): Subscription | null;
  /**
   * Pretend service only. Adopt a subscription restored from disk, so cached()
   * and the store agree about whether this person has paid.
   */
  hydrate?(subscription: Subscription | null): void;
  /** Pretend service only, and only in development: ends the subscription. */
  debugExpire?(): void;
  /**
   * Real stores only. Purchases belong to the account, not the phone: logging
   * in with the account's id makes a coach's subscription follow them to a new
   * phone, and keeps another coach on this phone from inheriting it.
   */
  logIn?(uid: string): Promise<Subscription | null>;
  logOut?(): Promise<void>;
  /** Real stores only. The latest subscription, from the store's own cache when offline. */
  refresh?(): Promise<Subscription | null>;
  /** Real stores only. Every change the store reports: renewals, cancellations, redeemed codes. */
  onChange?(listener: (subscription: Subscription | null) => void): () => void;
  /** iPhone only: Apple's sheet for redeeming an offer code. */
  redeemCode?(): Promise<void>;
  /** Real stores only: the system's own screen for managing subscriptions. */
  manage?(): Promise<void>;
}

/** What the pretend service sells. Real prices come from the store. */
export const PLANS: Plan[] = [
  {
    id: 'annual',
    title: 'Annual',
    priceLabel: '$290',
    periodLabel: 'per year',
    footnote: '$24.17 a month, billed yearly.',
    savingLabel: 'SAVE 17%',
  },
  {
    id: 'monthly',
    title: 'Monthly',
    priceLabel: '$29',
    periodLabel: 'per month',
    // Where to cancel is in the small print under the button, per platform.
    footnote: 'Cancel any time.',
  },
];

function createMockPurchaseService(): PurchaseService {
  // Module-level rather than React state: this survives a Fast Refresh of any
  // other file, so editing a screen mid-session does not throw away a purchase.
  let current: Subscription | null = null;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const grant = (plan: PlanId): Subscription => {
    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + (plan === 'annual' ? 12 : 1));
    return { status: 'active', plan, renewsAt: renewsAt.toISOString(), willRenew: true };
  };

  return {
    async getOfferings() {
      await wait(120);
      return PLANS;
    },

    async purchase(planId) {
      // Long enough to see the pending state the real sheet would occupy.
      await wait(600);
      current = grant(planId);
      return current;
    },

    async restore() {
      await wait(400);
      // Returns what is actually owned, which on a fresh install is nothing.
      // Granting unconditionally would give the paid app away to anyone who
      // tapped Restore.
      return current;
    },

    cached() {
      return current;
    },

    hydrate(subscription) {
      current = subscription;
    },

    debugExpire() {
      if (current) current = { ...current, status: 'expired' };
    },
  };
}

/**
 * RevenueCat, with the public SDK key for this platform. A build without a key
 * can sell nothing: every call rejects and the paywall says the plans could not
 * load. It never falls back to the pretend service, which would give the app
 * away.
 */
function createStorePurchaseService(apiKey: string): PurchaseService {
  const configured = apiKey !== '';
  if (configured) Purchases.configure({ apiKey });

  let current: Subscription | null = null;
  let packages = new Map<PlanId, PurchasesPackage>();

  const ready = () => {
    if (!configured) throw new Error('Purchases are not set up in this build.');
  };
  const adopt = (info: CustomerInfo) => {
    current = subscriptionFrom(info);
    return current;
  };

  const service: PurchaseService = {
    async getOfferings() {
      ready();
      const available = (await Purchases.getOfferings()).current?.availablePackages ?? [];
      packages = new Map();
      for (const pkg of available) {
        const id = planIdFor(pkg.product.identifier);
        if (id) packages.set(id, pkg);
      }
      return plansFromPackages(available);
    },

    async purchase(planId) {
      ready();
      if (!packages.has(planId)) await service.getOfferings();
      const chosen = packages.get(planId);
      if (!chosen) throw new Error('That plan is not available.');
      // Rejects when the person cancels the sheet, which the store treats as
      // "stay on the paywall".
      const { customerInfo } = await Purchases.purchasePackage(chosen);
      const subscription = adopt(customerInfo);
      if (subscription?.status !== 'active') throw new Error('The purchase did not complete.');
      return subscription;
    },

    async restore() {
      ready();
      return adopt(await Purchases.restorePurchases());
    },

    cached() {
      return current;
    },

    async logIn(uid) {
      ready();
      const { customerInfo } = await Purchases.logIn(uid);
      return adopt(customerInfo);
    },

    async logOut() {
      current = null;
      if (!configured) return;
      try {
        await Purchases.logOut();
      } catch {
        // Already anonymous: nobody was logged in to log out.
      }
    },

    async refresh() {
      ready();
      return adopt(await Purchases.getCustomerInfo());
    },

    onChange(listener) {
      if (!configured) return () => undefined;
      const handle = (info: CustomerInfo) => listener(adopt(info));
      Purchases.addCustomerInfoUpdateListener(handle);
      return () => {
        Purchases.removeCustomerInfoUpdateListener(handle);
      };
    },

    redeemCode:
      Platform.OS === 'ios'
        ? async () => {
            ready();
            await Purchases.presentCodeRedemptionSheet();
          }
        : undefined,

    async manage() {
      if (configured) {
        try {
          await Purchases.showManageSubscriptions();
          return;
        } catch {
          // Fall through to the store's web page.
        }
      }
      await Linking.openURL(
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions'
      );
    },
  };

  return service;
}

/**
 * Real purchases wherever a store can take them: an EAS build on a phone. The
 * pretend service stays for the web (a preview), Expo Go (no native purchases
 * module) and tests.
 */
const usesStore =
  Platform.OS !== 'web' &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  process.env.NODE_ENV !== 'test';

// Spelled out in full: Expo inlines EXPO_PUBLIC_* only where it is written so.
const STORE_KEY = Platform.OS === 'ios' ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '') : '';

export const purchases: PurchaseService = usesStore
  ? createStorePurchaseService(STORE_KEY)
  : createMockPurchaseService();
