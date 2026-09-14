import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { usePalette, metrics } from '../src/theme';
import { EmptyState, PrimaryButton } from '../src/components/ui';

/**
 * Without this, a mistyped path renders nothing at all — which matters more
 * than usual here, because the app is reviewed in a browser where the URL bar
 * is right there and the `armourup://` scheme has no handler either.
 */
export default function NotFound() {
  const p = usePalette();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
      <View style={{ flex: 1, justifyContent: 'center', padding: metrics.screenPadding, gap: 16 }}>
        <EmptyState
          icon="compass-outline"
          title="Nothing here"
          message="That page does not exist. It may have been removed, or the link may be wrong."
        />
        <PrimaryButton title="Back to the app" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}
