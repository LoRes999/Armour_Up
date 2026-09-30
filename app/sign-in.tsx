import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import { AuthField, FormError } from '../src/components/AuthField';
import { PrimaryButton, Title, keyboardAware } from '../src/components/ui';
import { notify } from '../src/confirm';
import { metrics, usePalette } from '../src/theme';
import { useClose } from '../src/useClose';

/**
 * One sign-in for both sides. The account's role decides which app opens, so
 * nobody has to say which they are.
 */
export default function SignIn() {
  const p = usePalette();
  const router = useRouter();
  const auth = useAuth();
  const close = useClose();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.includes('@') && password.length > 0 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email, password);
      // Back to the root gate, which opens whichever side this account is —
      // past anything underneath. Reached from the Join screen, closing just
      // this one landed back on Join's "Last step" form.
      if (router.canDismiss()) router.dismissAll();
      else close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Uses the email already typed, rather than a screen of its own.
  const forgot = async () => {
    if (!email.includes('@')) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setError(null);
    try {
      await auth.resetPassword(email);
      notify({
        title: 'Check your email',
        message: `We've sent a link to reset your password to ${email.trim()}.`,
      });
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <ScrollView
          {...keyboardAware}
          contentContainerStyle={{ flexGrow: 1, padding: metrics.screenPadding, gap: 16 }}
        >
          <Title size={28}>Welcome back.</Title>
          <AuthField label="Email" value={email} onChangeText={setEmail} kind="email" autoFocus />
          <AuthField
            label="Password"
            value={password}
            onChangeText={setPassword}
            kind="password"
            onSubmitEditing={submit}
          />
          <Pressable
            onPress={forgot}
            accessibilityRole="button"
            style={{ alignSelf: 'flex-end', minHeight: metrics.hitTarget, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.accent }}>Forgot password?</Text>
          </Pressable>
          <FormError message={error} />

          <View style={{ flex: 1 }} />

          <PrimaryButton title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} enabled={ready} />
          <Text style={{ fontSize: 12, color: p.dim, textAlign: 'center', lineHeight: 17 }}>
            Coaches and clients both sign in here. The app opens your side automatically.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
