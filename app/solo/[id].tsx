import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette, webHitArea } from '../../src/theme';
import {
  Card,
  EmptyState,
  Eyebrow,
  Numeric,
  PrimaryButton,
  RepStepper,
  WeightStepper,
} from '../../src/components/ui';
import { ElapsedClock, elapsedSeconds } from '../../src/components/SessionClock';
import {
  DEFAULT_UNIT,
  exerciseIsComplete,
  isLogged,
  loggedSets,
  schemeSummary,
} from '../../src/models';
import { confirm } from '../../src/confirm';
import { useCelebration } from '../../src/celebration/CelebrationProvider';
import { sessionReward } from '../../src/rewards';

/**
 * The client training on their own. Deliberately a separate screen from the
 * trainer's live session and from Today: Today is a read surface, and a screen
 * that is sometimes writable is exactly the confusion this change removes.
 *
 * There is no cursor here. The trainer's cursor assumes a second person driving
 * the session; someone lifting alone supersets, skips and doubles back, so every
 * set stays open and the numbers start from what they lifted last time.
 *
 * The running clock is its own component, so this screen only re-renders when
 * a set changes — see src/components/SessionClock for why that matters on iOS.
 */
export default function SoloSession() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { celebrate } = useCelebration();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workout = store.workout(id);
  const client = workout ? store.client(workout.clientId) : undefined;
  const unit = client?.unit ?? DEFAULT_UNIT;
  // Derived from the workout's own start time, so leaving this screen and
  // returning to it — which the Today card invites — carries on rather than
  // restarting from zero. That reset used to record a forty-minute session as
  // one minute.
  const [mountedAt] = useState(() => Date.now());
  const startedAt = workout?.startedAt ? Date.parse(workout.startedAt) : mountedAt;

  /**
   * A full-screen modal has no swipe dismiss, so the header X is the only way
   * out. Falling back to the tabs matters for a cold deep link, where there is
   * nothing on the stack to pop.
   */
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(client)'));

  // Header buttons call through a ref so the options can be memoised on what
  // the header shows, rather than rebuilt on every render.
  const actions = useRef({ close, confirmFinish: () => {} });
  actions.current.close = close;

  const isSoloWorkout = workout !== undefined && workout.loggedBy === 'client';
  const workoutName = workout?.name;
  // Nothing logged yet: there is no session to finish (as the footer button says).
  const canFinish = workout !== undefined && loggedSets(workout) > 0;
  const headerOptions = useMemo(
    () => ({
      title: isSoloWorkout ? (workoutName ?? 'Session') : 'Session',
      headerLeft: () => (
        <Pressable
          onPress={() => actions.current.close()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close session"
          style={webHitArea}
        >
          <Ionicons name="close" size={24} color={p.dim} />
        </Pressable>
      ),
      headerRight: isSoloWorkout
        ? () => (
            <Pressable
              onPress={() => actions.current.confirmFinish()}
              disabled={!canFinish}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Finish session"
              accessibilityState={{ disabled: !canFinish }}
              style={webHitArea}
            >
              <Ionicons name="flag-outline" size={22} color={canFinish ? p.accent : p.dim} />
            </Pressable>
          )
        : undefined,
    }),
    [isSoloWorkout, workoutName, canFinish, p.dim, p.accent]
  );

  if (!workout || workout.loggedBy !== 'client') {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <EmptyState
          icon="barbell-outline"
          title="Session not found"
          message="This solo session is no longer available."
        />
      </>
    );
  }

  const done = loggedSets(workout);

  const finish = () => {
    const finishedId = workout.id;
    const minutes = Math.max(1, Math.round(elapsedSeconds(startedAt) / 60));
    // Worked out before finishWorkout, while the store still holds the old
    // records: "was 85, now 90" needs the 85.
    const reward = client
      ? sessionReward({
          workout,
          priorRecords: store.personalRecords(client.id),
          priorCompletedDates: store.historyFor(client.id).map((w) => w.date),
          minutes,
          now: new Date(),
        })
      : null;
    store.finishWorkout(finishedId, minutes);
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
    // The end of a session is the part people remember. It lands over the
    // record they just made.
    if (reward && client) {
      celebrate({
        kind: 'session',
        audience: 'client',
        reward,
        clientName: client.name,
        workoutName: workout.name,
        unit,
      });
    }
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
  actions.current.confirmFinish = confirmFinish;

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
      <Stack.Screen options={headerOptions} />

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

        <ElapsedClock startedAt={startedAt} suffix=" · training solo" />

        {workout.exercises.map((exercise, exerciseIndex) => (
          <Card key={exercise.id} radius={17} style={{ padding: 13, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable accessibilityRole="button"
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
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: logged }}
                    accessibilityLabel={`Set ${setIndex + 1}`}
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
            foreground={p.onSuccess}
            enabled={done > 0}
            onPress={confirmFinish}
          />
          <Pressable
            onPress={confirmDiscard}
            accessibilityRole="button"
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
