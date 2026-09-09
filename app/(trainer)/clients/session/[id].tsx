import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useStore } from '../../../../src/store';
import SessionDetail from '../../../../src/components/SessionDetail';

/**
 * A past session, opened from a client's history. It sits inside the clients
 * stack so it pushes from the client's profile and keeps the tab bar.
 */
export default function TrainerSessionDetail() {
  const store = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = store.workout(id);

  return (
    <>
      <Stack.Screen options={{ title: workout?.name ?? 'Session' }} />
      <SessionDetail workoutId={id} />
    </>
  );
}
