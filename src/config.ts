/**
 * Build-time switches, read from EXPO_PUBLIC_* variables in `.env`. Expo
 * inlines them into the bundle, which is why each one is spelled out in full
 * rather than looked up by name.
 *
 * None of these are secrets. A Firebase web config identifies the project; the
 * security rules are what protect the data.
 */
export const cloudConfig = {
  /** Accounts and cloud sync. Off until the account screens are built and approved. */
  enabled: process.env.EXPO_PUBLIC_CLOUD === '1',
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  /**
   * The computer running the Firebase emulators, as the phone sees it on the
   * network (e.g. 192.168.1.20). Empty means the real cloud.
   */
  emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '',
};
