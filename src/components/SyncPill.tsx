import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { plural } from '../models';
import { useStore } from '../store';
import type { SyncStatus } from '../sync/types';
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

export interface Pill {
  /** `waiting` is a passing state; `refused` is a change that is gone. */
  tone: 'waiting' | 'refused';
  label: string;
}

/**
 * What the pill should say, or null to stay quiet. Split out from the view so
 * the rules about staying quiet can be read and tested on their own.
 */
export function pillFor(status: SyncStatus, cloudActive: boolean, slow: boolean): Pill | null {
  if (!cloudActive) return null;
  const { online, pending, rejected } = status;

  // A refusal outranks everything else here. The other states are all "this
  // will sort itself out in a moment"; this one means the server turned a
  // change away and it was dropped, so the only copy left is the one on
  // screen. It is not hidden behind the slow-upload timer, and it does not
  // clear when the queue empties. (Ryan, 2026-09-20: a warning, not a dialog.)
  if (rejected > 0) return { tone: 'refused', label: `${plural(rejected, 'change')} couldn't be saved` };

  if (online && (pending === 0 || !slow)) return null;
  const waiting = `${plural(pending, 'change')} waiting`;
  if (!online) return { tone: 'waiting', label: pending > 0 ? `Offline · ${waiting}` : 'Offline' };
  return { tone: 'waiting', label: `Saving · ${waiting}` };
}

export function SyncPill() {
  const p = usePalette();
  const { cloudActive, syncStatus } = useStore();
  const uploading = cloudActive && syncStatus.online && syncStatus.pending > 0;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!uploading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_UPLOAD_MS);
    return () => clearTimeout(timer);
  }, [uploading]);

  const pill = pillFor(syncStatus, cloudActive, slow);
  if (!pill) return null;

  const refused = pill.tone === 'refused';
  return (
    <View
      accessible
      accessibilityLabel={pill.label}
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
        borderColor: refused ? p.danger : p.border,
      }}
    >
      <View
        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: refused ? p.danger : p.accent }}
      />
      <Text style={{ fontSize: 11, fontWeight: '700', color: refused ? p.danger : p.text }}>
        {pill.label}
      </Text>
    </View>
  );
}
