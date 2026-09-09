import React from 'react';
import { Redirect } from 'expo-router';
import { useStore } from '../src/store';
import Paywall from '../src/components/Paywall';

/**
 * The root route is the gate and the paywall at once — no redirect frame, so
 * the paywall really is the first thing drawn rather than somewhere the app
 * bounces to.
 *
 * Both conditions come from the store rather than being written out here,
 * because app/_layout.tsx guards the same two groups with the same two calls.
 * A gate and a guard that disagree is an infinite redirect.
 */
export default function Index() {
  const store = useStore();
  if (store.canUseTrainerApp()) return <Redirect href="/(trainer)/clients" />;
  if (store.canUseClientApp()) return <Redirect href="/(client)" />;
  return <Paywall />;
}
