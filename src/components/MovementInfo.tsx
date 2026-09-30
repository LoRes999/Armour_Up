import React from 'react';
import { Text, View } from 'react-native';
import type { CustomMovement } from '../models';
import { movementInfo } from '../movementLibrary';
import { useStore } from '../store';
import { usePalette } from '../theme';
import { MovementPhotos } from './MovementPhotos';
import { Eyebrow } from './ui';

/**
 * What a movement is and how it is done: photos, muscles, description and
 * cues. The movement page is this with a header; the builder's movement
 * picker shows it in place, because a page pushed from inside that sheet
 * opened underneath it.
 */

/** The coach's own entry for this name, or the built-in one. */
export function movementEntry(name: string, custom: CustomMovement | undefined) {
  const builtIn = movementInfo(name);
  if (!builtIn && !custom) return null;
  return {
    title: custom?.name ?? builtIn?.name ?? name,
    description: custom?.description || builtIn?.description || '',
    cues: custom?.cues.length ? custom.cues : (builtIn?.cues ?? []),
    muscles: custom?.muscles.length ? custom.muscles : (builtIn?.muscles ?? []),
  };
}

export function MovementInfo({ name, custom }: { name: string; custom: CustomMovement | undefined }) {
  const p = usePalette();
  const store = useStore();
  const entry = movementEntry(name, custom);
  if (!entry) {
    return (
      <Text style={{ fontSize: 14, lineHeight: 21, color: p.dim }}>This movement has no reference entry.</Text>
    );
  }
  const { description, cues, muscles } = entry;

  return (
    <View style={{ gap: 14 }}>
      {custom ? <MovementPhotos movement={custom} /> : null}

      {/* Their coach's, to a client. A coach saw it on their own movements. */}
      {custom && store.role !== 'trainer' ? (
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
            YOUR COACH&apos;S MOVEMENT
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

      {description ? <Text style={{ fontSize: 14, lineHeight: 21, color: p.text }}>{description}</Text> : null}

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
    </View>
  );
}
