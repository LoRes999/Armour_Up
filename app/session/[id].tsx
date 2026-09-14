import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ElapsedClock,
  LiveText,
  RestBanner,
  clockString,
  elapsedSeconds,
} from '../../src/components/SessionClock';
import {
  exerciseIsComplete,
  DEFAULT_UNIT,
  formatIn,
  loggedCount,
  loggedSets,
  plural,
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
 *
 * Nothing on this screen changes every second any more. The running clock and
 * the rest countdown are their own components (src/components/SessionClock),
 * so the screen — and the header options it hands to the navigator — only
 * re-render when something the trainer did changes them.
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
  // When the current rest ends, as a timestamp — see RestBanner for why.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  // Derived from the workout's own start time rather than counted from mount, so
  // reopening a session already in progress resumes its clock.
  const [mountedAt] = useState(() => Date.now());
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

  const startedAt = workout?.startedAt ? Date.parse(workout.startedAt) : mountedAt;

  // Pull the drafts from the prescription whenever the cursor moves. Keyed on
  // the cursor's position alone: `cursor` itself is a new object every render,
  // and listing it made this effect run on every render of the screen.
  useEffect(() => {
    if (!workout || !cursor) return;
    if (syncedFor.current === cursorKey) return;
    const target = workout.exercises[cursor.exercise]?.sets[cursor.set];
    if (!target) return;
    syncedFor.current = cursorKey;
    setWeight(target.targetWeight);
    setReps(target.targetReps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey]);

  /**
   * A full-screen modal has no swipe dismiss, so the header X is the only way
   * out. Falling back to the tabs matters for a cold deep link, where there is
   * nothing on the stack to pop.
   */
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(trainer)/today'));

  // The header's buttons call through a ref, so the options object can be
  // memoised on what the header actually shows. Inline functions made it a new
  // object on every render, and expo-router applies options on every change.
  const actions = useRef({ close, confirmFinish: () => {} });
  actions.current.close = close;

  const workoutName = workout?.name;
  const hasWorkout = workout !== undefined;
  // Nothing logged yet: there is no session to finish.
  const canFinish = workout !== undefined && loggedSets(workout) > 0;
  const headerOptions = useMemo(
    () => ({
      title: workoutName ?? 'Session',
      headerLeft: () => (
        <Pressable
          onPress={() => actions.current.close()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close session"
        >
          <Ionicons name="close" size={24} color={p.dim} />
        </Pressable>
      ),
      headerRight: hasWorkout
        ? () => (
            <Pressable
              onPress={() => actions.current.confirmFinish()}
              disabled={!canFinish}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Finish session"
              accessibilityState={{ disabled: !canFinish }}
            >
              <Ionicons name="flag-outline" size={22} color={canFinish ? p.accent : p.dim} />
            </Pressable>
          )
        : undefined,
    }),
    [workoutName, hasWorkout, canFinish, p.dim, p.accent]
  );

  if (!workout) {
    return (
      <>
        <Stack.Screen options={headerOptions} />
        <EmptyState
          icon="barbell-outline"
          title="Session not found"
          message="This workout is no longer scheduled."
        />
      </>
    );
  }

  /**
   * Used to drop the trainer back on Today, where the card they had just
   * finished simply vanished. Now it lands with the session's payoff over it —
   * naming the client, because the two of them are standing together and this
   * is something to turn round and show.
   */
  const finish = () => {
    const minutes = Math.max(1, Math.round(elapsedSeconds(startedAt) / 60));
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
    close();
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
  actions.current.confirmFinish = confirmFinish;

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
      <Stack.Screen options={headerOptions} />

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

        <ElapsedClock startedAt={startedAt} />

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

            {restEndsAt !== null ? <RestBanner endsAt={restEndsAt} total={REST_SECONDS} /> : null}

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
            <LiveText
              style={{ fontSize: 13, color: p.dim }}
              render={() =>
                `${plural(loggedSets(workout), 'set')} · ${plural(workout.exercises.length, 'exercise')} · ${clockString(
                  elapsedSeconds(startedAt)
                )}`
              }
            />
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
              setRestEndsAt(Date.now() + REST_SECONDS * 1000);
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
