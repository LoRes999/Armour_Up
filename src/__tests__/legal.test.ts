import { PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL, openHosted, openSupport, urlFor } from '../legal';
import { Linking } from 'react-native';

/**
 * The published pages. App Store Connect needs a real privacy address, and
 * Apple's subscription rules need the terms reachable from the paywall, so an
 * empty value here is a submission blocker rather than a missing nicety.
 */

describe('the published legal pages', () => {
  it('both have an address', () => {
    expect(PRIVACY_URL).toMatch(/^https:\/\//);
    expect(TERMS_URL).toMatch(/^https:\/\//);
  });

  it('points each document at its own page', () => {
    expect(urlFor('privacy')).toBe(PRIVACY_URL);
    expect(urlFor('terms')).toBe(TERMS_URL);
    expect(PRIVACY_URL).not.toBe(TERMS_URL);
  });

  it('opens the hosted copy', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openHosted('privacy')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(PRIVACY_URL);
    openURL.mockRestore();
  });

  it('falls back to the in-app screen when the browser refuses', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
    await expect(openHosted('terms')).resolves.toBe(false);
    openURL.mockRestore();
  });
});

describe('contacting support', () => {
  it('opens the support page', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await openSupport();
    expect(openURL).toHaveBeenCalledWith(SUPPORT_URL);
    openURL.mockRestore();
  });

  it('writes an email instead when the page will not open', async () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no browser'))
      .mockResolvedValue(true);
    await openSupport();
    expect(openURL).toHaveBeenLastCalledWith(`mailto:${SUPPORT_EMAIL}`);
    openURL.mockRestore();
  });

  it('gives up quietly when neither works, rather than crashing settings', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nothing installed'));
    await expect(openSupport()).resolves.toBeUndefined();
    openURL.mockRestore();
  });
});
