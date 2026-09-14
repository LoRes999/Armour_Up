/**
 * Where this phone buys and cancels a subscription, in words. Android and the
 * web were told to "Subscribe with Apple" (C7); Ryan chose (2026-09-13) to
 * match the phone: Apple on an iPhone, Google Play on Android, a plain button
 * on the web, which is only ever a preview.
 */
export interface StoreWording {
  /** For sentences: "billed through the App Store". */
  store: string;
  subscribeLabel: string;
  /** An Ionicons logo for the button, or none. */
  logo?: 'logo-apple' | 'logo-google-playstore';
  /** Where a subscription is cancelled: "cancel in your App Store settings". */
  cancelWhere: string;
}

export function storeWording(os: string): StoreWording {
  if (os === 'ios') {
    return {
      store: 'the App Store',
      subscribeLabel: 'Subscribe with Apple',
      logo: 'logo-apple',
      cancelWhere: 'your App Store settings',
    };
  }
  if (os === 'android') {
    return {
      store: 'Google Play',
      subscribeLabel: 'Subscribe with Google Play',
      logo: 'logo-google-playstore',
      cancelWhere: 'your Google Play settings',
    };
  }
  return {
    store: 'the App Store or Google Play',
    subscribeLabel: 'Subscribe',
    logo: undefined,
    cancelWhere: 'your App Store or Google Play settings',
  };
}
