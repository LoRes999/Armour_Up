import React from 'react';
import { Stack } from 'expo-router';
import { usePalette } from '../../../src/theme';

/**
 * Anchored on the calendar so a detail route is never the only entry in this
 * stack — without it a deep link or a rebuilt navigator leaves no back button.
 */
export const unstable_settings = { initialRouteName: 'index' };

/** Nested so a past session keeps the tab bar when pushed. */
export default function HistoryStack() {
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
      <Stack.Screen name="index" options={{ title: 'History', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
