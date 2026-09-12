import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { usePalette } from '../theme';

/**
 * "Offline · 3 changes waiting", under a screen's title, only while there is
 * something to say. Once everything has reached the cloud it goes away.
 *
 * Online, every edit is waiting for the 0.8 s it takes to upload, so showing
 * the pill for that would flash it after each set logged. It appears only if
 * an upload is still waiting after a few seconds.
 */

const SLOW_UPLOAD_MS = 3000;

export function SyncPill() {
  const p = usePalette();
  const { cloudActive, syncStatus } = useStore();
  const { online, pending } = syncStatus;
  const uploading = cloudActive && online && pending > 0;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!uploading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_UPLOAD_MS);
    return () => clearTimeout(timer);
  }, [uploading]);

  if (!cloudActive || (online && (pending === 0 || !slow))) return null;

  const waiting = pending === 1 ? '1 change waiting' : `${pending} changes waiting`;
  const label = online ? `Saving · ${waiting}` : pending > 0 ? `Offline · ${waiting}` : 'Offline';

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: p.surfaceAlt,
        borderWidth: 1,
        borderColor: p.border,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.accent }} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: p.text }}>{label}</Text>
    </View>
  );
}
