import React from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StoreProvider, useStore } from '../src/store';
import { AuthProvider, useAuth } from '../src/auth';
import { CloudBridge } from '../src/sync/CloudBridge';
import { NotificationsBridge } from '../src/components/NotificationsBridge';
import { useIsDark, usePalette } from '../src/theme';
import { CelebrationProvider } from '../src/celebration/CelebrationProvider';

/**
 * expo-router mounts whatever a layout exports under this name when a render
 * below it throws. Without it an unhandled error is a white screen.
 */
export { AppErrorBoundary as ErrorBoundary } from '../src/components/AppErrorBoundary';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Accounts, then the store's link to the cloud. Both are inert until
            EXPO_PUBLIC_CLOUD is switched on. */}
        <AuthProvider>
          <CloudBridge>
            <StoreProvider>
              <Root />
            </StoreProvider>
          </CloudBridge>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Split out so it sits inside StoreProvider and can read the theme override. */
function Root() {
  const palette = usePalette();
  const isDark = useIsDark();
  const store = useStore();
  const auth = useAuth();
  // The same two calls the root gate uses. Protected removes the routes rather
  // than redirecting, so a URL typed straight into the address bar falls back
  // to index — the paywall — instead of rendering tabs for a signed-out user.
  const trainerReady = store.canUseTrainerApp();
  const clientReady = store.canUseClientApp();

  // Hold the first paint until the saved store is back. Both guards above read
  // false on an empty store, so rendering early shows a coach who has paid the
  // paywall — and a signed-in client the same — for as long as the read takes.
  // The fill matches the splash background, so it reads as the splash still
  // being up rather than as a flash of the wrong screen.
  // With accounts, the saved sign-in has to be read back too, or a signed-in
  // coach would see the welcome screen for as long as that takes.
  if (!store.hydrated || auth.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  }

  // After the hydration gate, so a celebration can read the store — and inside
  // the root, so its overlay is a sibling drawn above the Stack.
  return (
    <CelebrationProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NotificationsBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.text, fontWeight: '700' },
          headerTintColor: palette.accent,
          // The web header put custom buttons flush to the screen edge (Cancel
          // at x=0); iOS insets them itself. The web header takes container
          // styles that the native-stack option types don't list, and passes
          // them through, hence the cast.
          ...(Platform.OS === 'web'
            ? ({
                headerLeftContainerStyle: { paddingLeft: 16 },
                headerRightContainerStyle: { paddingRight: 16 },
              } as object)
            : null),
        }}
      >
        <Stack.Screen name="index" />

        {/* Every pop-up that shows a header declares it HERE, not from inside the
            screen. On iOS, react-native-screens rebuilds a modal from scratch when its
            header visibility changes, throwing away all local state. With the root
            default of headerShown: false, a screen switching it on for itself was a
            change: it wiped the demo code and the exercise picker, and in the live
            session the rebuilt keypad Modals fed a "Maximum update depth" crash. */}
        <Stack.Protected guard={trainerReady}>
          <Stack.Screen name="(trainer)" />
          {/* Creation and logging flows are modals, so they correctly drop the tab bar. */}
          <Stack.Screen name="builder/[id]" options={{ presentation: 'modal', headerShown: true }} />
          <Stack.Screen
            name="session/[id]"
            options={{ presentation: 'fullScreenModal', headerShown: true }}
          />
          <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: true }} />
        </Stack.Protected>

        <Stack.Protected guard={clientReady}>
          <Stack.Screen name="(client)" />
          <Stack.Screen
            name="solo/[id]"
            options={{ presentation: 'fullScreenModal', headerShown: true }}
          />
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
        <Stack.Screen name="join" options={{ presentation: 'modal', headerShown: true }} />
        {/* Accounts. Pushed from the welcome screen, outside both guards. */}
        <Stack.Screen
          name="sign-in"
          options={{ headerShown: true, title: 'Sign in', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="create-account"
          options={{ headerShown: true, title: 'Create account', headerBackTitle: 'Back' }}
        />
        {/* Terms and Privacy. Outside both guards, because the paywall links to
            them before anybody has signed in or paid. */}
        <Stack.Screen
          name="legal/[doc]"
          options={{ presentation: 'modal', headerShown: true, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="delete-account"
          options={{ headerShown: true, title: 'Delete account', headerBackTitle: 'Back' }}
        />
      </Stack>
    </CelebrationProvider>
  );
}
