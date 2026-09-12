import React, { useMemo } from 'react';
import { useAuth } from '../auth';
import { cloudConfig } from '../config';
import { firebase } from '../firebase';
import { watchConnection } from './connection';
import { CloudContext, type CloudServices } from './context';
import { firestoreAdapter } from './firestore';

/**
 * Hands the store its connection to the cloud: the Firestore adapter and the
 * signed-in account's scope. Sits between AuthProvider and StoreProvider in
 * the root layout. With cloud switched off it provides nothing, and the store
 * runs exactly as it always has.
 */
export function CloudBridge({ children }: { children: React.ReactNode }) {
  const { status, scope } = useAuth();

  // Created once: the engine keys its listeners on this object.
  const services = useMemo<CloudServices | null>(
    () =>
      cloudConfig.enabled ? { adapter: firestoreAdapter(firebase().db), watchConnection } : null,
    []
  );

  const scopeKey = scope ? JSON.stringify(scope) : null;
  const session = useMemo(
    () => (services && status !== 'off' ? { services, scope } : null),
    // `scope` is a new object on every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, status, scopeKey]
  );

  return <CloudContext.Provider value={session}>{children}</CloudContext.Provider>;
}
