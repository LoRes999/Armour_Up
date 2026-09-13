import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Signing out has to take this phone's push token off the account, whichever
 * Sign out button did it. Only Settings used to; the ones on the Paywall and on
 * "Finish setting up" left it, so the next account on the phone received the
 * last one's notifications — client names and sessions included. Settings'
 * own version asked Expo for the token again, which needs a connection, so it
 * left the token behind whenever the phone was offline too.
 */

jest.setTimeout(15000);

type TokenListener = (user: unknown) => void;
let listener: TokenListener | null = null;
const mockDeleteDoc = jest.fn((_ref: unknown) => Promise.resolve());
const mockFirebaseSignOut = jest.fn(() => Promise.resolve());

jest.mock('../config', () => ({
  cloudConfig: { enabled: true, firebase: {}, emulatorHost: '' },
}));
jest.mock('../firebase', () => ({
  firebase: () => ({ auth: { currentUser: null }, db: {}, functions: {} }),
}));
jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (_auth: unknown, next: TokenListener) => {
    listener = next;
    return () => {
      listener = null;
    };
  },
  createUserWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: () => mockFirebaseSignOut(),
}));
jest.mock('firebase/firestore', () => ({
  // A path string stands in for a document reference, so a test can see which one.
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  deleteDoc: (ref: unknown) => mockDeleteDoc(ref),
  onSnapshot: () => () => {},
  serverTimestamp: () => 'now',
  setDoc: () => Promise.resolve(),
  updateDoc: () => Promise.resolve(),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

// After the mocks, so these pick them up.
// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from '../auth';
// eslint-disable-next-line import/first
import { savePushToken } from '../pushTokens';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const TOKEN = 'ExponentPushToken[abc]';
const coach = {
  uid: 'u-sam',
  email: 'sam@example.com',
  getIdTokenResult: () => Promise.resolve({ claims: { role: 'trainer' } }),
};

async function signedInCoach() {
  const rendered = await renderHook(() => useAuth(), { wrapper });
  await act(() => {
    listener?.(coach);
  });
  await waitFor(() => expect(rendered.result.current.claims.role).toBe('trainer'));
  // What registering for push did straight after signing in.
  await savePushToken('u-sam', TOKEN, 'ios');
  return rendered;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  listener = null;
  mockDeleteDoc.mockClear();
  mockFirebaseSignOut.mockClear();
});

describe('signing out', () => {
  it("takes this phone's push token off the account, from any Sign out button", async () => {
    const { result } = await signedInCoach();

    // The Paywall's and "Finish setting up"'s buttons call exactly this.
    await act(async () => {
      await result.current.signOut();
    });

    expect(mockDeleteDoc).toHaveBeenCalledWith(`users/u-sam/pushTokens/${TOKEN}`);
    expect(mockFirebaseSignOut).toHaveBeenCalled();
    expect(mockDeleteDoc.mock.invocationCallOrder[0]).toBeLessThan(mockFirebaseSignOut.mock.invocationCallOrder[0]);
  });

  it('still signs out when there is no connection to remove the token with', async () => {
    const { result } = await signedInCoach();
    // Offline, the delete never gets an answer.
    mockDeleteDoc.mockImplementationOnce(() => new Promise<void>(() => {}));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockFirebaseSignOut).toHaveBeenCalled();
  });
});
