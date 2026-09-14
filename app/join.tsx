import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { type InvitePreview, useAuth } from '../src/auth';
import { MIN_PASSWORD_LENGTH } from '../src/authErrors';
import { AuthField, FormError } from '../src/components/AuthField';

/**
 * How a client gets into the app. The code decides whose programme they see.
 *
 * Without accounts, the code is matched against the roster on this phone and
 * is the client's whole identity. With accounts, the server says whose
 * invitation it is, and a second step creates the account that keeps their
 * training safe on any phone (the approved "Last step" design).
 */
export default function Join() {
  const p = usePalette();
  const router = useRouter();
  const close = useClose();
  const store = useStore();
  const auth = useAuth();
  const cloud = auth.status !== 'off';

  const [code, setCode] = useState('');
  // Null until they actually touch the picker. Derived rather than synced, so
  // it can show the unit the trainer chose for them without an effect — and so
  // accepting an invite no longer silently overwrites that choice with kg.
  const [unitChoice, setUnitChoice] = useState<WeightUnit | null>(null);

  const [preview, setPreview] = useState<{ code: string; invite: InvitePreview } | null>(null);
  const [lookup, setLookup] = useState<{ code: string; error: string } | null>(null);
  const [step, setStep] = useState<'invitation' | 'account'>('invitation');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = normaliseCode(code);
  const localMatch = cloud ? undefined : store.clientByCode(clean);
  const remote = cloud && preview?.code === clean ? preview.invite : null;

  // With accounts, a whole code is looked up on the server.
  useEffect(() => {
    if (!cloud || clean.length !== CODE_LENGTH) return;
    let current = true;
    auth
      .previewInvite(clean)
      .then((invite) => {
        if (!current) return;
        setPreview({ code: clean, invite });
        setLookup(null);
        setEmail((typed) => typed || invite.email);
        Keyboard.dismiss();
      })
      .catch((failure: Error) => {
        if (current) setLookup({ code: clean, error: failure.message });
      });
    return () => {
      current = false;
    };
    // The lookup belongs to the code; the auth object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, clean]);

  const invitation = cloud
    ? remote && { coachName: remote.trainerName, clientName: remote.clientName, unit: remote.unit }
    : localMatch && { coachName: TRAINER_NAME, clientName: localMatch.name, unit: localMatch.unit };
  const unit = unitChoice ?? invitation?.unit ?? DEFAULT_UNIT;
  const coachFirst = invitation ? invitation.coachName.split(' ')[0] : '';
  const clientFirst = invitation ? invitation.clientName.split(' ')[0] : '';

  // Only complain once they have typed a whole code — nagging halfway through
  // someone's first six characters is just noise. Counted on what they typed,
  // not on what survived normalising: an O where a Q belongs is stripped, which
  // used to leave a full-looking field with no match and no error at all.
  const lookupError = cloud && lookup?.code === clean ? lookup.error : null;
  const wrong = cloud ? lookupError !== null : code.trim().length >= CODE_LENGTH && !localMatch;

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

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      // Back to the root gate, which opens the client app once their
      // programme is on the phone.
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!invitation) return;
    if (!cloud) {
      if (localMatch && unitChoice && unitChoice !== localMatch.unit) store.setClientUnit(localMatch.id, unitChoice);
      store.redeemInviteCode(clean);
      close();
      return;
    }
    // An account whose earlier setup stopped short only needs linking.
    if (auth.status === 'signedIn') {
      void run(() => auth.redeemInvite(clean, unitChoice ?? undefined));
      return;
    }
    setError(null);
    setStep('account');
  };

  const canCreate = email.includes('@') && password.length >= MIN_PASSWORD_LENGTH && !busy;
  const createAndJoin = () => {
    if (!canCreate) return;
    void run(() => auth.joinWithCode({ code: clean, email, password, unit: unitChoice ?? undefined }));
  };

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: '',
        headerLeft: () =>
          step === 'account' ? (
            <Pressable onPress={() => setStep('invitation')} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: p.accent, fontSize: 16 }}>Back</Text>
            </Pressable>
          ) : (
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: p.accent, fontSize: 16 }}>Close</Text>
            </Pressable>
          ),
      }}
    />
  );

  if (step === 'account' && invitation) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
        {header}
        <ScrollView
          {...keyboardAware}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 16 }}
        >
          <Eyebrow color={p.accent}>LAST STEP</Eyebrow>
          <Title size={28}>{`Keep your training safe, ${clientFirst}.`}</Title>
          <Text style={{ fontSize: 14, color: p.dim, lineHeight: 20, marginTop: -6 }}>
            {`Your sessions and records stay with you on any phone. Use the email ${coachFirst} invited, or any email you like.`}
          </Text>
          <AuthField label="Email" value={email} onChangeText={setEmail} kind="email" />
          <AuthField
            label="Password"
            value={password}
            onChangeText={setPassword}
            kind="newPassword"
            placeholder="Choose a password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            onSubmitEditing={createAndJoin}
          />
          <FormError message={error} />
          <View style={{ flex: 1 }} />
          <PrimaryButton
            title={busy ? 'Joining…' : 'Create account and join'}
            onPress={createAndJoin}
            enabled={canCreate}
          />
          <Pressable
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.dim }}>
              Already joined on another phone? Sign in
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      {header}

      <ScrollView
        {...keyboardAware}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 18 }}
      >
        <Title size={30}>Enter your invite code.</Title>
        <Text style={{ fontSize: 14, color: p.dim, lineHeight: 20, marginTop: -8 }}>
          {cloud
            ? 'Your coach sends you a six-character code.'
            : 'Your coach sends you a six-character code. It never expires, so keep it if you change phones.'}
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
              borderColor: wrong ? p.danger : invitation ? p.accent : 'transparent',
              color: p.text,
              fontSize: 28,
              fontWeight: '800',
              letterSpacing: 8,
              textAlign: 'center',
            }}
          />
          {wrong ? (
            <Text style={{ fontSize: 12, color: p.danger, textAlign: 'center' }}>
              {lookupError ?? "We don't recognise that code. Check it with your coach."}
            </Text>
          ) : null}
        </View>

        {/* Without this, signing out of the trainer app strands a reviewer: the
            client's only door is a code they have no way of knowing. Sample
            data lives on the phone only, so with accounts there is none. */}
        {__DEV__ && !cloud && !invitation ? (
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

        {invitation ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <Avatar
                initials={initialsOf(invitation.coachName)}
                size={52}
                tint={p.onAccent}
                background={p.accent}
              />
              <View>
                <Eyebrow color={p.accent}>INVITATION</Eyebrow>
                <Text
                  style={{ fontSize: 19, fontWeight: '800', letterSpacing: -0.5, color: p.text }}
                >
                  {invitation.coachName}
                </Text>
                <Text style={{ fontSize: 12, color: p.dim }}>Strength coach</Text>
              </View>
            </View>

            <Title size={26}>{`${coachFirst} wants to coach you, ${clientFirst}.`}</Title>

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
                  detail: `${coachFirst} logs your sets as you lift. You keep the full history.`,
                },
                {
                  icon: 'shield-checkmark-outline' as const,
                  title: 'Yours to leave with',
                  detail: 'Export or delete your data at any time from your Profile.',
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

            {remote?.alreadyJoined ? (
              <View style={{ gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: p.dim, lineHeight: 19, textAlign: 'center' }}>
                  This invitation has already been used. If it's yours, sign in instead.
                </Text>
                <PrimaryButton title="Sign in" onPress={() => router.push('/sign-in')} />
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 4 }}>
                <FormError message={error} />
                <PrimaryButton
                  title={busy ? 'Joining…' : 'Accept invitation'}
                  onPress={accept}
                  enabled={!busy}
                />
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
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
