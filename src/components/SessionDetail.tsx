import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { metrics, usePalette } from '../theme';
import { Avatar, Card, EmptyState, Eyebrow, Numeric, Pill, StatTile } from './ui';
import { DayTypeChip } from './DayTypePicker';
import {
  ExerciseEntry,
  DEFAULT_UNIT,
  formatDuration,
  formatIn,
  initialsOf,
  isSolo,
  loggedSets,
  topLoggedWeight,
  topTargetSet,
} from '../models';
import { useCoachName } from '../auth';
import { setsNewRecord } from '../rewards';

/**
 * One finished session, in full. Both sides read the same record — the client
 * from their calendar, the trainer from a client's history — so this lives here
 * rather than in either route.
 *
 * `footer` is a slot rather than a role prop: the only thing that differs
 * between the two is the client's "Repeat this session" button, and a slot
 * keeps this component ignorant of both role and routing.
 */
export default function SessionDetail({
  workoutId,
  footer,
}: {
  workoutId: string;
  footer?: React.ReactNode;
}) {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const coachName = useCoachName();

  const workout = store.workout(workoutId);
  const client = workout ? store.client(workout.clientId) : undefined;
  const unit = client?.unit ?? DEFAULT_UNIT;

  if (!workout) {
    return (
      <EmptyState
        icon="document-outline"
        title="Session not found"
        message="This session is no longer available."
      />
    );
  }

  // The whole record, not just its weight: the badge has to mean "set here",
  // and matching on weight alone marked every later session that merely tied
  // the all-time best — including ones from months ago — as a new PR.
  const bests = new Map(
    client ? store.personalRecords(client.id).map((r) => [r.movementName, r] as const) : []
  );
  // One rule with the finish celebration: a first-ever lift sets a record but
  // beats nothing, so it is not a PR.
  const isPR = (exercise: ExerciseEntry) =>
    setsNewRecord(bests.get(exercise.movementName), workout.date, topLoggedWeight(exercise));

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 14 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, color: p.dim }}>
          {new Date(workout.date).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {/* Solo is neutral metadata, not an achievement, so it stays dim next
              to the accent-coloured PR badge. */}
          {isSolo(workout) ? <Pill label="SOLO" /> : null}
          {workout.exercises.some(isPR) ? (
            <Pill label="PR DAY" tint={p.accent} background={p.accentSoft} />
          ) : null}
        </View>
      </View>

      {workout.dayTypeId ? <DayTypeChip dayType={store.dayType(workout.dayTypeId)} /> : null}

      <View style={{ flexDirection: 'row', gap: 7 }}>
        <StatTile label="EXERCISES" value={String(workout.exercises.length)} />
        <StatTile label="SETS" value={String(loggedSets(workout))} />
        <StatTile
          label="TIME"
          value={formatDuration(workout.durationMinutes) ?? '—'}
        />
      </View>

      {workout.exercises.map((exercise) => {
        const top = topLoggedWeight(exercise);
        const target = topTargetSet(exercise);
        return (
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
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>
                  {exercise.movementName}
                </Text>
                <Ionicons name="information-circle-outline" size={13} color={p.dim} />
              </Pressable>
              {isPR(exercise) ? (
                <Pill label="NEW PR" tint={p.accent} background={p.accentSoft} />
              ) : null}
              <View style={{ flex: 1 }} />
              {/* The top weight with its own reps, and a unit: this paired the
                  top weight with the first set's reps, and named no unit. */}
              {target ? (
                <Numeric size={11} color={p.dim} style={{ fontWeight: '500' }}>
                  {`target ${formatIn(target.targetWeight, unit)} ${unit} × ${target.targetReps}`}
                </Numeric>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {exercise.sets.map((set, index) => (
                <View
                  key={set.id}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 7,
                    borderRadius: 11,
                    backgroundColor: p.surfaceAlt,
                  }}
                >
                  <Eyebrow>{`SET ${index + 1}`}</Eyebrow>
                  <Numeric
                    size={14}
                    color={top !== undefined && set.loggedWeight === top ? p.accent : p.text}
                    style={{ marginTop: 2 }}
                  >
                    {set.loggedWeight !== undefined ? formatIn(set.loggedWeight, unit) : '—'}
                  </Numeric>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: p.dim }}>
                    {set.loggedReps !== undefined ? `× ${set.loggedReps}` : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })}

      {workout.coachNote.trim() ? (
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
            initials={initialsOf(coachName)}
            size={24}
            tint={p.onAccent}
            background={p.accent}
          />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: p.text }}>
            {workout.coachNote}
          </Text>
        </View>
      ) : null}

      {footer}
    </ScrollView>
  );
}
