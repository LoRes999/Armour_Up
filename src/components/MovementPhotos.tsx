import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CustomMovement } from '../models';
import { movementPhotoUrl } from '../photoCloud';
import { photoSource } from '../photoStorage';
import { useCloud } from '../sync/context';
import { metrics, usePalette } from '../theme';
import { Card } from './ui';

/**
 * A movement's photos.
 *
 * The coach who took them has the files on their phone and shows those: no
 * wait, and no network. Everyone else — their clients, and the coach's own
 * second phone — has only the names, and fetches each one from Cloud Storage.
 *
 * Asking for the URL each time is deliberate; see photoCloud.ts.
 */

const SIZE = { width: 240, height: 170 };

export function MovementPhotos({ movement }: { movement: CustomMovement }) {
  const p = usePalette();
  const session = useCloud();
  const trainerId = session?.scope?.trainerId ?? null;

  const local = movement.photoUris;
  const names = movement.photos ?? [];
  const fetchRemote = local.length === 0 && names.length > 0 && trainerId !== null;

  // undefined while being fetched, null once it could not be.
  const [remote, setRemote] = useState<(string | null | undefined)[]>([]);

  useEffect(() => {
    if (!fetchRemote || !trainerId) return undefined;
    let alive = true;
    setRemote(names.map(() => undefined));
    void Promise.all(names.map((name) => movementPhotoUrl(trainerId, movement.id, name))).then(
      (urls) => {
        if (alive) setRemote(urls);
      }
    );
    return () => {
      alive = false;
    };
    // The names are the identity of the set; joining them keeps this from
    // re-running on every render of a new array with the same contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRemote, trainerId, movement.id, names.join('|')]);

  const frame = {
    ...SIZE,
    borderRadius: metrics.cardRadius,
    backgroundColor: p.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (local.length > 0) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {local.map((uri, index) => (
          <Image key={`${uri}-${index}`} source={{ uri: photoSource(uri) }} style={frame} resizeMode="cover" />
        ))}
      </ScrollView>
    );
  }

  if (fetchRemote) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {remote.map((url, index) =>
          url ? (
            <Image key={names[index]} source={{ uri: url }} style={frame} resizeMode="cover" />
          ) : (
            <View key={names[index]} style={frame} accessible accessibilityLabel={url === null ? "Photo didn't load" : 'Loading photo'}>
              {url === null ? (
                <>
                  <Ionicons name="cloud-offline-outline" size={22} color={p.dim} />
                  <Text style={{ fontSize: 11, color: p.dim, marginTop: 6 }}>Photo didn&apos;t load</Text>
                </>
              ) : (
                <ActivityIndicator color={p.dim} />
              )}
            </View>
          )
        )}
      </ScrollView>
    );
  }

  // Only the coach's own movements offer photos, so only they get the empty
  // slot inviting one. A built-in is written copy alone.
  return (
    <Card radius={20} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 34, gap: 9 }}>
      <Ionicons name="image-outline" size={26} color={p.dim} />
      <Text style={{ fontSize: 12, color: p.dim }}>No photos added</Text>
    </Card>
  );
}
