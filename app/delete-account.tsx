import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../src/store';
import { metrics, usePalette } from '../src/theme';
import { Card, Eyebrow, PrimaryButton, Title } from '../src/components/ui';
import { TRAINER_NAME } from '../src/sampleData';
import { confirm } from '../src/confirm';

const PHRASE = 'DELETE';

/**
 * App Store guideline 5.1.1(v): an app that lets people create an account must
 * let them delete it from inside the app. A mailto link is a common rejection,
 * so this is a real destructive flow with a typed confirmation.
 */
export default function DeleteAccount() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const [typed, setTyped] = useState('');

  const armed = typed.trim().toUpperCase() === PHRASE;

  // The trainer variant is not cosmetic: the client copy tells a coach that they
  // themselves will be notified, and lists a link to themselves.
  const isTrainer = store.role === 'trainer';

  const deleted = isTrainer
    ? [
        'Every client on your roster',
        'All programmes, logged sets and session notes',
        'Your movement library and day types',
        'Your account and sign-in',
      ]
    : [
        'Your training history and PRs',
        'Every logged set and session note',
        `Your link to ${TRAINER_NAME}`,
        'Your account and sign-in',
      ];

  const confirmDelete = () =>
    confirm({
      title: 'Delete your account?',
      message: 'This removes your training history permanently.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        store.deleteAccount();
        router.replace('/');
      },
    });

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 16 }}>
        <View
          style={{
            width: 52,
            minHeight: 52,
            borderRadius: 16,
            backgroundColor: p.dangerSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 6,
          }}
        >
          <Ionicons name="warning" size={26} color={p.danger} />
        </View>

        <Title size={28}>This permanently deletes your account.</Title>

        <Text style={{ fontSize: 14, color: p.dim, lineHeight: 21, marginTop: -8 }}>
          {isTrainer
            ? `You cannot undo this. Every client loses access to their programme and history. Cancel your subscription separately in the App Store.`
            : `You cannot undo this. ${TRAINER_NAME} will be notified that you have left.`}
        </Text>

        <Card radius={17} style={{ padding: 15, gap: 10 }}>
          <Eyebrow color={p.danger}>DELETED IMMEDIATELY</Eyebrow>
          {deleted.map((item) => (
            <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="close" size={14} color={p.danger} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: p.text }}>{item}</Text>
            </View>
          ))}
        </Card>

        <View style={{ padding: 14, borderRadius: 15, backgroundColor: p.surfaceAlt, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: p.text }}>
            Want your numbers first?
          </Text>
          <Text style={{ fontSize: 12, color: p.dim, lineHeight: 18 }}>
            {`Export your full training history from ${isTrainer ? 'Settings' : 'Profile'}, Export my data, before you delete.`}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Eyebrow>{`TYPE ${PHRASE} TO CONFIRM`}</Eyebrow>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={PHRASE}
            placeholderTextColor={p.dim}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={`Type ${PHRASE} to confirm`}
            accessibilityHint={`The delete button stays disabled until you type ${PHRASE}`}
            style={{
              minHeight: 50,
              paddingHorizontal: 15,
              borderRadius: 13,
              fontSize: 16,
              fontWeight: '800',
              letterSpacing: 1.2,
              color: armed ? p.danger : p.text,
              backgroundColor: p.surface,
              borderWidth: 1.5,
              borderColor: armed ? p.danger : p.border,
            }}
          />
        </View>

        <View style={{ gap: 12, marginTop: 4 }}>
          <PrimaryButton
            title="Delete my account"
            tint={p.danger}
            foreground="#FFFFFF"
            enabled={armed}
            onPress={confirmDelete}
          />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Keep my account"
            accessibilityHint="Goes back without deleting anything"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>Keep my account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
