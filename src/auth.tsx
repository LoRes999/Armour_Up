import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type User,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { friendlyAuthError } from './authErrors';
import { cloudConfig } from './config';
import { firebase } from './firebase';
import type { Client, WeightUnit } from './models';
import type { SyncScope } from './sync/types';

/**
 * Accounts. Firebase Auth holds the email and password; the role (coach or
 * client, and which coach) is a claim in the sign-in token that only the Cloud
 * Functions can set, so it can be trusted by the security rules and by this app.
 *
 * With cloud switched off (the default until the account screens exist) the
 * status is 'off' and Firebase is never started.
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

export interface AuthValue {
  status: AuthStatus;
  uid: string | null;
  email: string | null;
  claims: AccountClaims;
  /** What cloud sync should sync. Null until the account has a role. */
  scope: SyncScope | null;

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
  createInvite: (name: string, email: string, unit: WeightUnit) => Promise<Client>;
  regenerateInviteCode: (clientId: string) => Promise<string>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

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
          setState({ status: 'signedIn', user, claims: { role, trainerId, clientId } });
        })
        .catch(() => setState({ status: 'signedIn', user, claims: {} }));
    });
  }, []);

  const finishTrainerSetup = useCallback(async (name: string) => {
    await call('createTrainerProfile', { name, timezone: localTimeZone() });
    await refreshClaims();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const uid = state.user?.uid ?? null;
    return {
      status: state.status,
      uid,
      email: state.user?.email ?? null,
      claims: state.claims,
      scope: scopeFor(uid, state.claims),

      signIn: (email, password) =>
        friendly(async () => {
          await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
        }),

      signOut: () => friendly(() => firebaseSignOut(firebase().auth)),

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

      createInvite: async (name, email, unit) =>
        (await call<{ client: Client }>('createInvite', { name, email, unit })).client,

      regenerateInviteCode: async (clientId) =>
        (await call<{ inviteCode: string }>('regenerateInviteCode', { clientId })).inviteCode,

      deleteAccount: async () => {
        await call('deleteAccount');
        // The account is gone on the server; drop the local sign-in with it.
        await firebaseSignOut(firebase().auth).catch(() => undefined);
      },
    };
  }, [state, finishTrainerSetup]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
