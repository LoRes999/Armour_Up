import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { metrics, usePalette } from '../theme';
import { Card, PrimaryButton, Title } from './ui';

/**
 * The two in-between states of an account, shown by the root gate.
 */

/**
 * Signed in, but setup stopped before the account got a side — the connection
 * dropped between creating the account and the coaching profile or the
 * invitation. Either way can be finished from here.
 */
export function FinishSetup() {
  const p = usePalette();
  const router = useRouter();
  const auth = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 20, gap: 16 }}>
        <Title size={32}>Finish setting up.</Title>
        <Text style={{ fontSize: 15, color: p.dim, lineHeight: 22 }}>
          {`Your account${auth.email ? ` (${auth.email})` : ''} was created, but setup didn't finish. Are you coaching, or joining a coach?`}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 9 }}>
          <PrimaryButton title="I'm a coach" onPress={() => router.push('/create-account')} />
          <Pressable onPress={() => router.push('/join')} accessibilityRole="button">
            <Card radius={12} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>I have an invite code</Text>
            </Card>
          </Pressable>
          <Pressable
            onPress={() => void auth.signOut()}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.dim }}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A client just signed in on this phone and their programme hasn't arrived
 * yet. Usually a second; without a connection, it says what is needed.
 */
export function PreparingProgramme() {
  const p = usePalette();
  const { syncStatus } = useStore();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }}>
      {syncStatus.online ? <ActivityIndicator color={p.accent} /> : null}
      <Text style={{ fontSize: 16, fontWeight: '700', color: p.text, textAlign: 'center' }}>
        {syncStatus.online ? 'Getting your programme…' : "You're offline."}
      </Text>
      {syncStatus.online ? null : (
        <Text style={{ fontSize: 14, color: p.dim, textAlign: 'center', lineHeight: 20 }}>
          Connect to the internet once to load your programme. After that it works offline too.
        </Text>
      )}
    </SafeAreaView>
  );
}
