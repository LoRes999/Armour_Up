import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import {
  Avatar,
  Card,
  EmptyState,
  Eyebrow,
  Numeric,
  Pill,
  PrimaryButton,
} from '../../src/components/ui';
import { ProgressRing } from '../../src/components/charts';
import {
  ExerciseEntry,
  SetEntry,
  completedExercises,
  exerciseIsComplete,
  DEFAULT_UNIT,
  WeightUnit,
  formatIn,
  initialsOf,
  loggedSets,
  schemeSummary,
  topTargetWeight,
  totalSets,
  workoutProgress,
} from '../../src/models';
import { TRAINER_NAME } from '../../src/sampleData';

/**
 * What the client is doing today, and how it is going. Read-only by design:
 * during a coached session the trainer logs every set from their own screen,
 * and this updates live off the same fields.
 *
 * The one thing the client logs themselves is a solo session — a past workout
 * they chose to repeat without a trainer. That has its own screen, so no part
 * of this one is sometimes-writable.
 */
export default function ClientToday() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const client = store.currentClient();
  const workout = client ? store.todayWorkoutFor(client.id) : undefined;
  const solo = client ? store.activeSoloFor(client.id) : undefined;
  const lastSession = client ? store.historyFor(client.id)[0] : undefined;
  const unit = client?.unit ?? DEFAULT_UNIT;
  const coachFirstName = TRAINER_NAME.split(' ')[0];

  const repeatLast = () => {
    if (!lastSession) return;
    const soloId = store.repeatWorkout(lastSession.id);
    if (soloId) router.push({ pathname: '/solo/[id]', params: { id: soloId } });
  };

  const hour = new Date().getHours();
  const part = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const firstName = client?.name.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>
              {new Date()
                .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                .toUpperCase()}
            </Eyebrow>
            <Text
              style={{
                fontSize: 26,
                fontWeight: '800',
                letterSpacing: -0.8,
                color: p.text,
                marginTop: 2,
              }}
            >
              {`${part}, ${firstName}`}
            </Text>
          </View>
          {client ? <Avatar initials={initialsOf(client.name)} /> : null}
        </View>

        {/* A session they started alone. It can sit alongside a coached one —
            a client booked for 6pm can still train by themselves at seven. */}
        {solo ? (
          <Pressable
            onPress={() => router.push({ pathname: '/solo/[id]', params: { id: solo.id } })}
          >
            <Card
              radius={20}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}
            >
              <ProgressRing progress={workoutProgress(solo)} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Eyebrow color={p.accent}>IN PROGRESS</Eyebrow>
                  <Pill label="SOLO" />
                </View>
                <Text
                  style={{
                    fontSize: 21,
                    fontWeight: '800',
                    letterSpacing: -0.6,
                    color: p.text,
                    marginTop: 4,
                  }}
                >
                  {solo.name}
                </Text>
                <Text style={{ fontSize: 12, color: p.dim, marginTop: 3 }}>
                  {`${loggedSets(solo)} of ${totalSets(solo)} sets logged · tap to carry on`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={p.dim} />
            </Card>
          </Pressable>
        ) : null}

        {!workout ? (
          solo ? null : (
            <View style={{ gap: 12 }}>
              {/* "Rest day. Enjoy it." is true but wrong for someone who joined
                  a minute ago and has never trained — they are waiting to be
                  told what happens next, not to be congratulated on a day off. */}
              {store.historyFor(client?.id ?? '').length === 0 &&
              store.workoutsFor(client?.id ?? '').length === 0 ? (
                <EmptyState
                  icon="hourglass-outline"
                  title="You're in"
                  message={`${coachFirstName} hasn't sent your first session yet. It shows up here the moment they do.`}
                />
              ) : (
                <EmptyState
                  icon="moon-outline"
                  title="Rest day"
                  message="Nothing scheduled today. Enjoy it."
                />
              )}
              {lastSession ? (
                <>
                  <PrimaryButton
                    title="Repeat your last session"
                    icon="refresh"
                    onPress={repeatLast}
                  />
                  <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center', lineHeight: 17 }}>
                    {`Runs ${lastSession.name} again on your own, from the weights you last lifted.`}
                  </Text>
                </>
              ) : null}
            </View>
          )
        ) : (
          <>
            <Card
              radius={20}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}
            >
              <ProgressRing progress={workoutProgress(workout)} />
              <View style={{ flex: 1 }}>
                <Eyebrow color={p.accent}>
                  {workout.status === 'inProgress' ? 'IN PROGRESS' : 'SCHEDULED'}
                </Eyebrow>
                <Text
                  style={{
                    fontSize: 21,
                    fontWeight: '800',
                    letterSpacing: -0.6,
                    color: p.text,
                    marginTop: 4,
                  }}
                >
                  {workout.name}
                </Text>
                <Text style={{ fontSize: 12, color: p.dim, marginTop: 3 }}>
                  {`${completedExercises(workout)} of ${workout.exercises.length} done · ${totalSets(workout)} sets`}
                </Text>
                {/* Otherwise an untouched session is an empty ring with nothing
                    to tap, which reads as broken rather than as not-started. */}
                <Text style={{ fontSize: 11, color: p.dim, marginTop: 3 }}>
                  {`${coachFirstName} logs these as you lift`}
                </Text>
              </View>
            </Card>

            {workout.coachNote ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  padding: 14,
                  borderRadius: 15,
                  backgroundColor: p.surfaceAlt,
                }}
              >
                <Avatar
                  initials={initialsOf(TRAINER_NAME)}
                  size={24}
                  tint={p.onAccent}
                  background={p.accent}
                />
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: p.text }}>
                  {workout.coachNote}
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: 4 }}>
              <Eyebrow>TODAY'S PLAN · TAP AN EXERCISE FOR ITS SETS</Eyebrow>
            </View>

            {workout.exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                unit={unit}
                open={open === exercise.id}
                onToggle={() => setOpen(open === exercise.id ? null : exercise.id)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExerciseCard({
  exercise,
  unit,
  open,
  onToggle,
}: {
  exercise: ExerciseEntry;
  unit: WeightUnit;
  open: boolean;
  onToggle: () => void;
}) {
  const p = usePalette();
  const router = useRouter();
  const done = exerciseIsComplete(exercise);

  const setText = (set: SetEntry) =>
    set.loggedWeight !== undefined && set.loggedReps !== undefined
      ? `${formatIn(set.loggedWeight, unit)} × ${set.loggedReps}`
      : `${formatIn(set.targetWeight, unit)} × ${set.targetReps}`;

  return (
    <Pressable onPress={onToggle}>
      <Card radius={16} style={{ paddingHorizontal: 13, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            minHeight: metrics.hitTarget,
          }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: done ? p.success : p.surfaceAlt,
            }}
          >
            <Ionicons name="checkmark" size={14} color={done ? '#10240F' : p.dim} />
          </View>

          <View style={{ flex: 1 }}>
            {/* The name is the way into the movement's reference entry. */}
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
              <Text style={{ fontSize: 14, fontWeight: '700', color: done ? p.dim : p.text }}>
                {exercise.movementName}
              </Text>
              <Ionicons name="information-circle-outline" size={13} color={p.dim} />
            </Pressable>
            <Text style={{ fontSize: 11, color: p.dim }}>{schemeSummary(exercise)}</Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Numeric size={18} color={p.accent}>
              {formatIn(topTargetWeight(exercise), unit)}
            </Numeric>
            <Eyebrow>{unit.toUpperCase()}</Eyebrow>
          </View>
        </View>

        {open ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: p.border,
            }}
          >
            {exercise.sets.map((set, index) => {
              const logged = set.loggedWeight !== undefined;
              return (
                <View
                  key={set.id}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: metrics.hitTarget,
                    paddingVertical: 6,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: logged ? p.accent : 'transparent',
                    backgroundColor: logged ? p.accentSoft : p.surfaceAlt,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {logged ? <Ionicons name="checkmark" size={10} color={p.accent} /> : null}
                    <Eyebrow color={logged ? p.accent : undefined}>{`SET ${index + 1}`}</Eyebrow>
                  </View>
                  <Numeric size={13} color={logged ? p.text : p.dim} style={{ marginTop: 2 }}>
                    {setText(set)}
                  </Numeric>
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
