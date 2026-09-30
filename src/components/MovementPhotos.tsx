import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, type ImageStyle, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CustomMovement } from '../models';
import { movementPhotoUrl } from '../photoCloud';
import { photoSource } from '../photoStorage';
import { useStore } from '../store';
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

  const frame = { ...SIZE, borderRadius: metrics.cardRadius };

  if (local.length > 0) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {local.map((uri, index) => (
          <Image
            key={`${uri}-${index}`}
            source={{ uri: photoSource(uri) }}
            style={[frame, { backgroundColor: p.surfaceAlt }]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    );
  }

  if (names.length > 0 && trainerId !== null) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {names.map((name) => (
          <CloudPhoto key={name} trainerId={trainerId} movementId={movement.id} name={name} style={frame} />
        ))}
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

/**
 * One photo from Cloud Storage: a spinner while it is fetched, and "Photo
 * didn't load" if it could not be. A failure is tried again when the
 * connection comes back — it used to stay failed until the screen was left.
 */
export function CloudPhoto({
  trainerId,
  movementId,
  name,
  style,
}: {
  trainerId: string;
  movementId: string;
  name: string;
  style: ImageStyle;
}) {
  const p = usePalette();
  const online = useStore().syncStatus.online;
  // undefined while being fetched, null once it could not be.
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (online && url === null) setAttempt((count) => count + 1);
    // Only the connection coming back is a reason to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    void movementPhotoUrl(trainerId, movementId, name).then((found) => {
      if (alive) setUrl(found);
    });
    return () => {
      alive = false;
    };
  }, [trainerId, movementId, name, attempt]);

  if (url) {
    return <Image source={{ uri: url }} style={[style, { backgroundColor: p.surfaceAlt }]} resizeMode="cover" />;
  }
  return (
    <View
      style={[style, { backgroundColor: p.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}
      accessible
      accessibilityLabel={url === null ? "Photo didn't load" : 'Loading photo'}
    >
      {url === null ? (
        <>
          <Ionicons name="cloud-offline-outline" size={22} color={p.dim} />
          <Text style={{ fontSize: 11, color: p.dim, marginTop: 6, textAlign: 'center' }}>Photo didn&apos;t load</Text>
        </>
      ) : (
        <ActivityIndicator color={p.dim} />
      )}
    </View>
  );
}
