import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { MIN_PASSWORD_LENGTH } from '../src/authErrors';
import { AuthField, FormError } from '../src/components/AuthField';
import { PrimaryButton, Title, keyboardAware } from '../src/components/ui';
import { metrics, usePalette } from '../src/theme';
import { useClose } from '../src/useClose';

/**
 * A coach's account. The plan comes next, on the paywall; the roster after.
 *
 * If the account was created but the coaching profile didn't finish (the
 * connection dropped between the two), this screen only asks for the name
 * again and completes the setup — the email is already taken by the account
 * that half-exists.
 */
export default function CreateAccount() {
  const p = usePalette();
  const auth = useAuth();
  const close = useClose();
  // Decided once, when the screen opens. Recomputed every render, a normal
  // sign-up flipped into "setup didn't finish" for the moment between the
  // account existing and the coaching profile being ready.
  const [finishing] = useState(() => auth.status === 'signedIn' && !auth.claims.role);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    name.trim().length > 0 &&
    (finishing || (email.includes('@') && password.length >= MIN_PASSWORD_LENGTH)) &&
    !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (finishing) await auth.finishTrainerSetup(name.trim());
      else await auth.signUpAsTrainer(name.trim(), email, password);
      // The root gate shows the plans next.
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <ScrollView
          {...keyboardAware}
          contentContainerStyle={{ flexGrow: 1, padding: metrics.screenPadding, gap: 16 }}
        >
          <Title size={28}>{finishing ? 'Finish setting up.' : 'Set up your coaching account.'}</Title>
          {finishing ? (
            <Text style={{ fontSize: 14, color: p.dim, lineHeight: 20 }}>
              Your account was created, but setup didn't finish. Add your name to carry on.
            </Text>
          ) : null}

          <AuthField label="Your name" value={name} onChangeText={setName} kind="name" autoFocus />
          {finishing ? null : (
            <>
              <AuthField label="Email" value={email} onChangeText={setEmail} kind="email" />
              <AuthField
                label="Password"
                value={password}
                onChangeText={setPassword}
                kind="newPassword"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                onSubmitEditing={submit}
              />
            </>
          )}
          <FormError message={error} />

          <View style={{ flex: 1 }} />

          <PrimaryButton
            title={busy ? 'Creating your account…' : finishing ? 'Finish setup' : 'Create account'}
            onPress={submit}
            enabled={ready}
          />
          <Text style={{ fontSize: 12, fontWeight: '700', color: p.dim, textAlign: 'center' }}>
            Next: choose your plan
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
