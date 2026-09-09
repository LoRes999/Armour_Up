import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../../src/store';
import { usePalette } from '../../../src/theme';
import { PrimaryButton } from '../../../src/components/ui';
import SessionDetail from '../../../src/components/SessionDetail';

export default function WorkoutDetail() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workout = store.workout(id);

  /**
   * Repeating starts a session the client owns and logs themselves. It carries
   * forward what they actually lifted, not what was prescribed at the time.
   */
  const repeat = () => {
    const soloId = store.repeatWorkout(id);
    // push, not replace: replacing diverges at the root stack and tears down the
    // whole client tab navigator, which leaves the solo screen with nothing to
    // dismiss back to and strands this tab on a single detail route.
    if (soloId) router.push({ pathname: '/solo/[id]', params: { id: soloId } });
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
