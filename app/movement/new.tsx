import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { DashedButton, Eyebrow, PrimaryButton, keyboardAware } from '../../src/components/ui';
import { confirm, notify } from '../../src/confirm';

/**
 * The trainer writes a movement of their own. Whatever they save here is
 * immediately programmable in the builder and readable by their clients.
 */
export default function CustomMovementForm() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const existing = edit ? store.customMovements.find((m) => m.id === edit) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  // One cue per line keeps the form to a single field.
  const [cueText, setCueText] = useState((existing?.cues ?? []).join('\n'));
  const [muscleText, setMuscleText] = useState((existing?.muscles ?? []).join(', '));
  const [photoUris, setPhotoUris] = useState<string[]>(existing?.photoUris ?? []);

  const trimmed = name.trim();
  /**
   * A name that already exists used to be accepted and then silently swallowed:
   * the library de-duplicates case-insensitively, so the movement was saved,
   * absent from every list, and quietly overrode the built-in entry's text.
   * Better to refuse it while they can still change it.
   */
  const nameTaken =
    trimmed.length > 0 &&
    trimmed.toLowerCase() !== existing?.name.toLowerCase() &&
    store.allMovements().some((m) => m.toLowerCase() === trimmed.toLowerCase());
  const cues = cueText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const muscles = muscleText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  /**
   * The only place in the app where a native module can throw. Unwrapped, a
   * picker that fails — no photo library on the device, permission revoked
   * mid-flow, an OEM gallery that returns nothing — took the whole screen down
   * along with the half-written movement.
   */
  const addPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notify({
          title: 'Photo access needed',
          message: 'Allow photo access in Settings to attach pictures to a movement.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: 4,
      });
      if (result.canceled) return;
      setPhotoUris((current) => [...current, ...result.assets.map((asset) => asset.uri)]);
    } catch {
      notify({
        title: 'Could not open your photos',
        message: 'Something went wrong reaching the photo library. Everything else you have typed is still here.',
      });
    }
  };

  const save = () => {
    if (!trimmed || nameTaken) return;
    if (existing) {
      store.updateCustomMovement(existing.id, {
        name: trimmed,
        description: description.trim(),
        cues,
        muscles,
        photoUris,
      });
    } else {
      store.addCustomMovement({
        name: trimmed,
        description: description.trim(),
        cues,
        muscles,
        photoUris,
      });
    }
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) return;
    confirm({
      title: 'Delete movement?',
      message: `${existing.name} will be removed from your library.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        store.removeCustomMovement(existing.id);
        router.back();
      },
    });
  };

  const field = {
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: metrics.controlRadius,
    backgroundColor: p.surfaceAlt,
    color: p.text,
    fontSize: 15,
  } as const;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit movement' : 'New movement',
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              <Text style={{ color: p.accent, fontSize: 16 }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS moves the content with the ScrollView's own keyboard insets
        // (keyboardAware). Padding here as well pushed it up twice — and, with
        // no header offset, by the wrong amount.
        behavior={Platform.OS === 'ios' ? undefined : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 28, gap: 16 }}
          {...keyboardAware}
        >
          <View style={{ gap: 7 }}>
            <Eyebrow>MOVEMENT NAME</Eyebrow>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Landmine Press"
              placeholderTextColor={p.dim}
              style={field}
            />
            {nameTaken ? (
              <Text style={{ fontSize: 12, color: p.danger }}>
                {`There is already a movement called "${trimmed}". Pick another name.`}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 7 }}>
            <Eyebrow>DESCRIPTION</Eyebrow>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What it trains and how it's performed."
              placeholderTextColor={p.dim}
              multiline
              style={[field, { minHeight: 96, textAlignVertical: 'top' }]}
            />
          </View>

          <View style={{ gap: 7 }}>
            <Eyebrow>COACHING CUES · ONE PER LINE</Eyebrow>
            <TextInput
              value={cueText}
              onChangeText={setCueText}
              placeholder={'Elbow tight to the ribs\nPress up and across'}
              placeholderTextColor={p.dim}
              multiline
              style={[field, { minHeight: 84, textAlignVertical: 'top' }]}
            />
          </View>

          <View style={{ gap: 7 }}>
            <Eyebrow>MUSCLES · COMMA SEPARATED</Eyebrow>
            <TextInput
              value={muscleText}
              onChangeText={setMuscleText}
              placeholder="Front delt, Triceps"
              placeholderTextColor={p.dim}
              style={field}
            />
          </View>

          <View style={{ gap: 9 }}>
            <Eyebrow>PHOTOS</Eyebrow>
            {photoUris.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {/* Keyed and removed by position: the same photo can legitimately
                    be picked twice, and matching on the URI collided the keys and
                    deleted both copies at once. */}
                {photoUris.map((uri, index) => (
                  <View key={`${uri}-${index}`}>
                    <Image
                      source={{ uri }}
                      style={{
                        width: 104,
                        height: 104,
                        borderRadius: 14,
                        backgroundColor: p.surfaceAlt,
                      }}
                    />
                    <Pressable
                      onPress={() => setPhotoUris((current) => current.filter((_, i) => i !== index))}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: p.surface,
                        borderWidth: 1,
                        borderColor: p.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={14} color={p.danger} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <DashedButton title="Add photos" onPress={addPhoto} />
          </View>

          <View style={{ marginTop: 4 }}>
            <PrimaryButton
              title={existing ? 'Save movement' : 'Add to library'}
              enabled={trimmed.length > 0 && !nameTaken}
              onPress={save}
            />
          </View>

          {existing ? (
            <Pressable
              onPress={confirmDelete}
              style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: p.danger }}>
                Delete movement
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
