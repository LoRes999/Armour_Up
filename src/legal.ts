import { Linking } from 'react-native';
import type { LegalDocId } from './legalContent';

/**
 * Where the published copies live.
 *
 * Both are empty until docs/ is served somewhere. That is deliberate: an empty
 * value routes the reader to the in-app screen, which works offline and is the
 * only version guaranteed to match the build they are holding. Fill these in
 * once the docs folder is published (GitHub Pages needs no domain), because
 * App Store Connect requires a Privacy Policy *URL* in the listing even though
 * the in-app screen is what satisfies the paywall link requirement.
 *
 *   PRIVACY_URL = 'https://<user>.github.io/<repo>/privacy'
 */
export const PRIVACY_URL = '';
export const TERMS_URL = '';

export function urlFor(doc: LegalDocId): string {
  return doc === 'privacy' ? PRIVACY_URL : TERMS_URL;
}

/**
 * Opens the hosted copy when there is one. Returns false when there is not, so
 * the caller can push the in-app screen instead — the fallback has to be the
 * caller's, because it is a navigation and this module knows nothing about
 * routing.
 */
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
