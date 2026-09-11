import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { metrics, tagColor, usePalette } from '../theme';
import { Card, DashedButton, Eyebrow, PrimaryButton } from './ui';
import { DAY_LABEL_MAX, DayType } from '../models';

/**
 * The trainer's own vocabulary for training days. Nothing here assumes a
 * push/pull split — a name, a label short enough for a calendar cell, and a
 * colour are all the calendar needs.
 */

/** A colour dot plus the type's name, sized for inline use. */
export function DayTypeChip({
  dayType,
  onPress,
  placeholder = 'Add day type',
}: {
  dayType?: DayType;
  onPress?: () => void;
  placeholder?: string;
}) {
  const p = usePalette();
  const color = dayType ? tagColor(p, dayType.colorIndex) : p.dim;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        alignSelf: 'flex-start',
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: dayType ? color : p.border,
        backgroundColor: p.surface,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: dayType ? p.text : p.dim }}>
        {dayType?.name ?? placeholder}
      </Text>
      {onPress ? <Ionicons name="chevron-down" size={12} color={p.dim} /> : null}
    </Pressable>
  );
}

/** Picks a day type for one workout, and can create new ones inline. */
export function DayTypeSheet({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const store = useStore();
  const [creating, setCreating] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: metrics.screenPadding,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: p.text }}>Day type</Text>
          <Pressable onPress={onClose} style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: p.accent }}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: metrics.screenPadding, paddingTop: 0, gap: 8 }}>
          {store.dayTypes.map((dayType) => {
            const active = dayType.id === selectedId;
            const color = tagColor(p, dayType.colorIndex);
            return (
              <Pressable
                key={dayType.id}
                onPress={() => onSelect(active ? undefined : dayType.id)}
              >
                <Card
                  radius={14}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 13,
                    minHeight: metrics.hitTarget + 6,
                    borderColor: active ? color : p.border,
                  }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: p.text }}>
                    {dayType.name}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: p.surfaceAlt,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: p.dim }}>
                      {dayType.shortLabel}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={17} color={color} /> : null}
                </Card>
              </Pressable>
            );
          })}

          <View style={{ marginTop: 4 }}>
            <DashedButton title="New day type" onPress={() => setCreating(true)} />
          </View>

          <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center', marginTop: 4 }}>
            The short label is what fits in a calendar cell.
          </Text>
        </ScrollView>

        <DayTypeEditor
          visible={creating}
          onClose={() => setCreating(false)}
          onSave={(name, shortLabel, colorIndex) => {
            const id = store.addDayType(name, shortLabel, colorIndex);
            onSelect(id);
            setCreating(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Create-or-edit form. Passing `initial` switches it to editing. */
export function DayTypeEditor({
  visible,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  initial?: DayType;
  onSave: (name: string, shortLabel: string, colorIndex: number) => void;
  /** Only offered when editing an existing type. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [name, setName] = useState(initial?.name ?? '');
  const [shortLabel, setShortLabel] = useState(initial?.shortLabel ?? '');
  const [colorIndex, setColorIndex] = useState(initial?.colorIndex ?? 0);

  // Reopening for a different type has to reload the drafts.
  React.useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setShortLabel(initial?.shortLabel ?? '');
    setColorIndex(initial?.colorIndex ?? 0);
  }, [visible, initial]);

  const trimmed = name.trim();
  // An unset short label falls back to the first word, upper-cased.
  const effectiveLabel = (shortLabel.trim() || trimmed.split(' ')[0] || '')
    .toUpperCase()
    .slice(0, DAY_LABEL_MAX);

  const field = {
    minHeight: 46,
    paddingHorizontal: 13,
    borderRadius: metrics.controlRadius,
    backgroundColor: p.surfaceAlt,
    color: p.text,
    fontSize: 15,
  } as const;

  // Tapping the dimmed backdrop hides the keyboard first. It used to close the
  // card outright — throwing away what had been typed — while the keyboard
  // itself covered Create, so on a phone there was no way to finish a new type.
  const tapBackdrop = () => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Lifts the card above the keyboard, and lets it scroll when it still
          does not fit; swiping down on it puts the keyboard away. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable onPress={tapBackdrop} style={{ flex: 1, backgroundColor: '#0009' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
        <Pressable onPress={() => {}}>
          <Card style={{ padding: 18, gap: 13 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: p.text }}>
              {initial ? 'Edit day type' : 'New day type'}
            </Text>

            <View style={{ gap: 6 }}>
              <Eyebrow>NAME</Eyebrow>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Chest & Triceps"
                placeholderTextColor={p.dim}
                autoFocus
                style={field}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Eyebrow>{`SHORT LABEL · ${DAY_LABEL_MAX} CHARS`}</Eyebrow>
              <TextInput
                value={shortLabel}
                onChangeText={(text) => setShortLabel(text.slice(0, DAY_LABEL_MAX))}
                placeholder={effectiveLabel || 'CHEST'}
                placeholderTextColor={p.dim}
                autoCapitalize="characters"
                style={field}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow>COLOUR</Eyebrow>
              <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap' }}>
                {p.tagColors.map((color, index) => (
                  <Pressable
                    key={color}
                    onPress={() => setColorIndex(index)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: index === colorIndex ? p.text : 'transparent',
                    }}
                  >
                    {index === colorIndex ? (
                      <Ionicons name="checkmark" size={16} color={p.onAccent} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Text style={{ fontSize: 11, color: p.dim }}>Preview</Text>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 7,
                  backgroundColor: tagColor(p, colorIndex),
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: p.onAccent }}>
                  {effectiveLabel || '—'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: metrics.buttonRadius,
                  backgroundColor: p.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: p.dim }}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={initial ? 'Save' : 'Create'}
                  enabled={trimmed.length > 0}
                  onPress={() => onSave(trimmed, effectiveLabel, colorIndex)}
                />
              </View>
            </View>

            {onDelete ? (
              <Pressable
                onPress={onDelete}
                style={{
                  minHeight: metrics.hitTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: p.danger }}>
                  Delete day type
                </Text>
              </Pressable>
            ) : null}
          </Card>
        </Pressable>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
