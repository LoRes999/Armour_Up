import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { routeParam } from '../../src/routeParams';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { Card, EmptyState, Eyebrow } from '../../src/components/ui';
import { movementInfo } from '../../src/movementLibrary';
import { photoSource } from '../../src/photoStorage';

/**
 * One movement, opened from anywhere its name appears — the library, a
 * client's plan, a past session. The trainer's own movements show whatever
 * photos they attached; the built-in catalogue is written copy alone.
 */
export default function MovementDetail() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { name: rawName } = useLocalSearchParams<{ name?: string | string[] }>();
  const name = routeParam(rawName);

  const builtIn = movementInfo(name ?? '');
  const custom = store.customMovement(name ?? '');
  const isTrainer = store.role === 'trainer';

  if (!builtIn && !custom) {
    return (
      <>
        {/* headerRight is cleared explicitly: options merge, so the Edit button
            from before the movement was deleted would otherwise stay, still
            pointing at the deleted movement. */}
        <Stack.Screen options={{ title: name ?? 'Movement', headerRight: () => null }} />
        <EmptyState
          icon="barbell-outline"
          title="Nothing written yet"
          message="This movement has no reference entry."
        />
      </>
    );
  }

  const description = custom?.description ?? builtIn?.description ?? '';
  const cues = custom?.cues.length ? custom.cues : builtIn?.cues ?? [];
  const muscles = custom?.muscles.length ? custom.muscles : builtIn?.muscles ?? [];
  const photos = custom?.photoUris ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: custom?.name ?? builtIn?.name ?? 'Movement',
          headerRight: () =>
            isTrainer && custom ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/movement/new', params: { edit: custom.id } })
                }
                hitSlop={8}
                accessibilityRole="button"
                style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16, color: p.accent }}>Edit</Text>
              </Pressable>
            ) : null,
        }}
      />

      <ScrollView
        style={{ backgroundColor: p.background }}
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 40, gap: 14 }}
      >
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
            {photos.map((uri, index) => (
              <Image
                key={`${uri}-${index}`}
                source={{ uri: photoSource(uri) }}
                style={{
                  width: 240,
                  height: 170,
                  borderRadius: metrics.cardRadius,
                  backgroundColor: p.surfaceAlt,
                }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : custom ? (
          // Only the trainer's own movements offer photos, so only they get
          // the empty slot inviting one. A built-in is written copy alone.
          <Card
            radius={20}
            style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 34, gap: 9 }}
          >
            <Ionicons name="image-outline" size={26} color={p.dim} />
            <Text style={{ fontSize: 12, color: p.dim }}>No photos added</Text>
          </Card>
        ) : null}

        {custom ? (
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: p.accentSoft,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: p.accent }}>
              YOUR COACH'S MOVEMENT
            </Text>
          </View>
        ) : null}

        {muscles.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {muscles.map((muscle, index) => (
              <View
                key={`${muscle}-${index}`}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: p.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: p.dim }}>{muscle}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {description ? (
          <Text style={{ fontSize: 14, lineHeight: 21, color: p.text }}>{description}</Text>
        ) : null}

        {cues.length ? (
          <View style={{ gap: 9, marginTop: 2 }}>
            <Eyebrow>COACHING CUES</Eyebrow>
            {cues.map((cue, index) => (
              <View key={`${cue}-${index}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: p.accent,
                    marginTop: 7,
                  }}
                />
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: p.text }}>{cue}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
