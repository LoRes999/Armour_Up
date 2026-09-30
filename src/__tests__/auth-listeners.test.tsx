import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The account's own profile (name, notification switches) and a client's
 * coach's name are read by listeners. Their first error — usually a sign-in
 * token a moment older than the role it needs, straight after joining —
 * stopped them for good: a new client saw their coach's name missing all
 * session, and the switches never showed their saved values. They now start
 * again after a short wait, as the sync listeners do.
 */

jest.setTimeout(20000);

type TokenListener = (user: unknown) => void;
type SnapshotNext = (snapshot: { exists: () => boolean; get: (field: string) => unknown }) => void;
let listener: TokenListener | null = null;
const mockSubscriptions: Record<string, number> = {};
const mockFailFirst = new Set<string>();
const mockData: Record<string, Record<string, unknown>> = {};
/** Sends a document's current mockData to its listener again, as a server change would. */
const mockEmit: Record<string, () => void> = {};
let mockCurrentUser: { getIdToken: (force?: boolean) => Promise<unknown> } | null = null;

jest.mock('../config', () => ({
  cloudConfig: { enabled: true, firebase: {}, emulatorHost: '' },
}));
jest.mock('../firebase', () => ({
  firebase: () => ({ auth: { currentUser: mockCurrentUser }, db: {}, functions: {} }),
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
  // A path string stands in for a document reference, so each read can be told apart.
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (ref: string, next: SnapshotNext, error: (e: unknown) => void) => {
    mockSubscriptions[ref] = (mockSubscriptions[ref] ?? 0) + 1;
    const refuse = mockFailFirst.has(ref) && mockSubscriptions[ref] === 1;
    const send = () =>
      next({ exists: () => ref in mockData, get: (field: string) => mockData[ref]?.[field] });
    const timer = setTimeout(() => {
      if (refuse) {
        error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
      } else {
        mockEmit[ref] = send;
        send();
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      if (mockEmit[ref] === send) delete mockEmit[ref];
    };
  },
  deleteDoc: () => Promise.resolve(),
  serverTimestamp: () => 'now',
  setDoc: () => Promise.resolve(),
  updateDoc: () => Promise.resolve(),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

// After the mocks, so the provider picks them up.
// eslint-disable-next-line import/first
import { AuthProvider, useAuth, useCoachFirstName, useCoachName } from '../auth';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const jordan = {
  uid: 'u-jordan',
  email: 'jordan@example.com',
  getIdTokenResult: () =>
    Promise.resolve({ claims: { role: 'client', trainerId: 't-sam', clientId: 'c-jordan' } }),
};

async function signIn(user: unknown) {
  const rendered = await renderHook(() => useAuth(), { wrapper });
  await act(() => {
    listener?.(user);
  });
  return rendered;
}

let warn: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  listener = null;
  for (const key of Object.keys(mockSubscriptions)) delete mockSubscriptions[key];
  mockFailFirst.clear();
  mockCurrentUser = null;
  mockData['trainers/t-sam'] = { name: 'Sam Coach' };
  mockData['users/u-jordan'] = { displayName: 'Jordan Lee', role: 'client', trainerId: 't-sam', clientId: 'c-jordan' };
  // A refused read is reported so it can be found in the device log.
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('a read refused the first time', () => {
  it("still shows a client their coach's name", async () => {
    mockFailFirst.add('trainers/t-sam');

    const { result } = await signIn(jordan);

    await waitFor(() => expect(result.current.profile.coachName).toBe('Sam Coach'), { timeout: 8000 });
    expect(mockSubscriptions['trainers/t-sam']).toBe(2);
  });

  it('still shows the account its own profile', async () => {
    mockFailFirst.add('users/u-jordan');

    const { result } = await signIn(jordan);

    await waitFor(() => expect(result.current.profile.displayName).toBe('Jordan Lee'), { timeout: 8000 });
    expect(mockSubscriptions['users/u-jordan']).toBe(2);
  });
});

/**
 * Until the coach's own record arrives, the coach's name fell back to the
 * account's display name — which on a client's phone is the client's own. A
 * new client, or one offline, read "Coached by Jordan Lee" about themselves.
 */
describe("the coach's name on a client's phone", () => {
  const coachOf = async () => {
    const rendered = await renderHook(
      () => ({ auth: useAuth(), name: useCoachName(), first: useCoachFirstName() }),
      { wrapper }
    );
    await act(() => {
      listener?.(jordan);
    });
    return rendered;
  };

  it("is never the client's own", async () => {
    mockFailFirst.add('trainers/t-sam');
    const { result } = await coachOf();

    await waitFor(() => expect(result.current.auth.profile.displayName).toBe('Jordan Lee'));
    expect(result.current.name).toBe('your coach');
    expect(result.current.first).toBe('your coach');

    await waitFor(() => expect(result.current.name).toBe('Sam Coach'), { timeout: 8000 });
    expect(result.current.first).toBe('Sam');
  });

  it('is remembered for a launch that cannot reach the server', async () => {
    const first = await coachOf();
    await waitFor(() => expect(first.result.current.name).toBe('Sam Coach'));
    await first.unmount();

    for (const key of Object.keys(mockSubscriptions)) delete mockSubscriptions[key];
    mockFailFirst.add('trainers/t-sam');
    const { result } = await coachOf();
    await waitFor(() => expect(result.current.auth.profile.displayName).toBe('Jordan Lee'));
    await waitFor(() => expect(result.current.name).toBe('Sam Coach'));
    expect(mockSubscriptions['trainers/t-sam']).toBe(1);
  });
});

/**
 * A coach removing a client clears the role from their sign-in token and
 * then from their profile. The phone only reread the token when it next
 * refreshed — up to an hour — and sat on "Getting your program…" meanwhile.
 */
describe('a client removed by their coach', () => {
  it('finds out as soon as their profile loses its role', async () => {
    const released = { ...jordan, getIdTokenResult: () => Promise.resolve({ claims: {} }) };
    const getIdToken = jest.fn(async () => {
      listener?.(released);
    });
    mockCurrentUser = { getIdToken };
    const { result } = await signIn(jordan);
    await waitFor(() => expect(mockEmit['users/u-jordan']).toBeDefined());
    expect(getIdToken).not.toHaveBeenCalled();

    mockData['users/u-jordan'] = { displayName: 'Jordan Lee' };
    await act(() => {
      mockEmit['users/u-jordan']();
    });

    await waitFor(() => expect(result.current.claims.role).toBeUndefined());
    expect(getIdToken).toHaveBeenCalledWith(true);
  });
});
