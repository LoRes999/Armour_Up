import React from 'react';
import { Pressable, type StyleProp, Text, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme';

/**
 * Every movement name in the app opens that movement's description (Ryan,
 * 2026-09-30). It used to be five screens each pasting their own push, and
 * the rest — Progress, the coach's PRs, the builder, "Up next" — opening
 * nothing at all.
 */

type Router = ReturnType<typeof useRouter>;

export function openMovement(router: Router, name: string) {
  router.push({ pathname: '/movement/[name]', params: { name } });
}

/**
 * A movement's name with the ⓘ that says it opens, as its own button. Where
 * the name sits inside something that does another thing on a tap — a card
 * that expands, a row that adds it — this is the part that opens it.
 */
export function MovementName({
  name,
  textStyle,
  iconSize = 13,
  numberOfLines,
  style,
}: {
  name: string;
  textStyle?: StyleProp<TextStyle>;
  iconSize?: number;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => openMovement(router, name)}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint="Opens how this movement is done"
      hitSlop={6}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 5 }, style]}
    >
      <Text
        style={[{ fontSize: 14, fontWeight: '700', color: p.text, flexShrink: 1 }, textStyle]}
        numberOfLines={numberOfLines}
      >
        {name}
      </Text>
      <Ionicons name="information-circle-outline" size={iconSize} color={p.dim} />
    </Pressable>
  );
}
