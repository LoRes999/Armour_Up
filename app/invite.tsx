import React, { useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../src/store';
import { metrics, usePalette } from '../src/theme';
import { Card, Eyebrow, PrimaryButton, SegmentedPicker, Title, keyboardAware } from '../src/components/ui';
import {
  Client,
  DEFAULT_UNIT,
  UNITS,
  WeightUnit,
  formatInviteCode,
  unitName,
} from '../src/models';
import { useAuth, useCoachName } from '../src/auth';
import { FormError } from '../src/components/AuthField';
import { useConfirmDiscard } from '../src/useConfirmDiscard';
import { useClose } from '../src/useClose';

export default function InviteClient() {
  const p = usePalette();
  const close = useClose('/(trainer)/clients');
  const store = useStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [unit, setUnit] = useState<WeightUnit>(DEFAULT_UNIT);
  // Once they exist, this screen's job changes from collecting details to
  // handing over the code.
  const [invited, setInvited] = useState<Client | null>(null);
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = name.trim().length > 0 && email.includes('@') && !busy;

  /**
   * With accounts, the code comes from the server: it has to be unique across
   * every coach, which no phone can check on its own. Without accounts it is
   * made here, as it always was.
   */
  const send = async () => {
    if (!canSend) return;
    if (!store.cloudActive) {
      setInvited(store.invite(name.trim(), email.trim(), unit));
      return;
    }
    if (!store.syncStatus.online) {
      setError("You're offline. Invitations need a connection so the code is unique.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setInvited(await auth.createInvite(name.trim(), email.trim(), unit));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Once the invitation exists there is nothing left to lose by closing.
  useConfirmDiscard(
    !invited && (name.trim().length > 0 || email.trim().length > 0),
    "The name and email you've typed will be lost."
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          // Nothing is sent: the coach passes the code on (Ryan's wording, 2026-09-13).
          title: invited ? 'Invitation ready' : 'Invite client',
          headerLeft: () => (
            <Pressable
              onPress={close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={{ color: p.accent, fontSize: 16 }}>{invited ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          ),
        }}
      />

      {invited ? (
        <SentPanel client={invited} onDone={close} />
      ) : (
        <ScrollView {...keyboardAware} contentContainerStyle={{ padding: metrics.screenPadding, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Eyebrow>WHO ARE YOU COACHING?</Eyebrow>
            <Card radius={15}>
              <Field label="Name" value={name} onChange={setName} placeholder="Full name" />
              <View style={{ height: 1, backgroundColor: p.border }} />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="name@example.com"
                email
              />
            </Card>
          </View>

          <View style={{ gap: 8 }}>
            <Eyebrow>THEIR UNITS</Eyebrow>
            <SegmentedPicker
              options={UNITS}
              labels={{ kg: unitName('kg'), lb: unitName('lb') }}
              value={unit}
              onChange={setUnit}
              height={40}
            />
            <Text style={{ fontSize: 11, color: p.dim }}>
              You will always see their numbers in the unit they picked.
            </Text>
          </View>

          <View style={{ padding: 15, borderRadius: 15, backgroundColor: p.surfaceAlt, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="key-outline" size={16} color={p.accent} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: p.text }}>
                They get a six-character code
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: p.dim, lineHeight: 18 }}>
              {store.cloudActive
                ? 'Send it however you like. They install the app, type the code, set a password, and land on your program — free.'
                : 'Send it however you like. They install the app, type the code, and land on your program — free, and with no account to create.'}
            </Text>
          </View>

          <FormError message={error} />
          <PrimaryButton
            title={busy ? 'Creating…' : 'Create invitation'}
            icon="paper-plane-outline"
            enabled={canSend}
            onPress={() => void send()}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** The handover. Everything here exists to get six characters to one person. */
function SentPanel({ client, onDone }: { client: Client; onDone: () => void }) {
  const p = usePalette();
  const [copied, setCopied] = useState(false);
  const coachName = useCoachName();
  const firstName = client.name.split(' ')[0];
  const message = `${firstName} — here is your invite code for training with ${coachName}: ${client.inviteCode}`;

  // React Native's own Clipboard is deprecated and slated for removal.
  const copy = () => {
    Clipboard.setStringAsync(client.inviteCode)
      .then((ok) => setCopied(ok))
      // Nothing to recover from: the code is selectable text right above.
      .catch(() => {});
  };

  const share = () => {
    // Web rejects this whenever navigator.share is missing or the page is not a
    // secure context — exactly the LAN review setup — so sharing can never be
    // the only way to get the code off this screen.
    Share.share({ message }).catch(() => {});
  };

  return (
    <ScrollView {...keyboardAware} contentContainerStyle={{ padding: metrics.screenPadding, gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 16 }}>
        <View
          style={{
            width: 52,
            minHeight: 52,
            borderRadius: 26,
            backgroundColor: p.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark" size={26} color={p.accent} />
        </View>
        <Title size={26}>{`${firstName} is on your roster.`}</Title>
        <Text style={{ fontSize: 14, color: p.dim, textAlign: 'center', lineHeight: 20 }}>
          Send them this code. They enter it once and they are in.
        </Text>
      </View>

      <Card radius={20} style={{ paddingVertical: 26, alignItems: 'center', gap: 6 }}>
        <Eyebrow>INVITE CODE</Eyebrow>
        <Text
          selectable
          style={{
            fontSize: 38,
            fontWeight: '800',
            letterSpacing: 4,
            color: p.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatInviteCode(client.inviteCode)}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: 9 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title={copied ? 'Copied' : 'Copy'}
            icon={copied ? 'checkmark' : 'copy-outline'}
            onPress={copy}
            tint={p.surfaceAlt}
            foreground={p.text}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Share" icon="share-outline" onPress={share} />
        </View>
      </View>

      <Text style={{ fontSize: 12, color: p.dim, lineHeight: 18, textAlign: 'center' }}>
        The code does not expire. You can see it again, or issue a new one, on {firstName}'s
        profile.
      </Text>

      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Back to roster"
        style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>Back to roster</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  email,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  email?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14 }}
    >
      <Text style={{ width: 56, fontSize: 13, fontWeight: '700', color: p.dim }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.dim}
        accessibilityLabel={label}
        keyboardType={email ? 'email-address' : 'default'}
        autoCapitalize={email ? 'none' : 'words'}
        style={{ flex: 1, fontSize: 15, color: p.text }}
      />
    </View>
  );
}
