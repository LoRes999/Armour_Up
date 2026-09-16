import { useEffect, useRef } from 'react';
import { useAuth } from '../auth';
import type { Subscription } from '../models';
import { purchases } from '../purchases';
import { useStore } from '../store';

/**
 * Keeps the subscription in step with the App Store and with the account.
 *
 * Purchases belong to the signed-in coach, not the phone: RevenueCat is logged
 * in with the account's id, so a coach's subscription follows them to a new
 * phone and another coach on the same phone does not inherit it (F8).
 * Renewals, cancellations and redeemed codes arrive through the listener.
 *
 * Renders nothing, and does nothing with the pretend purchase service, which
 * has no logIn.
 */
export function PurchasesBridge() {
  const auth = useAuth();
  const store = useStore();
  // The store rebuilds its functions as its data changes; the effects below
  // must not re-run, and log in again, every time a set is logged.
  const apply = useRef(store.applySubscription);
  apply.current = store.applySubscription;

  useEffect(() => purchases.onChange?.((subscription) => apply.current(subscription)), []);

  const trainerUid = auth.status === 'signedIn' && auth.claims.role === 'trainer' ? auth.uid : null;

  useEffect(() => {
    if (!purchases.logIn) return undefined;
    let cancelled = false;
    let work: Promise<Subscription | null> | undefined;
    if (trainerUid) work = purchases.logIn(trainerUid);
    else if (auth.status === 'off') work = purchases.refresh?.();
    else if (auth.status === 'signedOut') work = purchases.logOut?.().then(() => null);
    // A client, or an account still loading: nothing to buy, nothing to change.
    work
      ?.then((subscription) => {
        if (!cancelled) apply.current(subscription);
      })
      .catch(() => {
        // Offline, or no key in this build. The saved subscription stands, and
        // the paywall says when plans cannot load.
      });
    return () => {
      cancelled = true;
    };
  }, [trainerUid, auth.status]);

  return null;
}
