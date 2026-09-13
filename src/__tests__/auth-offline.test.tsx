import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Opening the app with no signal, more than an hour after it was last used.
 * The sign-in is restored from the phone, but its one-hour token has expired,
 * and reading the role out of it needs the network to refresh it first. That
 * failure used to leave a coach signed in with no role at all — so the gym with
 * no signal, exactly where the app is meant to work offline, showed "Finish
 * setting up" instead of their roster.
 */

type TokenListener = (user: unknown) => void;
let listener: TokenListener | null = null;

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
  signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: () => () => {},
  serverTimestamp: jest.fn(),
  updateDoc: jest.fn(),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

// After the mocks, so the provider picks them up.
// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from '../auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const online = (uid: string, claims: Record<string, unknown>) => ({
  uid,
  email: `${uid}@example.com`,
  getIdTokenResult: () => Promise.resolve({ claims }),
});

const offline = (uid: string) => ({
  uid,
  email: `${uid}@example.com`,
  getIdTokenResult: () => Promise.reject(Object.assign(new Error('network'), { code: 'auth/network-request-failed' })),
});

async function launch(user: unknown) {
  const rendered = await renderHook(() => useAuth(), { wrapper });
  await act(() => {
    listener?.(user);
  });
  return rendered;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  listener = null;
});

describe('a signed-in coach opening the app offline', () => {
  it('keeps the role their last connected launch had', async () => {
    const first = await launch(online('u-sam', { role: 'trainer' }));
    await waitFor(() => expect(first.result.current.claims.role).toBe('trainer'));
    await first.unmount();

    const second = await launch(offline('u-sam'));
    await waitFor(() => expect(second.result.current.status).toBe('signedIn'));
    expect(second.result.current.claims.role).toBe('trainer');
    expect(second.result.current.scope).toEqual({ role: 'trainer', uid: 'u-sam', trainerId: 'u-sam' });
  });

  it("never lends one account's role to another", async () => {
    const first = await launch(online('u-sam', { role: 'trainer' }));
    await waitFor(() => expect(first.result.current.claims.role).toBe('trainer'));
    await first.unmount();

    const second = await launch(offline('u-someone-else'));
    await waitFor(() => expect(second.result.current.status).toBe('signedIn'));
    expect(second.result.current.claims).toEqual({});
  });
});
