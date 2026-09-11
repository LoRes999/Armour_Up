import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, Keyboard } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../src/store';
import { metrics, usePalette } from '../src/theme';
import { Avatar, Card, Eyebrow, PrimaryButton, SegmentedPicker, Title, keyboardAware } from '../src/components/ui';
import {
  CODE_LENGTH,
  DEFAULT_UNIT,
  UNITS,
  WeightUnit,
  initialsOf,
  normaliseCode,
  unitName,
} from '../src/models';
import { TRAINER_NAME } from '../src/sampleData';
import { useClose } from '../src/useClose';

/**
 * How a client gets into the app. The code is their identity — matching it is
 * what decides whose programme they see, which is the thing that used to be
 * hardcoded to the first seeded client.
 */
export default function Join() {
  const p = usePalette();
  const router = useRouter();
  const close = useClose();
  const store = useStore();
  const [code, setCode] = useState('');
  // Null until they actually touch the picker. Derived rather than synced, so
  // it can show the unit the trainer chose for them without an effect — and so
  // accepting an invite no longer silently overwrites that choice with kg.
  const [unitChoice, setUnitChoice] = useState<WeightUnit | null>(null);

  const clean = normaliseCode(code);
  const match = store.clientByCode(clean);
  const unit = unitChoice ?? match?.unit ?? DEFAULT_UNIT;
  // Only complain once they have typed a whole code — nagging halfway through
  // someone's first six characters is just noise. Counted on what they typed,
  // not on what survived normalising: an O where a Q belongs is stripped, which
  // used to leave a full-looking field with no match and no error at all.
  const wrong = code.trim().length >= CODE_LENGTH && !match;

  /**
   * A fresh install has no clients, so there is no code to demo with. Seeding
   * the sample roster first is what makes this button work from a cold start —
   * reading clients[0] alone just silently filled the field with nothing.
   */
  const fillDemoCode = () => {
    // Always a sample client. Reading clients[0] could hand a developer a real
    // client's code, and sign them into that person's account.
    setCode(store.loadSampleData());
    // Put the keyboard away so the invitation that just appeared, and its
    // Accept button, are on screen. They used to render underneath it, so on
    // a phone this button looked as though it did nothing.
    Keyboard.dismiss();
  };

  const accept = () => {
    if (!match) return;
    if (unitChoice && unitChoice !== match.unit) store.setClientUnit(match.id, unitChoice);
    store.redeemInviteCode(clean);
    // Back to the root gate, which now redirects into the client app.
    close();
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerLeft: () => (
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: p.accent, fontSize: 16 }}>Close</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        {...keyboardAware}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 18 }}
      >
        <Title size={30}>Enter your invite code.</Title>
        <Text style={{ fontSize: 14, color: p.dim, lineHeight: 20, marginTop: -8 }}>
          Your coach sends you a six-character code. It never expires, so keep it if you change
          phones.
        </Text>

        <View style={{ gap: 7 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="XXXXXX"
            placeholderTextColor={p.dim}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={CODE_LENGTH + 2}
            style={{
              minHeight: 64,
              borderRadius: metrics.controlRadius,
              backgroundColor: p.surfaceAlt,
              borderWidth: 1.5,
              borderColor: wrong ? p.danger : match ? p.accent : 'transparent',
              color: p.text,
              fontSize: 28,
              fontWeight: '800',
              letterSpacing: 8,
              textAlign: 'center',
            }}
          />
          {wrong ? (
            <Text style={{ fontSize: 12, color: p.danger, textAlign: 'center' }}>
              We don't recognise that code. Check it with your coach.
            </Text>
          ) : null}
        </View>

        {/* Without this, signing out of the trainer app strands a reviewer: the
            client's only door is a code they have no way of knowing. */}
        {__DEV__ && !match ? (
          <Pressable
            onPress={fillDemoCode}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: p.dim }}>
              Use a demo code
            </Text>
          </Pressable>
        ) : null}

        {match ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar
                initials={initialsOf(TRAINER_NAME)}
                size={52}
                tint={p.onAccent}
                background={p.accent}
              />
              <View>
                <Eyebrow color={p.accent}>INVITATION</Eyebrow>
                <Text
                  style={{ fontSize: 19, fontWeight: '800', letterSpacing: -0.5, color: p.text }}
                >
                  {TRAINER_NAME}
                </Text>
                <Text style={{ fontSize: 12, color: p.dim }}>Strength coach</Text>
              </View>
            </View>

            <Title size={26}>{`${TRAINER_NAME.split(' ')[0]} wants to coach you, ${
              match.name.split(' ')[0]
            }.`}</Title>

            <View style={{ gap: 11 }}>
              {[
                {
                  icon: 'list-outline' as const,
                  title: 'Your programme, written for you',
                  detail: 'See exactly what you are lifting each session, before you get there.',
                },
                {
                  icon: 'trending-up-outline' as const,
                  title: 'Every number kept',
                  detail: `${TRAINER_NAME.split(' ')[0]} logs your sets as you lift. You keep the full history.`,
                },
                {
                  icon: 'shield-checkmark-outline' as const,
                  title: 'Yours to leave with',
                  detail: 'Export or delete your data at any time from Settings.',
                },
              ].map((bullet) => (
                <View key={bullet.title} style={{ flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      backgroundColor: p.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={bullet.icon} size={15} color={p.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>
                      {bullet.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: p.dim, lineHeight: 17, marginTop: 1 }}>
                      {bullet.detail}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Card radius={17} style={{ padding: 14, gap: 9 }}>
              <Eyebrow>SHOW MY WEIGHTS IN</Eyebrow>
              <SegmentedPicker
                options={UNITS}
                labels={{ kg: unitName('kg'), lb: unitName('lb') }}
                value={unit}
                onChange={setUnitChoice}
                height={40}
              />
              <Text style={{ fontSize: 11, color: p.dim }}>
                You can change this any time. Your coach sees whichever unit you choose.
              </Text>
            </Card>

            <View style={{ gap: 12, marginTop: 4 }}>
              <PrimaryButton title="Accept invitation" onPress={accept} />
              <Pressable
                onPress={close}
                style={{
                  minHeight: metrics.hitTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: p.dim }}>Not now</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
