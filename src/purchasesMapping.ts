import type { PlanId, Subscription } from './models';
import type { Plan } from './purchases';

/**
 * The two pure steps between RevenueCat and the app: what the store sells into
 * the plans the paywall shows, and what a customer owns into the subscription
 * that opens the coach app. Kept apart from the SDK so they can be tested.
 */

/** The RevenueCat entitlement that opens the coach app. */
export const ENTITLEMENT = 'coach';

/** Each plan's product, as set up in App Store Connect and RevenueCat. */
export const PRODUCT_IDS: Record<PlanId, string> = {
  monthly: 'armourup_coach_monthly',
  annual: 'armourup_coach_annual',
};

/** The parts of RevenueCat's types read here. Its own types fit these. */
export interface StorePackageLike {
  product: {
    identifier: string;
    price: number;
    priceString: string;
    pricePerMonthString: string | null;
  };
}

export interface EntitlementLike {
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
  expirationDate: string | null;
}

export interface CustomerInfoLike {
  entitlements: {
    active: Record<string, EntitlementLike>;
    all: Record<string, EntitlementLike>;
  };
}

/** The plan a store product belongs to, or null for anything else. */
export function planIdFor(productIdentifier: string): PlanId | null {
  // Google Play appends ":base-plan" to the product; the App Store does not.
  const product = productIdentifier.split(':')[0];
  return (Object.keys(PRODUCT_IDS) as PlanId[]).find((id) => PRODUCT_IDS[id] === product) ?? null;
}

/** Annual first, then monthly, priced in the buyer's own currency. */
export function plansFromPackages(packages: readonly StorePackageLike[]): Plan[] {
  const products = new Map<PlanId, StorePackageLike['product']>();
  for (const { product } of packages) {
    const id = planIdFor(product.identifier);
    if (id && !products.has(id)) products.set(id, product);
  }

  const plans: Plan[] = [];
  const annual = products.get('annual');
  const monthly = products.get('monthly');

  if (annual) {
    const saving = monthly ? Math.round((1 - annual.price / (monthly.price * 12)) * 100) : 0;
    plans.push({
      id: 'annual',
      title: 'Annual',
      priceLabel: annual.priceString,
      periodLabel: 'per year',
      footnote: annual.pricePerMonthString
        ? `${annual.pricePerMonthString} a month, billed yearly.`
        : 'Billed yearly.',
      ...(saving > 0 ? { savingLabel: `SAVE ${saving}%` } : {}),
    });
  }
  if (monthly) {
    plans.push({
      id: 'monthly',
      title: 'Monthly',
      priceLabel: monthly.priceString,
      periodLabel: 'per month',
      footnote: 'Cancel any time.',
    });
  }
  return plans;
}

/**
 * The coach subscription this customer holds, or null. Access granted by hand
 * in RevenueCat (the reviewers' demo coach) has no product of ours and no end
 * date, so it reads as complimentary.
 */
export function subscriptionFrom(info: CustomerInfoLike): Subscription | null {
  const active = info.entitlements.active[ENTITLEMENT];
  const known = active ?? info.entitlements.all[ENTITLEMENT];
  if (!known) return null;
  return {
    status: active?.isActive ? 'active' : 'expired',
    plan: planIdFor(known.productIdentifier) ?? 'complimentary',
    renewsAt: known.expirationDate ?? '',
    willRenew: known.willRenew,
  };
}
