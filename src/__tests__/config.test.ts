/**
 * Which Firebase project the app talks to. The promise that matters: with the
 * emulator host filled in, nothing of the live project is used, so testing on
 * this PC can never write to real accounts.
 */

const LIVE = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'live-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'live-project.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'live-project',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'live-project.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
};

const KEYS = [...Object.keys(LIVE), 'EXPO_PUBLIC_FIREBASE_EMULATOR_HOST'];

function loadConfig(env: Record<string, string>) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    let config: typeof import('../config').cloudConfig | undefined;
    jest.isolateModules(() => {
      config = require('../config').cloudConfig;
    });
    return config!;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('cloudConfig', () => {
  it('uses the emulators’ demo project, and nothing of the live one, when an emulator host is set', () => {
    const config = loadConfig({ ...LIVE, EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '192.168.1.20' });
    expect(config.emulatorHost).toBe('192.168.1.20');
    expect(config.firebase.projectId).toBe('demo-strength-coach');
    expect(JSON.stringify(config.firebase)).not.toMatch(/live|123/);
  });

  it('uses the live project when the emulator host is empty', () => {
    const config = loadConfig({ ...LIVE, EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '' });
    expect(config.emulatorHost).toBe('');
    expect(config.firebase).toEqual({
      apiKey: 'live-key',
      authDomain: 'live-project.firebaseapp.com',
      projectId: 'live-project',
      storageBucket: 'live-project.firebasestorage.app',
      messagingSenderId: '123',
      appId: '1:123:web:abc',
    });
  });
});
