import React, { useState } from 'react';
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';
import { metrics, usePalette } from '../theme';
import { Eyebrow } from './ui';

/**
 * A labelled field for the account screens. A password field gets Show/Hide,
 * because typing a new password blind on a phone keyboard is how people end
 * up locked out of the account they just made.
 */
export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  kind = 'text',
  hint,
  autoFocus,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  kind?: 'text' | 'name' | 'email' | 'password' | 'newPassword';
  hint?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}) {
  const p = usePalette();
  const [shown, setShown] = useState(false);
  const secret = kind === 'password' || kind === 'newPassword';

  const behaviour: Partial<TextInputProps> =
    kind === 'email'
      ? { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', textContentType: 'emailAddress' }
      : kind === 'name'
        ? { autoCapitalize: 'words', autoComplete: 'name', textContentType: 'name' }
        : secret
          ? {
              autoCapitalize: 'none',
              autoComplete: kind === 'newPassword' ? 'new-password' : 'current-password',
              textContentType: kind === 'newPassword' ? 'newPassword' : 'password',
              secureTextEntry: !shown,
            }
          : {};

  return (
    <View style={{ gap: 6 }}>
      <Eyebrow>{label.toUpperCase()}</Eyebrow>
      <View
        style={{
          minHeight: 48,
          borderRadius: metrics.controlRadius,
          backgroundColor: p.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 13,
          paddingRight: secret ? 4 : 13,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={p.dim}
          accessibilityLabel={label}
          autoCorrect={false}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing ? 'go' : 'next'}
          style={{ flex: 1, fontSize: 15, color: p.text, paddingVertical: 12 }}
          {...behaviour}
        />
        {secret ? (
          <Pressable
            onPress={() => setShown((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            style={{ minHeight: metrics.hitTarget, minWidth: 56, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.accent }}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={{ fontSize: 11, color: p.dim }}>{hint}</Text> : null}
    </View>
  );
}

/** A plain-language error under a form, or nothing. */
export function FormError({ message }: { message: string | null }) {
  const p = usePalette();
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: p.danger, lineHeight: 18 }}>
      {message}
    </Text>
  );
}
