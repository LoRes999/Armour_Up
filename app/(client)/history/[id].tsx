import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { routeParam } from '../../../src/routeParams';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../../src/store';
import { usePalette, webHitArea } from '../../../src/theme';
import { PrimaryButton } from '../../../src/components/ui';
import SessionDetail from '../../../src/components/SessionDetail';
import { confirm } from '../../../src/confirm';

export default function WorkoutDetail() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeParam(rawId);

  const workout = store.workout(id);

  /**
   * Repeating starts a session the client owns and logs themselves. It carries
   * forward what they actually lifted, not what was prescribed at the time.
   */
  const repeat = () => {
    // push, not replace: replacing diverges at the root stack and tears down the
    // whole client tab navigator, which leaves the solo screen with nothing to
    // dismiss back to and strands this tab on a single detail route.
    const open = (soloId: string | undefined) => {
      if (soloId) router.push({ pathname: '/solo/[id]', params: { id: soloId } });
    };
    const unfinished = workout ? store.activeSoloFor(workout.clientId) : undefined;
    // Another session of their own still open used to be opened instead,
    // without a word. Now the client picks (Ryan's call, 2026-09-13). The same
    // session again is the one already open, so that just carries on.
    if (!workout || !unfinished || unfinished.name === workout.name) {
      open(store.repeatWorkout(id));
      return;
    }
    confirm({
      title: `You have ${unfinished.name} in progress`,
      message: `Starting ${workout.name} instead throws away the unfinished ${unfinished.name}.`,
      confirmLabel: `Start ${workout.name}`,
      cancelLabel: `Continue ${unfinished.name}`,
      destructive: true,
      onConfirm: () => open(store.repeatWorkout(id, { replace: true })),
      onCancel: () => open(unfinished.id),
    });
  };

  /**
   * The calendar is normally mounted beneath this screen. When it is not — a cold
   * deep link, or a refresh in the browser — offer an explicit way to it rather
   * than leaving the tab pinned to one session with no back button.
   */
  const headerLeft = router.canGoBack()
    ? undefined
    : () => (
        <Pressable
          onPress={() => router.replace('/(client)/history')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to calendar"
          style={webHitArea}
        >
          <Ionicons name="chevron-back" size={26} color={p.accent} />
        </Pressable>
      );

  return (
    <>
      <Stack.Screen options={{ title: workout?.name ?? 'Session', headerLeft }} />
      <SessionDetail
        workoutId={id}
        footer={
          workout?.status === 'completed' ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <PrimaryButton title="Repeat this session" icon="refresh" onPress={repeat} />
              <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center', lineHeight: 17 }}>
                Runs it again on your own, starting from these weights.
              </Text>
            </View>
          ) : undefined
        }
      />
    </>
  );
}
