/**
 * A store build reads its switches from eas.json, not from .env, which is
 * git-ignored and never uploaded. Without these a release build shipped with
 * accounts off (F4). None of the values are secrets: see src/config.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eas = require('../../eas.json');

const WEB_CONFIG = [
  'API_KEY',
  'AUTH_DOMAIN',
  'PROJECT_ID',
  'STORAGE_BUCKET',
  'MESSAGING_SENDER_ID',
  'APP_ID',
];

describe.each(['production', 'preview'])('the %s build', (profile) => {
  const env: Record<string, string> = eas.build[profile].env ?? {};

  it('turns accounts on', () => {
    expect(env.EXPO_PUBLIC_CLOUD).toBe('1');
  });

  it('talks to the live project, never the emulators', () => {
    expect(env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '').toBe('');
    expect(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID).toBe('strength-coach-a0023');
  });

  it('carries the whole web config', () => {
    for (const key of WEB_CONFIG) expect(env[`EXPO_PUBLIC_FIREBASE_${key}`]).toBeTruthy();
  });
});
