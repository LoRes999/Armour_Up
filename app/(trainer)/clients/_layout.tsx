import React from 'react';
import { Stack } from 'expo-router';
import { usePalette } from '../../../src/theme';

/**
 * Anchored on the roster so a detail route is never the only entry in this
 * stack — without it a deep link or a rebuilt navigator leaves no back button.
 */
export const unstable_settings = { initialRouteName: 'index' };

/** Nested stack so client detail keeps the tab bar, as a pushed screen should. */
export default function ClientsStack() {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.background },
        headerTitleStyle: { color: p.text, fontWeight: '700' },
        headerTintColor: p.accent,
        contentStyle: { backgroundColor: p.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Clients', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="session/[id]" options={{ title: '' }} />
    </Stack>
  );
}
