import { plansFromPackages, subscriptionFrom } from '../purchasesMapping';

/**
 * The pretend purchase service granted a subscription to anyone who tapped
 * Subscribe. Real purchases come from RevenueCat; these are the two pure steps
 * between its SDK and the app: store packages to the plans the paywall shows,
 * and customer info to the subscription that opens the coach app.
 */

const pkg = (productId: string, price: number, priceString: string, pricePerMonthString: string | null = null) => ({
  identifier: `$rc_${productId}`,
  product: { identifier: productId, price, priceString, pricePerMonthString },
});

const entitlement = (over: Partial<{ isActive: boolean; willRenew: boolean; productIdentifier: string; expirationDate: string | null }>) => ({
  isActive: true,
  willRenew: true,
  productIdentifier: 'armourup_coach_monthly',
  expirationDate: '2026-10-16T00:00:00Z',
  ...over,
});

const info = (active: Record<string, ReturnType<typeof entitlement>>, all = active) => ({
  entitlements: { active, all },
});

describe('plans from the store', () => {
  it('lists the annual plan first, with its monthly price and saving, then monthly', () => {
    const plans = plansFromPackages([
      pkg('armourup_coach_monthly', 29, '$29.00'),
      pkg('armourup_coach_annual', 290, '$290.00', '$24.17'),
    ]);

    expect(plans.map((plan) => plan.id)).toEqual(['annual', 'monthly']);
    expect(plans[0]).toMatchObject({
      title: 'Annual',
      priceLabel: '$290.00',
      periodLabel: 'per year',
      footnote: '$24.17 a month, billed yearly.',
      savingLabel: 'SAVE 17%',
    });
    expect(plans[1]).toMatchObject({
      title: 'Monthly',
      priceLabel: '$29.00',
      periodLabel: 'per month',
      footnote: 'Cancel any time.',
    });
  });

  it('leaves out products the app does not sell', () => {
    const plans = plansFromPackages([pkg('something_else', 5, '$5.00'), pkg('armourup_coach_monthly', 29, '$29.00')]);
    expect(plans.map((plan) => plan.id)).toEqual(['monthly']);
  });

  it('shows no saving when the annual plan saves nothing', () => {
    const plans = plansFromPackages([
      pkg('armourup_coach_monthly', 29, '$29.00'),
      pkg('armourup_coach_annual', 348, '$348.00'),
    ]);
    expect(plans[0].savingLabel).toBeUndefined();
    expect(plans[0].footnote).toBe('Billed yearly.');
  });
});

describe('the subscription from customer info', () => {
  it('is none without the coach entitlement', () => {
    expect(subscriptionFrom(info({}))).toBeNull();
  });

  it('is active, with its plan and renewal date', () => {
    expect(
      subscriptionFrom(
        info({ coach: entitlement({ productIdentifier: 'armourup_coach_annual', expirationDate: '2027-09-16T00:00:00Z' }) })
      )
    ).toEqual({ status: 'active', plan: 'annual', renewsAt: '2027-09-16T00:00:00Z', willRenew: true });
  });

  it('knows a cancelled subscription is still running until it ends', () => {
    expect(subscriptionFrom(info({ coach: entitlement({ willRenew: false }) }))).toMatchObject({
      status: 'active',
      willRenew: false,
    });
  });

  it('is expired once it has ended', () => {
    const ended = entitlement({ isActive: false, willRenew: false });
    expect(subscriptionFrom(info({}, { coach: ended }))).toMatchObject({ status: 'expired', plan: 'monthly' });
  });

  it('treats access granted in RevenueCat as complimentary', () => {
    expect(
      subscriptionFrom(
        info({ coach: entitlement({ productIdentifier: 'rc_promo_coach_lifetime', expirationDate: null, willRenew: false }) })
      )
    ).toEqual({ status: 'active', plan: 'complimentary', renewsAt: '', willRenew: false });
  });
});
