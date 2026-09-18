import { Linking } from 'react-native';
import type { LegalDocId } from './legalContent';

/**
 * Where the published copies live: the `site/` folder of the app's repository,
 * served by GitHub Pages and built by `npm run build:site`. App Store Connect
 * needs a Privacy Policy *URL* for the listing, and Apple's subscription rules
 * want the terms reachable from the paywall.
 *
 * The in-app screens stay the fallback, since they work offline and always
 * match the build in the reader's hand.
 */
const PAGES = 'https://lores999.github.io/Armour_Up/site/';
export const PRIVACY_URL = `${PAGES}privacy.html`;
export const TERMS_URL = `${PAGES}terms.html`;
export const SUPPORT_URL = `${PAGES}support.html`;
export const SUPPORT_EMAIL = 'henryarmour1@gmail.com';

export function urlFor(doc: LegalDocId): string {
  return doc === 'privacy' ? PRIVACY_URL : TERMS_URL;
}

/**
 * Opens the hosted copy when there is one. Returns false when there is not, so
 * the caller can push the in-app screen instead — the fallback has to be the
 * caller's, because it is a navigation and this module knows nothing about
 * routing.
 */
/**
 * The support page, or the address it holds when no browser will open. Someone
 * reaching for support is already having trouble, so a dead button is the one
 * outcome worth ruling out; failing quietly beats throwing into Settings.
 */
export async function openSupport(): Promise<void> {
  try {
    await Linking.openURL(SUPPORT_URL);
  } catch {
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    } catch {
      // No browser and no mail app. Nothing left to try.
    }
  }
}

export async function openHosted(doc: LegalDocId): Promise<boolean> {
  const url = urlFor(doc);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // No browser, or the URL is malformed. Fall back rather than fail.
    return false;
  }
}
