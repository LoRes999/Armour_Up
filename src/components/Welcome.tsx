import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { openHosted } from '../legal';
import type { LegalDocId } from '../legalContent';
import { metrics, usePalette } from '../theme';
import { Card, PrimaryButton, Title } from './ui';

/**
 * The first screen once accounts exist (design option A): two doors and a
 * way back in. A coach creates an account and then chooses a plan; a client
 * goes to their invite code. One sign-in serves both, because the account
 * already knows which side it belongs to.
 */
export default function Welcome() {
  const p = usePalette();
  const router = useRouter();

  const openLegal = async (doc: LegalDocId) => {
    if (!(await openHosted(doc))) router.push({ pathname: '/legal/[doc]', params: { doc } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 20, gap: 20 }}
      >
        <View style={{ gap: 18 }}>
          <View
            style={{
              width: 58,
              minHeight: 58,
              borderRadius: 18,
              backgroundColor: p.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="barbell" size={30} color={p.onAccent} />
          </View>
          <Title size={40}>{'Coach your\nwhole roster.'}</Title>
          <Text style={{ fontSize: 15, color: p.dim, lineHeight: 22 }}>
            Programme every session, log it set by set, and watch the records stack up. Clients
            join free with a code you send them.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ gap: 9 }}>
          <PrimaryButton title="I'm a coach" onPress={() => router.push('/create-account')} />
          <Pressable
            onPress={() => router.push('/join')}
            accessibilityRole="button"
            accessibilityLabel="I have an invite code"
          >
            <Card radius={12} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>I have an invite code</Text>
            </Card>
          </Pressable>
          <Pressable
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>
              Already have an account? Sign in
            </Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center', lineHeight: 17 }}>
          By continuing you agree to our{' '}
          <Text onPress={() => openLegal('terms')} accessibilityRole="link" style={{ color: p.accent, fontWeight: '700' }}>
            Terms of Service
          </Text>
          {' and '}
          <Text onPress={() => openLegal('privacy')} accessibilityRole="link" style={{ color: p.accent, fontWeight: '700' }}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
