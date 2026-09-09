import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StoreProvider, useStore } from '../src/store';
import { useIsDark, usePalette } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <Root />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Split out so it sits inside StoreProvider and can read the theme override. */
function Root() {
  const palette = usePalette();
  const isDark = useIsDark();
  const store = useStore();
  // The same two calls the root gate uses. Protected removes the routes rather
  // than redirecting, so a URL typed straight into the address bar falls back
  // to index — the paywall — instead of rendering tabs for a signed-out user.
  const trainerReady = store.canUseTrainerApp();
  const clientReady = store.canUseClientApp();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.text, fontWeight: '700' },
          headerTintColor: palette.accent,
        }}
      >
        <Stack.Screen name="index" />

        <Stack.Protected guard={trainerReady}>
          <Stack.Screen name="(trainer)" />
          {/* Creation and logging flows are modals, so they correctly drop the tab bar. */}
          <Stack.Screen name="builder/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="session/[id]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        </Stack.Protected>

        <Stack.Protected guard={clientReady}>
          <Stack.Screen name="(client)" />
          <Stack.Screen name="solo/[id]" options={{ presentation: 'fullScreenModal' }} />
        </Stack.Protected>
        {/* Reference, reachable from any movement name on either side of the app. */}
        <Stack.Screen
          name="movement/[name]"
          options={{ presentation: 'modal', headerShown: true, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="movement/new"
          options={{ presentation: 'modal', headerShown: true }}
        />
        <Stack.Screen name="join" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="delete-account"
          options={{ headerShown: true, title: 'Delete Account', headerBackTitle: 'Back' }}
        />
      </Stack>
    </>
  );
}
