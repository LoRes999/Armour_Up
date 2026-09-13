/**
 * Build-time switches, read from EXPO_PUBLIC_* variables in `.env`. Expo
 * inlines them into the bundle, which is why each one is spelled out in full
 * rather than looked up by name.
 *
 * None of these are secrets. A Firebase web config identifies the project; the
 * security rules are what protect the data.
 */

/**
 * The computer running the Firebase emulators, as the phone sees it on the
 * network (e.g. 192.168.1.20). Empty means the real cloud.
 */
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '';

/**
 * The project the emulators run as (see the scripts in package.json). The
 * "demo-" prefix makes Firebase refuse to reach any real service, so testing
 * against the emulators can never touch the live project, whatever else `.env`
 * holds.
 */
const EMULATOR_PROJECT = 'demo-strength-coach';

const liveFirebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const emulatorFirebase = {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT,
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const cloudConfig = {
  /** Accounts and cloud sync. Off unless `.env` turns them on. */
  enabled: process.env.EXPO_PUBLIC_CLOUD === '1',
  firebase: emulatorHost ? emulatorFirebase : liveFirebase,
  emulatorHost,
};
