import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, metrics, usePalette } from '../theme';
import { dismissKeyboard, keyboardUp } from '../keyboard';
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  WeightUnit,
  formatWeight,
  parseWeightInput,
  toCanonical,
  toDisplay,
  unitIncrement,
} from '../models';

// MARK: - Text

export function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  const p = usePalette();
  return (
    <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: color ?? p.dim }}>
      {children}
    </Text>
  );
}

export function Title({ children, size = 32 }: { children: React.ReactNode; size?: number }) {
  const p = usePalette();
  return (
    <Text style={{ fontSize: size, fontWeight: '800', letterSpacing: -size * 0.032, color: p.text }}>
      {children}
    </Text>
  );
}

/** Figures line up column to column; weights are read as a column. */
export function Numeric({
  children,
  size = 15,
  color,
  style,
  fit = false,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  /** Stay on one line, shrinking the text rather than wrapping it. */
  fit?: boolean;
}) {
  const p = usePalette();
  return (
    <Text
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.6 : undefined}
      style={[
        {
          fontSize: size,
          fontWeight: '800',
          letterSpacing: -size * 0.03,
          color: color ?? p.text,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// MARK: - Containers

export function Card({
  children,
  style,
  radius = metrics.cardRadius,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const p = usePalette();
  return (
    <View
      style={[
        { backgroundColor: p.surface, borderRadius: radius, borderWidth: 1, borderColor: p.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[{ flex: 1, backgroundColor: p.background }, style]}>{children}</View>;
}

// MARK: - Controls

export function SegmentedPicker<T extends string>({
  options,
  labels,
  value,
  onChange,
  height = 36,
}: {
  options: readonly T[];
  labels?: Record<string, string>;
  value: T;
  onChange: (next: T) => void;
  height?: number;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: p.surfaceAlt, borderRadius: metrics.controlRadius }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels?.[option] ?? option}
            style={{
              flex: 1,
              minHeight: height,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? p.accent : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: active ? p.onAccent : p.dim }}>
              {labels?.[option] ?? option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  title,
  icon,
  onPress,
  tint,
  foreground,
  enabled = true,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint?: string;
  foreground?: string;
  enabled?: boolean;
}) {
  const p = usePalette();
  const background = enabled ? tint ?? p.accent : p.surfaceAlt;
  const color = enabled ? foreground ?? p.onAccent : p.dim;
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !enabled }}
      style={{
        // minHeight, not height: identical at the default text size, and the
        // difference between growing and clipping at the large ones.
        minHeight: 52,
        paddingVertical: 8,
        borderRadius: metrics.buttonRadius,
        backgroundColor: background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        opacity: enabled ? 1 : 0.9,
      }}
    >
      {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <Text style={{ fontSize: 16, fontWeight: '800', color }}>{title}</Text>
    </Pressable>
  );
}

export function Avatar({
  initials,
  size = 42,
  tint,
  background,
}: {
  initials: string;
  size?: number;
  tint?: string;
  background?: string;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background ?? p.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.31, fontWeight: '800', color: tint ?? p.accent }}>
        {initials}
      </Text>
    </View>
  );
}

/** The small capsule label behind PR DAY, SOLO, LIVE and the roster badges. */
export function Pill({
  label,
  tint,
  background,
}: {
  label: string;
  tint?: string;
  background?: string;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: background ?? p.surfaceAlt,
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: tint ?? p.dim }}>
        {label}
      </Text>
    </View>
  );
}

export function StatTile({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <Card radius={14} style={{ flex: 1, paddingHorizontal: 11, paddingVertical: 9 }}>
      <Eyebrow>{label}</Eyebrow>
      <Numeric size={18} color={tint} style={{ marginTop: 2 }}>
        {value}
      </Numeric>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  const p = usePalette();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
      <Ionicons name={icon} size={30} color={p.dim} />
      <Text style={{ fontSize: 17, fontWeight: '700', color: p.text }}>{title}</Text>
      <Text style={{ fontSize: 13, color: p.dim, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

export function DashedButton({
  title,
  onPress,
  color,
  height = metrics.hitTarget,
  icon = 'add',
}: {
  title: string;
  onPress: () => void;
  color?: string;
  height?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        minHeight: height,
        paddingVertical: 6,
        borderRadius: metrics.controlRadius,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: p.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Ionicons name={icon} size={15} color={color ?? p.accent} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: color ?? p.accent }}>{title}</Text>
    </Pressable>
  );
}

/**
 * Spread onto any ScrollView that holds a text field.
 *
 * Without these, on a phone: the first tap after typing only dismisses the
 * keyboard (so every button needed two taps), the keyboard sat on top of
 * whatever was below the field, and the return key was the only way to put it
 * away. Swiping down now hides it — interactively on iOS, on drag on Android —
 * and on iOS the content moves up above the keyboard.
 */
export const keyboardAware = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  automaticallyAdjustKeyboardInsets: true,
} as const;

// MARK: - Steppers
//
// Minus and plus for quick nudges; tapping the number opens a keypad for a big
// jump. Both hit areas clear 44pt even when the glyph is small.

/**
 * `value` and `onChange` are in canonical kilograms; everything the user sees
 * and touches is in `unit`. Doing the conversion here rather than at each call
 * site is what keeps the four screens that log weights honest.
 */
export function WeightStepper({
  unit,
  value,
  onChange,
  large = false,
}: {
  unit: WeightUnit;
  value: number;
  onChange: (next: number) => void;
  large?: boolean;
}) {
  const p = usePalette();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = toDisplay(value, unit);
  const emit = (next: number) =>
    onChange(Math.min(MAX_WEIGHT_KG, toCanonical(Math.max(0, next), unit)));
  // Centring the row would centre the numeral *and* its unit as one group,
  // leaving the digits sitting left of true centre by half of 'kg'. Padding
  // the container by the unit's width shifts the content centre right by half
  // that amount, which lands the numeral dead centre between the two buttons.
  const [unitWidth, setUnitWidth] = useState(0);
  const step = unitIncrement(unit);

  const open = () => {
    setDraft(formatWeight(shown));
    setEditing(true);
  };

  const commit = () => {
    // An emptied box means "never mind", not zero. Number('') is 0, so clearing
    // the field and pressing Set used to write a 0 kg set.
    // Anything but a plain weight within the limit is refused the same way.
    const parsed = parseWeightInput(draft, unit);
    if (parsed !== undefined) emit(parsed);
    setEditing(false);
  };

  const button = (
    name: 'remove' | 'add',
    filled: boolean,
    onPress: () => void,
    label: string
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: large ? 54 : metrics.hitTarget,
        height: large ? 54 : metrics.hitTarget,
        borderRadius: large ? 27 : 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? p.accent : large ? p.surfaceAlt : 'transparent',
      }}
    >
      <Ionicons
        name={name}
        size={large ? 22 : 17}
        color={filled ? p.onAccent : large ? p.text : p.accent}
      />
    </Pressable>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: large ? 12 : 0 }}>
        {button('remove', false, () => emit(shown - step), 'Decrease weight')}
        <Pressable
          onPress={open}
          style={{
            flex: 1,
            // A minimum rather than a fixed height: text that did not fit used
            // to wrap inside a 44pt box and have its second line cut off.
            minHeight: large ? undefined : metrics.hitTarget,
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: unitWidth + 4,
          }}
        >
          {/* Baseline alignment belongs to the numeral and its unit alone —
              applying it to the fixed-height row would pin them to the top
              instead of centring them against the two buttons. */}
          {/* "102.5 kg" wrapped onto two lines in the builder's narrow weight
              column on small phones. The numeral now shrinks to fit instead,
              and the unit never shrinks or wraps. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '100%' }}>
            <Numeric
              fit
              size={large ? 58 : 16}
              color={large ? p.text : p.accent}
              style={{ flexShrink: 1 }}
            >
              {formatWeight(shown)}
            </Numeric>
            <Text
              numberOfLines={1}
              onLayout={(event) => setUnitWidth(event.nativeEvent.layout.width)}
              style={{
                fontSize: large ? 15 : 10,
                fontWeight: '700',
                color: large ? p.dim : p.accent,
              }}
            >
              {unit}
            </Text>
          </View>
        </Pressable>
        {button('add', large, () => emit(shown + step), 'Increase weight')}
      </View>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        {/* The iOS decimal pad has no return key, so Set is the only way to
            commit — it has to sit above the keyboard, not under it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <Pressable
          onPress={() => (keyboardUp() ? dismissKeyboard() : setEditing(false))}
          style={{ flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 32 }}
        >
          <Pressable style={{ width: '100%' }} onPress={() => {}}>
            <Card style={{ padding: 18, gap: 12 }}>
              <Eyebrow>SET WEIGHT ({unit.toUpperCase()})</Eyebrow>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                onSubmitEditing={commit}
                style={{
                  fontSize: 28,
                  fontWeight: '800',
                  color: p.text,
                  backgroundColor: p.surfaceAlt,
                  borderRadius: metrics.controlRadius,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setEditing(false)}
                  style={{ flex: 1, minHeight: 46, borderRadius: metrics.controlRadius, backgroundColor: p.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontWeight: '700', color: p.dim }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={commit}
                  style={{ flex: 1, minHeight: 46, borderRadius: metrics.controlRadius, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontWeight: '800', color: p.onAccent }}>Set</Text>
                </Pressable>
              </View>
            </Card>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const stepperButton = {
  width: 28,
  height: metrics.hitTarget,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

// hitSlop is ignored on the web, where these were 28px targets. A full-width
// target pulled in by negative margins takes the same 28px of layout.
const webStepperButton =
  Platform.OS === 'web' ? { width: metrics.hitTarget, marginHorizontal: -8 } : undefined;

export function RepStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {/* 28pt wide is under the 44pt minimum, and these two sit side by side —
          hitSlop widens the target without moving anything on screen. */}
      <Pressable
        onPress={() => onChange(Math.max(1, value - 1))}
        hitSlop={{ left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="One rep fewer"
        style={[stepperButton, webStepperButton]}
      >
        <Ionicons name="remove" size={15} color={p.dim} />
      </Pressable>
      <Pressable
        onPress={() => onChange(Math.min(MAX_REPS, value + 1))}
        hitSlop={{ left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="One rep more"
        style={[stepperButton, webStepperButton]}
      >
        <Ionicons name="add" size={15} color={p.accent} />
      </Pressable>
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  screenPad: { paddingHorizontal: metrics.screenPadding },
});

export type { Palette };
