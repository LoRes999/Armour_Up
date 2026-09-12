import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { cloudConfig } from '../src/config';
import { useStore } from '../src/store';
import Paywall from '../src/components/Paywall';
import Welcome from '../src/components/Welcome';
import { FinishSetup, PreparingProgramme } from '../src/components/AccountGates';

/**
 * The root route is the gate — no redirect frame, so the first screen really
 * is the first thing drawn rather than somewhere the app bounces to.
 *
 * Both app conditions come from the store rather than being written out here,
 * because app/_layout.tsx guards the same two groups with the same two calls.
 * A gate and a guard that disagree is an infinite redirect.
 *
 * With accounts: signed out sees the welcome screen; a coach without a plan
 * sees the paywall; a client waits for their programme on a new phone.
 */
export default function Index() {
  const store = useStore();
  const auth = useAuth();

  if (cloudConfig.enabled) {
    if (auth.status === 'signedOut') return <Welcome />;
    if (auth.status === 'signedIn' && !auth.claims.role) return <FinishSetup />;
    if (auth.claims.role === 'client' && !store.canUseClientApp()) return <PreparingProgramme />;
  }

  if (store.canUseTrainerApp()) return <Redirect href="/(trainer)/clients" />;
  if (store.canUseClientApp()) return <Redirect href="/(client)" />;
  return <Paywall />;
}
