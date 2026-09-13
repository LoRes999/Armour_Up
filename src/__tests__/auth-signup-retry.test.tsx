import React from 'react';
import { renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A sign-up that stopped halfway: the account was created, then the coaching
 * profile — or, for a client, linking the invitation — failed, usually because
 * the connection dropped between the two. Pressing the button again tried to
 * create the account a second time and got "There is already an account with
 * that email", while the person was in fact signed in as it; only closing the
 * screen got them out. Trying again now picks up where it stopped.
 */

type MockUser = { uid: string; email: string; getIdToken: (force?: boolean) => Promise<string> };
const mockAuth: { currentUser: MockUser | null } = { currentUser: null };
const mockCreateUser = jest.fn(async (_auth: unknown, email: string, _password: string) => {
  if (mockAuth.currentUser?.email === email) {
    throw Object.assign(new Error('Firebase: Error (auth/email-already-in-use).'), {
      code: 'auth/email-already-in-use',
    });
  }
  mockAuth.currentUser = { uid: 'u-new', email, getIdToken: async () => 'token' };
  return { user: mockAuth.currentUser };
});
/** Every callable function called, in order. */
const mockCalls: string[] = [];
/** Callable functions that fail the next time they are called, as a dropped connection would. */
const mockFailOnce = new Set<string>();

jest.mock('../config', () => ({
  cloudConfig: { enabled: true, firebase: {}, emulatorHost: '' },
}));
jest.mock('../firebase', () => ({
  firebase: () => ({ auth: mockAuth, db: {}, functions: {} }),
}));
jest.mock('firebase/auth', () => ({
  onIdTokenChanged: () => () => {},
  createUserWithEmailAndPassword: (auth: unknown, email: string, password: string) =>
    mockCreateUser(auth, email, password),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: () => () => {},
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => 'now',
  setDoc: () => Promise.resolve(),
  updateDoc: () => Promise.resolve(),
}));
jest.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => async () => {
    mockCalls.push(name);
    if (mockFailOnce.delete(name)) {
      throw Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
    }
    return { data: {} };
  },
}));

// After the mocks, so the provider picks them up.
// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from '../auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockAuth.currentUser = null;
  mockCreateUser.mockClear();
  mockCalls.length = 0;
  mockFailOnce.clear();
});

describe('trying a sign-up again after it stopped halfway', () => {
  it('finishes the coaching account instead of creating it twice', async () => {
    mockFailOnce.add('createTrainerProfile');
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await expect(result.current.signUpAsTrainer('Sam Coach', 'sam@example.com', 'secret-password')).rejects.toThrow();
    await expect(
      result.current.signUpAsTrainer('Sam Coach', 'sam@example.com', 'secret-password')
    ).resolves.toBeUndefined();

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(['createTrainerProfile', 'createTrainerProfile']);
  });

  it("links a client's invitation instead of creating the account twice", async () => {
    mockFailOnce.add('redeemInvite');
    const { result } = await renderHook(() => useAuth(), { wrapper });
    const join = { code: 'JDC897', email: 'jordan@example.com', password: 'secret-password' };

    await expect(result.current.joinWithCode(join)).rejects.toThrow();
    await expect(result.current.joinWithCode(join)).resolves.toBeUndefined();

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(['redeemInvite', 'redeemInvite']);
  });
});
