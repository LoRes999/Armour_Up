import { PlanId, Subscription } from './models';

/**
 * Everything the app knows about buying a subscription, behind one interface.
 *
 * The shape deliberately mirrors RevenueCat's own — getOfferings /
 * purchasePackage / restorePurchases / getCustomerInfo — so replacing the mock
 * below with `react-native-purchases` is a change to this file and nothing
 * else. No screen imports the SDK, and no screen knows a mock exists.
 *
 * The mock is here because real StoreKit needs a native build, an Apple
 * Developer account and products configured in App Store Connect. None of that
 * runs in Expo Go or in a browser, which is where this app is reviewed.
 */

export interface Plan {
  id: PlanId;
  title: string;
  /** '$29' — already localised by the store in a real implementation. */
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
   * Adopt a subscription restored from disk, so cached() and the store agree
   * about whether this person has paid. A real implementation can ignore it —
   * it asks the store rather than trusting anything we saved locally.
   */
  hydrate?(subscription: Subscription | null): void;
  /**
   * Mock only. A real implementation omits it, and the Settings screen renders
   * its row only when this is present.
   */
  debugExpire?(): void;
}

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
    return { status: 'active', plan, renewsAt: renewsAt.toISOString() };
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
      //
      // This used to grant a subscription unconditionally, because nothing was
      // persisted and an unconditional restore was the only way back into the
      // trainer app after a reload. The store is saved to disk now, so that
      // reason is gone — and shipping the old behaviour would have given the
      // paid app away to anyone who tapped Restore.
      //
      // Still a mock: purchase() below grants without charging anyone. A real
      // implementation asks StoreKit what this Apple ID owns.
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

export const purchases: PurchaseService = createMockPurchaseService();
