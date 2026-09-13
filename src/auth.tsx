import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type User,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { friendlyAuthError } from './authErrors';
import { cloudConfig } from './config';
import { firebase } from './firebase';
import type { Client, WeightUnit } from './models';
import { forgetPushToken, releasePushToken } from './pushTokens';
import { DEFAULT_PREFS, type NotificationGroup, type NotificationPrefs, withDefaults } from './notificationPrefs';
import { TRAINER_NAME } from './sampleData';
import type { SyncScope } from './sync/types';

/**
 * Accounts. Firebase Auth holds the email and password; the role (coach or
 * client, and which coach) is a claim in the sign-in token that only the Cloud
 * Functions can set, so it can be trusted by the security rules and by this app.
 *
 * With cloud switched off (the default until it is configured) the status is
 * 'off' and Firebase is never started.
 */

export type AuthStatus = 'off' | 'loading' | 'signedOut' | 'signedIn';

export interface AccountClaims {
  role?: 'trainer' | 'client';
  trainerId?: string;
  clientId?: string;
}

export interface InvitePreview {
  trainerName: string;
  clientName: string;
  email: string;
  unit: WeightUnit;
  alreadyJoined: boolean;
}

export interface AccountProfile {
  /** The person's own name as their account has it. */
  displayName: string | null;
  /** Their coach's name — their own, for a coach. */
  coachName: string | null;
  prefs: NotificationPrefs;
}

export interface AuthValue {
  status: AuthStatus;
  uid: string | null;
  email: string | null;
  claims: AccountClaims;
  /** What cloud sync should sync. Null until the account has a role. */
  scope: SyncScope | null;
  profile: AccountProfile;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** New coach: creates the account, then the coaching profile. */
  signUpAsTrainer: (name: string, email: string, password: string) => Promise<void>;
  /** Retries the profile step for an account whose sign-up was interrupted. */
  finishTrainerSetup: (name: string) => Promise<void>;
  /** Who is inviting whom, before any account exists. */
  previewInvite: (code: string) => Promise<InvitePreview>;
  /** New client: creates the account and links it to the invitation. */
  joinWithCode: (input: { code: string; email: string; password: string; unit?: WeightUnit }) => Promise<void>;
  /** Links an existing, role-less account to an invitation. */
  redeemInvite: (code: string, unit?: WeightUnit) => Promise<void>;
  createInvite: (name: string, email: string, unit: WeightUnit) => Promise<Client>;
  regenerateInviteCode: (clientId: string) => Promise<string>;
  setNotificationPref: (group: NotificationGroup, on: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const EMPTY_PROFILE: AccountProfile = { displayName: null, coachName: null, prefs: DEFAULT_PREFS };

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function scopeFor(uid: string | null, claims: AccountClaims): SyncScope | null {
  if (!uid) return null;
  if (claims.role === 'trainer') return { role: 'trainer', uid, trainerId: uid };
  if (claims.role === 'client' && claims.trainerId && claims.clientId) {
    return { role: 'client', uid, trainerId: claims.trainerId, clientId: claims.clientId };
  }
  return null;
}

/** Runs a Firebase call, turning any failure into a sentence for the screen. */
async function friendly<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

/**
 * The role this phone last read from an account's token. Reading it again
 * needs a fresh token, and a token over an hour old can only be refreshed with
 * a connection — so without this, a coach opening the app offline had no role
 * and was sent to "Finish setting up". Kept for one account at a time and only
 * handed back to that account; the security rules still check the real token.
 */
const CLAIMS_KEY = 'strength-coach/claims';

async function rememberClaims(uid: string, claims: AccountClaims) {
  await AsyncStorage.setItem(CLAIMS_KEY, JSON.stringify({ uid, claims })).catch(() => undefined);
}

async function rememberedClaims(uid: string): Promise<AccountClaims> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(CLAIMS_KEY)) ?? 'null') as {
      uid?: string;
      claims?: AccountClaims;
    } | null;
    return saved?.uid === uid && saved.claims ? saved.claims : {};
  } catch {
    return {};
  }
}

async function call<T>(name: string, data?: unknown): Promise<T> {
  return friendly(async () => (await httpsCallable(firebase().functions, name)(data)).data as T);
}

/** Picks up a role a Cloud Function just set. onIdTokenChanged hears the new token. */
async function refreshClaims(): Promise<void> {
  await firebase().auth.currentUser?.getIdToken(true);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; user: User | null; claims: AccountClaims }>(() => ({
    status: cloudConfig.enabled ? 'loading' : 'off',
    user: null,
    claims: {},
  }));
  const [account, setAccount] = useState<{ displayName: string | null; prefs: NotificationPrefs }>({
    displayName: null,
    prefs: DEFAULT_PREFS,
  });
  const [coachName, setCoachName] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudConfig.enabled) return;
    return onIdTokenChanged(firebase().auth, (user) => {
      if (!user) {
        setState({ status: 'signedOut', user: null, claims: {} });
        return;
      }
      void user
        .getIdTokenResult()
        .then((token) => {
          const { role, trainerId, clientId } = token.claims as AccountClaims;
          const claims = { role, trainerId, clientId };
          void rememberClaims(user.uid, claims);
          setState({ status: 'signedIn', user, claims });
        })
        .catch(async () => setState({ status: 'signedIn', user, claims: await rememberedClaims(user.uid) }));
    });
  }, []);

  const uid = state.user?.uid ?? null;
  const role = state.claims.role;
  const trainerId = role === 'trainer' ? uid : (state.claims.trainerId ?? null);

  // The account's own profile: name and notification switches.
  useEffect(() => {
    if (!uid || !role) {
      setAccount({ displayName: null, prefs: DEFAULT_PREFS });
      return;
    }
    return onSnapshot(
      doc(firebase().db, 'users', uid),
      (snapshot) =>
        setAccount({
          displayName: (snapshot.get('displayName') as string | undefined) ?? null,
          prefs: withDefaults(snapshot.get('notificationPrefs')),
        }),
      () => undefined
    );
  }, [uid, role]);

  // The coach's name, as every client screen says it.
  useEffect(() => {
    if (!trainerId) {
      setCoachName(null);
      return;
    }
    return onSnapshot(
      doc(firebase().db, 'trainers', trainerId),
      (snapshot) => setCoachName((snapshot.get('name') as string | undefined) ?? null),
      () => undefined
    );
  }, [trainerId]);

  const finishTrainerSetup = useCallback(async (name: string) => {
    await call('createTrainerProfile', { name, timezone: localTimeZone() });
    await refreshClaims();
  }, []);

  const value = useMemo<AuthValue>(() => {
    return {
      status: state.status,
      uid,
      email: state.user?.email ?? null,
      claims: state.claims,
      scope: scopeFor(uid, state.claims),
      profile: { displayName: account.displayName, coachName, prefs: account.prefs },

      signIn: (email, password) =>
        friendly(async () => {
          await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
        }),

      signOut: async () => {
        // Every Sign out button comes through here, so this phone's push token
        // leaves the account whichever one was used.
        if (uid) await releasePushToken(uid);
        await friendly(() => firebaseSignOut(firebase().auth));
      },

      resetPassword: (email) => friendly(() => sendPasswordResetEmail(firebase().auth, email.trim())),

      signUpAsTrainer: async (name, email, password) => {
        await friendly(() => createUserWithEmailAndPassword(firebase().auth, email.trim(), password));
        await finishTrainerSetup(name);
      },

      finishTrainerSetup,

      previewInvite: (code) => call<InvitePreview>('previewInvite', { code }),

      joinWithCode: async ({ code, email, password, unit }) => {
        await friendly(() => createUserWithEmailAndPassword(firebase().auth, email.trim(), password));
        await call('redeemInvite', { code, unit, timezone: localTimeZone() });
        await refreshClaims();
      },

      redeemInvite: async (code, unit) => {
        await call('redeemInvite', { code, unit, timezone: localTimeZone() });
        await refreshClaims();
      },

      createInvite: async (name, email, unit) =>
        (await call<{ client: Client }>('createInvite', { name, email, unit })).client,

      regenerateInviteCode: async (clientId) =>
        (await call<{ inviteCode: string }>('regenerateInviteCode', { clientId })).inviteCode,

      setNotificationPref: async (group, on) => {
        if (!uid) return;
        await friendly(() =>
          updateDoc(doc(firebase().db, 'users', uid), {
            [`notificationPrefs.${group}`]: on,
            updatedAt: serverTimestamp(),
          })
        );
      },

      deleteAccount: async () => {
        await call('deleteAccount');
        // The server removed this phone's token with the account.
        await forgetPushToken();
        // The account is gone on the server; drop the local sign-in with it.
        await firebaseSignOut(firebase().auth).catch(() => undefined);
      },
    };
  }, [state, uid, account, coachName, finishTrainerSetup]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/**
 * The coach's name, wherever a screen says it. Without accounts the app is a
 * single-coach demo, and that coach is the sample one.
 */
export function useCoachName(): string {
  const { status, profile } = useAuth();
  return status === 'off' ? TRAINER_NAME : (profile.coachName ?? profile.displayName ?? '');
}
