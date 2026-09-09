import React, { useEffect, useReducer, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import {
  Card,
  EmptyState,
  Eyebrow,
  Numeric,
  PrimaryButton,
  RepStepper,
  WeightStepper,
} from '../../src/components/ui';
import {
  DEFAULT_UNIT,
  exerciseIsComplete,
  isLogged,
  loggedSets,
  schemeSummary,
} from '../../src/models';
import { confirm } from '../../src/confirm';

/**
 * The client training on their own. Deliberately a separate screen from the
 * trainer's live session and from Today: Today is a read surface, and a screen
 * that is sometimes writable is exactly the confusion this change removes.
 *
 * There is no cursor here. The trainer's cursor assumes a second person driving
 * the session; someone lifting alone supersets, skips and doubles back, so every
 * set stays open and the numbers start from what they lifted last time.
 */
export default function SoloSession() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workout = store.workout(id);
  const client = workout ? store.client(workout.clientId) : undefined;
  const unit = client?.unit ?? DEFAULT_UNIT;
  // The tick only forces a re-render; the number itself is derived from the
  // workout's own start time, so leaving this screen and returning to it — which
  // the Today card invites — carries on rather than restarting from zero. That
  // reset used to record a forty-minute session as one minute.
  const [mountedAt] = useState(() => Date.now());
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAt = workout?.startedAt ? Date.parse(workout.startedAt) : mountedAt;
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

  /**
   * A full-screen modal has no swipe dismiss, so the header X is the only way
   * out. Falling back to the tabs matters for a cold deep link, where there is
   * nothing on the stack to pop.
   */
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(client)'));

  const closeButton = () => (
    <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close session">
      <Ionicons name="close" size={24} color={p.dim} />
    </Pressable>
  );

  if (!workout || workout.loggedBy !== 'client') {
    // The header has to be configured here too. The root layout sets
    // headerShown: false, so returning early without it renders a header-less
    // full-screen modal with no way out at all.
    return (
      <>
        <Stack.Screen
          options={{ headerShown: true, title: 'Session', headerLeft: closeButton }}
        />
        <EmptyState
          icon="barbell-outline"
          title="Session not found"
          message="This solo session is no longer available."
        />
      </>
    );
  }

  const timeString = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const done = loggedSets(workout);

  const finish = () => {
    const finishedId = workout.id;
    store.finishWorkout(finishedId, Math.max(1, Math.round(elapsed / 60)));
    // Landing on the record they just made is the payoff, but a replace() from
    // here diverges at the root stack: it rebuilds (client) from scratch, giving
    // a second tab navigator and a History stack holding only [id] with no
    // calendar underneath. Dismiss first so the mounted tabs are reused, then
    // push. withAnchor keeps the calendar beneath the detail on a cold entry.
    if (router.canGoBack()) router.back();
    router.push(
      { pathname: '/(client)/history/[id]', params: { id: finishedId } },
      { withAnchor: true }
    );
  };

  const confirmFinish = () =>
    confirm({
      title: 'Finish this session?',
      message: 'Unlogged sets stay unlogged.',
      confirmLabel: 'Finish session',
      cancelLabel: 'Keep going',
      destructive: true,
      onConfirm: finish,
    });

  const confirmDiscard = () =>
    confirm({
      title: 'Discard this session?',
      message: 'Nothing from it is kept.',
      confirmLabel: 'Discard',
      destructive: true,
      onConfirm: () => {
        // Navigate before mutating. Removing it first makes store.workout(id)
        // undefined on the next render, which drops this screen into the
        // "not found" branch on the way out.
        const discardId = workout.id;
        close();
        store.removeWorkout(discardId);
      },
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: workout.name,
          headerLeft: closeButton,
          headerRight: () => (
            <Pressable
              onPress={confirmFinish}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Finish session"
            >
              <Ionicons name="flag-outline" size={22} color={p.accent} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: metrics.screenPadding, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {workout.exercises.map((entry) => (
            <View
              key={entry.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: exerciseIsComplete(entry) ? p.success : p.surfaceAlt,
              }}
            />
          ))}
        </View>

        <Text style={{ fontSize: 11, fontWeight: '700', color: p.accent, textAlign: 'center' }}>
          {`● ${timeString(elapsed)} elapsed · training solo`}
        </Text>

        {workout.exercises.map((exercise, exerciseIndex) => (
          <Card key={exercise.id} radius={17} style={{ padding: 13, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/movement/[name]',
                    params: { name: exercise.movementName },
                  })
                }
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>
                  {exercise.movementName}
                </Text>
                <Ionicons name="information-circle-outline" size={13} color={p.dim} />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 11, color: p.dim }}>{schemeSummary(exercise)}</Text>
            </View>

            {exercise.sets.map((set, setIndex) => {
              const logged = isLogged(set);
              return (
                <View
                  key={set.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 4,
                    paddingHorizontal: 6,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: logged ? p.accent : 'transparent',
                    backgroundColor: logged ? p.accentSoft : p.surfaceAlt,
                  }}
                >
                  {/* The set number and the "done" tick are the same control:
                      it counts the set until the set is logged, then confirms
                      it. Tapping logs the prescribed numbers, or clears them. */}
                  <Pressable
                    onPress={() => store.toggleSetLogged(workout.id, exerciseIndex, setIndex)}
                    style={{
                      width: 34,
                      height: metrics.hitTarget,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderColor: logged ? p.accent : p.border,
                        backgroundColor: logged ? p.accent : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {logged ? (
                        <Ionicons name="checkmark" size={15} color={p.onAccent} />
                      ) : (
                        <Numeric size={12} color={p.dim}>
                          {setIndex + 1}
                        </Numeric>
                      )}
                    </View>
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <WeightStepper
                      unit={unit}
                      value={set.loggedWeight ?? set.targetWeight}
                      onChange={(next) =>
                        store.setLoggedWeight(workout.id, exerciseIndex, setIndex, next)
                      }
                    />
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', width: 92 }}>
                    <Numeric size={14} style={{ minWidth: 26, textAlign: 'center' }}>
                      {set.loggedReps ?? set.targetReps}
                    </Numeric>
                    <RepStepper
                      value={set.loggedReps ?? set.targetReps}
                      onChange={(next) =>
                        store.setLoggedReps(workout.id, exerciseIndex, setIndex, next)
                      }
                    />
                  </View>

                </View>
              );
            })}
          </Card>
        ))}

        <View style={{ gap: 8, marginTop: 4 }}>
          <View style={{ alignItems: 'center' }}>
            <Eyebrow>{`${done} OF ${workout.exercises.reduce((t, e) => t + e.sets.length, 0)} SETS LOGGED`}</Eyebrow>
          </View>
          {/* An accidental Repeat must not be able to leave an empty session
              sitting on the calendar. */}
          <PrimaryButton
            title="Finish session"
            icon="flag"
            tint={p.success}
            foreground="#10240F"
            enabled={done > 0}
            onPress={confirmFinish}
          />
          <Pressable
            onPress={confirmDiscard}
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.danger }}>
              Discard session
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
