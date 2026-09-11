import React, { useEffect, useReducer, useRef, useState } from 'react';
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
  exerciseIsComplete,
  DEFAULT_UNIT,
  formatIn,
  loggedCount,
  loggedSets,
  schemeSummary,
} from '../../src/models';
import { confirm } from '../../src/confirm';
import { useCelebration } from '../../src/celebration/CelebrationProvider';
import { sessionReward } from '../../src/rewards';

const REST_SECONDS = 90;

/**
 * The trainer logs here while coaching. "Log set" records the set, starts the
 * rest countdown, and advances — the cursor is derived from what is already
 * logged, so advancing needs no separate state to drift out of sync.
 */
export default function LiveSession() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { celebrate } = useCelebration();
  const { id, clientId } = useLocalSearchParams<{ id: string; clientId?: string }>();

  const workout = store.workout(id);
  const client = store.client(clientId ?? workout?.clientId ?? '');
  const unit = client?.unit ?? DEFAULT_UNIT;

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rest, setRest] = useState(0);
  // Derived from the workout's own start time rather than counted from mount, so
  // reopening a session already in progress resumes its clock.
  const [mountedAt] = useState(() => Date.now());
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const syncedFor = useRef<string>('');

  // First unlogged set, in order. Undefined once everything is logged.
  let cursor: { exercise: number; set: number } | undefined;
  if (workout) {
    for (let e = 0; e < workout.exercises.length && !cursor; e += 1) {
      const s = workout.exercises[e].sets.findIndex((set) => set.loggedWeight === undefined);
      if (s !== -1) cursor = { exercise: e, set: s };
    }
  }
  const cursorKey = cursor ? `${cursor.exercise}-${cursor.set}` : 'done';

  useEffect(() => {
    const timer = setInterval(() => {
      tick();
      setRest((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAt = workout?.startedAt ? Date.parse(workout.startedAt) : mountedAt;
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

  // Pull the drafts from the prescription whenever the cursor moves.
  useEffect(() => {
    if (!workout || !cursor) return;
    if (syncedFor.current === cursorKey) return;
    const target = workout.exercises[cursor.exercise]?.sets[cursor.set];
    if (!target) return;
    syncedFor.current = cursorKey;
    setWeight(target.targetWeight);
    setReps(target.targetReps);
  }, [cursorKey, workout, cursor]);

  /**
   * A full-screen modal has no swipe dismiss, so the header X is the only way
   * out. Falling back to the tabs matters for a cold deep link, where there is
   * nothing on the stack to pop.
   */
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(trainer)/clients'));

  const closeButton = () => (
    <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close session">
      <Ionicons name="close" size={24} color={p.dim} />
    </Pressable>
  );

  if (!workout) {
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
          message="This workout is no longer scheduled."
        />
      </>
    );
  }

  const timeString = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  /**
   * Used to drop the trainer back on Today, where the card they had just
   * finished simply vanished. Now it lands with the session's payoff over it —
   * naming the client, because the two of them are standing together and this
   * is something to turn round and show.
   */
  const finish = () => {
    const minutes = Math.max(1, Math.round(elapsed / 60));
    const reward = client
      ? sessionReward({
          workout,
          priorRecords: store.personalRecords(client.id),
          priorCompletedDates: store.historyFor(client.id).map((w) => w.date),
          minutes,
          now: new Date(),
        })
      : null;
    store.finishWorkout(workout.id, minutes);
    router.back();
    if (reward && client) {
      celebrate({
        kind: 'session',
        audience: 'trainer',
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

  const exercise = cursor ? workout.exercises[cursor.exercise] : undefined;
  const target = cursor && exercise ? exercise.sets[cursor.set] : undefined;

  const upNext = () => {
    if (!cursor || !exercise) return null;
    if (cursor.set + 1 < exercise.sets.length) {
      return `${exercise.movementName} · set ${cursor.set + 2}`;
    }
    const next = workout.exercises[cursor.exercise + 1];
    return next ? `${next.movementName} · ${schemeSummary(next)}` : null;
  };

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
          {workout.exercises.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: exerciseIsComplete(entry)
                  ? p.success
                  : index === cursor?.exercise
                    ? p.accent
                    : p.surfaceAlt,
              }}
            />
          ))}
        </View>

        <Text style={{ fontSize: 11, fontWeight: '700', color: p.accent, textAlign: 'center' }}>
          {`● ${timeString(elapsed)} elapsed`}
        </Text>

        {cursor && exercise && target ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/movement/[name]',
                    params: { name: exercise.movementName },
                  })
                }
                hitSlop={6}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.6, color: p.text }}>
                  {exercise.movementName}
                </Text>
                <Ionicons name="information-circle-outline" size={15} color={p.dim} />
              </Pressable>
              <Numeric size={11} color={p.dim}>
                {`${cursor.exercise + 1} / ${workout.exercises.length}`}
              </Numeric>
            </View>

            <Card radius={22} style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Eyebrow color={p.accent}>{`SET ${cursor.set + 1}`}</Eyebrow>
                <Numeric size={11} color={p.dim}>
                  {`target ${formatIn(target.targetWeight, unit)} ${unit} × ${target.targetReps}`}
                </Numeric>
              </View>

              <View style={{ marginTop: 12 }}>
                <WeightStepper unit={unit} value={weight} onChange={setWeight} large />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 14,
                    backgroundColor: p.surfaceAlt,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Eyebrow>REPS</Eyebrow>
                    <Numeric size={19}>{reps}</Numeric>
                  </View>
                  <RepStepper value={reps} onChange={setReps} />
                </View>
              </View>
            </Card>

            {rest > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: p.surfaceAlt,
                }}
              >
                <Ionicons name="timer-outline" size={17} color={p.accent} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: p.text }}>Rest</Text>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: p.border }}>
                    <View
                      style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: p.accent,
                        width: `${(rest / REST_SECONDS) * 100}%`,
                      }}
                    />
                  </View>
                </View>
                <Numeric size={17} color={p.accent}>
                  {timeString(rest)}
                </Numeric>
              </View>
            ) : null}

            <View style={{ gap: 8, marginTop: 4 }}>
              <Eyebrow>LOGGED</Eyebrow>
              {loggedCount(exercise) === 0 ? (
                <Text style={{ fontSize: 12, color: p.dim }}>
                  Nothing logged for this exercise yet.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                  {exercise.sets.map((set, index) =>
                    set.loggedWeight !== undefined ? (
                      <Card key={set.id} radius={12} style={{ paddingHorizontal: 12, paddingVertical: 7 }}>
                        <Eyebrow>{`SET ${index + 1}`}</Eyebrow>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                          <Numeric size={14}>{formatIn(set.loggedWeight, unit)}</Numeric>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: p.dim }}>
                            {`× ${set.loggedReps}`}
                          </Text>
                        </View>
                      </Card>
                    ) : null
                  )}
                </View>
              )}
            </View>
          </>
        ) : (
          <Card radius={22} style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Ionicons name="checkmark-circle" size={42} color={p.success} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: p.text }}>Every set logged</Text>
            <Text style={{ fontSize: 13, color: p.dim }}>
              {`${loggedSets(workout)} sets · ${workout.exercises.length} exercises · ${timeString(elapsed)}`}
            </Text>
          </Card>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: metrics.screenPadding, paddingBottom: 8, gap: 9 }}>
        {upNext() ? (
          <Card
            radius={15}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 11,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          >
            <Eyebrow>UP NEXT</Eyebrow>
            <Text
              style={{ flex: 1, fontSize: 13, fontWeight: '700', color: p.text, textAlign: 'right' }}
              numberOfLines={1}
            >
              {upNext()}
            </Text>
          </Card>
        ) : null}

        {cursor ? (
          <PrimaryButton
            title={`Log set ${cursor.set + 1}`}
            icon="checkmark"
            onPress={() => {
              store.logSet(workout.id, cursor.exercise, cursor.set, weight, reps);
              setRest(REST_SECONDS);
              // The cursor recomputes from the logged state, so the screen
              // advances on its own and the drafts reload.
            }}
          />
        ) : (
          <PrimaryButton
            title="Finish session"
            icon="flag"
            tint={p.success}
            foreground="#FFFFFF"
            onPress={finish}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
