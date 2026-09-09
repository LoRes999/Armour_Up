import React from 'react';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { darkPalette, lightPalette, metrics } from '../theme';

/**
 * The last thing between a thrown error and a white screen.
 *
 * There was no boundary anywhere and no crash reporting, so any unhandled throw
 * left the app blank with no way out but force-quitting it — and since nothing
 * persisted, force-quitting also lost the session.
 *
 * It reads the OS colour scheme rather than usePalette: expo-router renders
 * this *instead of* the root layout, so StoreProvider is not mounted and
 * useStore would throw from inside the thing meant to catch throws.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const scheme = useColorScheme();
  const p = scheme === 'light' ? lightPalette : darkPalette;

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 28,
          gap: 14,
        }}
      >
        <Ionicons name="alert-circle-outline" size={34} color={p.danger} />

        <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.8, color: p.text }}>
          Something went wrong.
        </Text>

        <Text style={{ fontSize: 14, lineHeight: 21, color: p.dim }}>
          Your training data is saved on this device and has not been lost. Try again, and if it
          keeps happening, please send the detail below to your coach.
        </Text>

        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={{
            minHeight: metrics.hitTarget,
            borderRadius: metrics.buttonRadius,
            backgroundColor: p.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 6,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '800', color: p.onAccent }}>Try again</Text>
        </Pressable>

        {/* The only diagnostics this app has. There is no crash reporter, so if
            the user cannot read the error to somebody, nobody ever sees it. */}
        <View
          style={{
            marginTop: 10,
            padding: 13,
            borderRadius: metrics.cardRadius,
            backgroundColor: p.surfaceAlt,
          }}
        >
          <Text
            selectable
            style={{ fontSize: 11, lineHeight: 16, color: p.dim, fontFamily: 'monospace' }}
          >
            {error?.message ?? 'No detail available.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
