import { storeWording } from '../storeWording';

/**
 * Android and the web were told to "Subscribe with Apple", beside an Apple
 * logo, and that billing and cancelling happen in the App Store (C7). Ryan chose
 * (2026-09-13) to match the phone: Apple on an iPhone, Google Play on Android,
 * and a plain button on the web.
 */
describe('storeWording', () => {
  it('names Apple on an iPhone', () => {
    expect(storeWording('ios')).toEqual({
      store: 'the App Store',
      subscribeLabel: 'Subscribe with Apple',
      logo: 'logo-apple',
      cancelWhere: 'your App Store settings',
    });
  });

  it('names Google Play on Android', () => {
    expect(storeWording('android')).toEqual({
      store: 'Google Play',
      subscribeLabel: 'Subscribe with Google Play',
      logo: 'logo-google-playstore',
      cancelWhere: 'your Google Play settings',
    });
  });

  it('names neither on the web, and shows no logo', () => {
    expect(storeWording('web')).toEqual({
      store: 'the App Store or Google Play',
      subscribeLabel: 'Subscribe',
      logo: undefined,
      cancelWhere: 'your App Store or Google Play settings',
    });
  });
});
