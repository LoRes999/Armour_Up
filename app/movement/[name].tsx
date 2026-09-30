import React, { useRef } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { routeParam } from '../../src/routeParams';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { EmptyState } from '../../src/components/ui';
import { MovementInfo, movementEntry } from '../../src/components/MovementInfo';

/**
 * One movement, opened from anywhere its name appears — the library, a
 * client's plan, a past session, Progress. The trainer's own movements show
 * whatever photos they attached; the built-in catalogue is written copy alone.
 */
export default function MovementDetail() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { name: rawName } = useLocalSearchParams<{ name?: string | string[] }>();
  const name = routeParam(rawName);

  // Opened by name, and a coach can rename their own movement from here.
  // Coming back from the editor, the name in the route was the old one and
  // the page read "Nothing written yet"; it follows the movement by id.
  const byName = store.customMovement(name);
  const seenId = useRef<string | undefined>(undefined);
  if (byName) seenId.current = byName.id;
  const custom = byName ?? store.customMovements.find((m) => m.id === seenId.current);
  const entry = movementEntry(name, custom);
  const isTrainer = store.role === 'trainer';

  if (!entry) {
    return (
      <>
        {/* headerRight is cleared explicitly: options merge, so the Edit button
            from before the movement was deleted would otherwise stay, still
            pointing at the deleted movement. */}
        <Stack.Screen options={{ title: name || 'Movement', headerRight: () => null }} />
        <EmptyState
          icon="barbell-outline"
          title="Nothing written yet"
          message="This movement has no reference entry."
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: entry.title,
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
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 40 }}
      >
        <MovementInfo name={name} custom={custom} />
      </ScrollView>
    </>
  );
}
