import { createContext, useContext } from 'react';
import type { RemoteAdapter, SyncScope } from './types';

/**
 * How the store reaches the cloud without importing Firebase.
 *
 * The app provides this from its root layout when cloud sync is switched on
 * and someone is signed in. Without a provider — the tests, or the app before
 * accounts exist — the store behaves exactly as it always has: everything on
 * the phone, nothing queued.
 */
export interface CloudServices {
  adapter: RemoteAdapter;
  /** Reports the connection now and whenever it changes. Returns an unsubscribe. */
  watchConnection: (onChange: (online: boolean) => void) => () => void;
  /** Fetches a fresh sign-in token, so an upload refused for a role the old one lacked can be tried again. */
  refreshAuth?: () => Promise<void>;
}

export interface CloudSession {
  services: CloudServices;
  /** Null while nobody is signed in. */
  scope: SyncScope | null;
}

export const CloudContext = createContext<CloudSession | null>(null);

export function useCloud(): CloudSession | null {
  return useContext(CloudContext);
}
