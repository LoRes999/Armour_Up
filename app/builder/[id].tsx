import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette, webHitArea } from '../../src/theme';
import {
  Card,
  DashedButton,
  EmptyState,
  Eyebrow,
  Numeric,
  PrimaryButton,
  RepStepper,
  WeightStepper,
  keyboardAware,
} from '../../src/components/ui';
import { DayTypeChip, DayTypeSheet } from '../../src/components/DayTypePicker';
import {
  ExerciseEntry,
  DEFAULT_UNIT,
  formatIn,
  schemeSummary,
  topLoggedWeight,
  topTargetWeight,
  totalSets,
} from '../../src/models';
import { confirm } from '../../src/confirm';
import { sameValue } from '../../src/sync/diff';
import { useConfirmDiscard } from '../../src/useConfirmDiscard';
import { useCelebration } from '../../src/celebration/CelebrationProvider';

export default function Builder() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const { celebrate } = useCelebration();
  // `fresh`: "New workout" created this one on the way in.
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();

  const workout = store.workout(id);
  const client = workout ? store.client(workout.clientId) : undefined;
  const unit = client?.unit ?? DEFAULT_UNIT;

  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(trainer)/clients'));

  // Every edit saves as it is made, so Cancel undoes from a copy kept on the
  // way in (Ryan's call, 2026-09-13): it puts the workout back, or removes one
  // "New workout" made for this visit. A swipe down or Android back after a
  // change asks first, like every other form.
  const [original] = useState(() => store.workout(id));
  const isNew = fresh === '1';
  const dirty = workout !== undefined && !sameValue(workout, original);
  const undo = () => {
    if (isNew) store.removeWorkout(id);
    else if (original) store.restoreWorkout(original);
  };
  const leave = useConfirmDiscard(
    dirty,
    isNew ? 'This workout will not be added.' : 'Your edits to this workout will be lost.',
    undo
  );

  if (!workout) {
    // The header has to be configured here too. The root layout sets
    // headerShown: false, and a modal has no swipe dismiss on the web, so
    // returning early without it leaves no way out.
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Workout builder',
            headerLeft: () => (
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" style={webHitArea}>
                <Text style={{ color: p.accent, fontSize: 16 }}>Close</Text>
              </Pressable>
            ),
          }}
        />
        <EmptyState
          icon="document-outline"
          title="Workout not found"
          message="This workout has been removed."
        />
      </>
    );
  }

  const firstName = client?.name.split(' ')[0] ?? 'client';
  const currentOpen = openExercise ?? workout.exercises[0]?.id ?? null;

  /** Keeps the time of day, moves the calendar day. */
  const shiftDate = (days: number) => {
    const next = new Date(workout.date);
    next.setDate(next.getDate() + days);
    store.setWorkoutDate(workout.id, next.toISOString());
  };

  /**
   * The one "send" moment. Save and Cancel stay silent — they close an edit —
   * but assigning is the trainer handing something to a person. assignWorkout
   * answers false after the first time and for an empty workout, so neither a
   * re-save nor a blank session gets confetti.
   */
  const assign = () => {
    const firstTime = store.assignWorkout(workout.id);
    leave(close);
    if (firstTime && client) {
      celebrate({
        kind: 'assigned',
        clientName: client.name,
        workoutName: workout.name,
        exerciseCount: workout.exercises.length,
        date: workout.date,
      });
    }
  };

  const dateLabel = (() => {
    const when = new Date(workout.date);
    const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const offset = Math.round((midnight(when) - midnight(new Date())) / 86_400_000);
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    if (offset === -1) return 'Yesterday';
    return when.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  })();

  const confirmDelete = () =>
    confirm({
      title: 'Delete this workout?',
      message: `${workout.name} will be removed from ${firstName}'s program.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        const doomed = workout.id;
        leave(close);
        store.removeWorkout(doomed);
      },
    });

  const lastTimeText = (exercise: ExerciseEntry) => {
    if (!client) return 'First time programmed';
    const previous = store
      .historyFor(client.id)
      .find((w) => w.exercises.some((e) => e.movementName === exercise.movementName));
    const match = previous?.exercises.find((e) => e.movementName === exercise.movementName);
    const top = match ? topLoggedWeight(match) : undefined;
    if (!match || top === undefined) return 'First time programmed';
    const reps = [...match.sets].reverse().find((s) => s.loggedWeight === top)?.loggedReps;
    return `Last time · ${formatIn(top, unit)} ${unit} × ${reps ?? '—'}`;
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Workout builder',
          headerLeft: () => (
            <Pressable
              // Close first, then undo: undoing a new workout removes the
              // record this screen is reading, and doing it first showed
              // "Workout not found" for a frame on the way out.
              onPress={() =>
                leave(() => {
                  close();
                  undo();
                })
              }
              hitSlop={8}
              accessibilityRole="button"
              style={webHitArea}
            >
              <Text style={{ color: p.accent, fontSize: 16 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => leave(close)} hitSlop={8} accessibilityRole="button" style={webHitArea}>
              <Text style={{ color: p.accent, fontSize: 16, fontWeight: '700' }}>Save</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView {...keyboardAware} contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 24, gap: 12 }}>
        <TextInput
          value={workout.name}
          onChangeText={(text) => store.renameWorkout(workout.id, text)}
          // A name emptied and left that way used to be saved blank, a nameless
          // card on both phones. It gets its name back.
          onBlur={() => {
            if (!workout.name.trim()) {
              store.renameWorkout(workout.id, original?.name.trim() || 'Workout');
            }
          }}
          maxLength={60}
          placeholder="Workout name"
          placeholderTextColor={p.dim}
          style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.8, color: p.text }}
        />
        <Text style={{ fontSize: 13, color: p.dim, marginTop: -6 }}>
          {client?.name ?? 'Client'}
        </Text>

        {/* Clients see this on the workout, but nothing could write one before
            (Ryan's call, 2026-09-13). */}
        <TextInput
          value={workout.coachNote}
          onChangeText={(text) => store.setCoachNote(workout.id, text)}
          placeholder={`Note for ${client?.name.split(' ')[0] ?? 'your client'}`}
          placeholderTextColor={p.dim}
          multiline
          maxLength={500}
          accessibilityLabel="Note for your client"
          style={{
            minHeight: 64,
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderRadius: metrics.controlRadius,
            backgroundColor: p.surfaceAlt,
            color: p.text,
            fontSize: 14,
            lineHeight: 20,
            textAlignVertical: 'top',
          }}
        />

        {/* The date was static text and createWorkout always stamped "now", so
            every session a trainer built landed on today and there was no way
            to programme next Tuesday. setWorkoutDate existed with no callers. */}
        <Card radius={15} style={{ padding: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={() => shiftDate(-1)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Day earlier"
              style={{
                width: metrics.hitTarget,
                height: metrics.hitTarget,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-back" size={17} color={p.accent} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Eyebrow>{dateLabel === 'Today' ? 'SCHEDULED' : 'SCHEDULED FOR'}</Eyebrow>
              <Text style={{ fontSize: 14, fontWeight: '700', color: p.text, marginTop: 1 }}>
                {dateLabel}
              </Text>
            </View>
            <Pressable
              onPress={() => shiftDate(1)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Day later"
              style={{
                width: metrics.hitTarget,
                height: metrics.hitTarget,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-forward" size={17} color={p.accent} />
            </Pressable>
          </View>
        </Card>

        <DayTypeChip
          dayType={store.dayType(workout.dayTypeId)}
          onPress={() => setPickingDay(true)}
        />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip value={String(workout.exercises.length)} label="exercises" />
          <Chip value={String(totalSets(workout))} label="sets" />
        </View>

        {workout.exercises.map((exercise, position) => {
          const open = currentOpen === exercise.id;
          return (
            <Card key={exercise.id} style={{ padding: 15 }}>
              <Pressable
                onPress={() => setOpenExercise(open ? '' : exercise.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: metrics.hitTarget }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>
                    {exercise.movementName}
                  </Text>
                  <Text style={{ fontSize: 11, color: p.dim, marginTop: 2 }}>
                    {open
                      ? lastTimeText(exercise)
                      : `${schemeSummary(exercise)} · ${formatIn(topTargetWeight(exercise), unit)} ${unit}`}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={p.dim} />
              </Pressable>

              {open ? (
                <View style={{ marginTop: 8, gap: 5 }}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    <View style={{ width: 24 }}>
                      <Eyebrow>SET</Eyebrow>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Eyebrow>WEIGHT</Eyebrow>
                    </View>
                    <View style={{ width: 92, alignItems: 'center' }}>
                      <Eyebrow>REPS</Eyebrow>
                    </View>
                  </View>

                  {exercise.sets.map((set, setIndex) => {
                    const active = setIndex === exercise.sets.length - 1;
                    return (
                      <View
                        key={set.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: active ? p.accent : p.surfaceAlt,
                          }}
                        >
                          <Text
                            style={{ fontSize: 11, fontWeight: '800', color: active ? p.onAccent : p.dim }}
                          >
                            {setIndex + 1}
                          </Text>
                        </View>

                        <View
                          style={{
                            flex: 1,
                            height: metrics.hitTarget,
                            borderRadius: metrics.controlRadius,
                            backgroundColor: active ? p.accentSoft : p.surfaceAlt,
                            borderWidth: 1,
                            borderColor: active ? p.accent : 'transparent',
                            justifyContent: 'center',
                          }}
                        >
                          <WeightStepper
                            unit={unit}
                            value={set.targetWeight}
                            onChange={(next) =>
                              store.setTargetWeight(workout.id, position, setIndex, next)
                            }
                          />
                        </View>

                        {/* The column is headed REPS, so the box needs no label. */}
                        <View style={{ width: 92, alignItems: 'center' }}>
                          <RepStepper
                            value={set.targetReps}
                            showLabel={false}
                            onChange={(next) => store.setTargetReps(workout.id, position, setIndex, next)}
                          />
                        </View>
                      </View>
                    );
                  })}

                  {/* Deleting a set used to be a long-press on the row, but the
                      steppers filling the row caught the touch first, so it only
                      worked on the tiny set number. Removing the last set is the
                      mirror of adding one, and it sits right beside it. */}
                  <View style={{ marginTop: 2, flexDirection: 'row', gap: 8 }}>
                    {exercise.sets.length > 1 ? (
                      <View style={{ flex: 1 }}>
                        <DashedButton
                          title="Remove set"
                          icon="remove"
                          color={p.dim}
                          onPress={() =>
                            store.removeSet(workout.id, position, exercise.sets.length - 1)
                          }
                          height={40}
                        />
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <DashedButton
                        title="Add set"
                        onPress={() => store.addSet(workout.id, position)}
                        height={40}
                      />
                    </View>
                  </View>

                  {/* A mis-added exercise used to mean deleting the whole
                      workout (Ryan's call, 2026-09-13). */}
                  <Pressable
                    onPress={() =>
                      confirm({
                        title: `Remove ${exercise.movementName}?`,
                        confirmLabel: 'Remove',
                        cancelLabel: 'Keep',
                        destructive: true,
                        onConfirm: () => store.removeExercise(workout.id, position),
                      })
                    }
                    accessibilityRole="button"
                    style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: p.danger }}>Remove exercise</Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          );
        })}

        <DashedButton title="Add exercise" onPress={() => setPicking(true)} color={p.dim} height={48} />

        <View style={{ marginTop: 4 }}>
          <PrimaryButton title={`Assign to ${firstName}`} onPress={assign} />

          {/* removeWorkout was only ever reachable from the client's solo
              Discard, so a workout created here could not be undone. */}
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={{
              minHeight: metrics.hitTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.danger }}>Delete workout</Text>
          </Pressable>
        </View>
      </ScrollView>

      <DayTypeSheet
        visible={pickingDay}
        selectedId={workout.dayTypeId}
        onSelect={(dayTypeId) => store.setWorkoutDayType(workout.id, dayTypeId)}
        onClose={() => setPickingDay(false)}
      />

      <MovementPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(movement) => {
          store.addExercise(workout.id, movement);
          setPicking(false);
        }}
      />
    </SafeAreaView>
  );
}

function Chip({ value, label }: { value: string; label: string }) {
  const p = usePalette();
  return (
    <Card
      radius={999}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 5,
        paddingHorizontal: 13,
        paddingVertical: 7,
      }}
    >
      <Numeric size={15}>{value}</Numeric>
      <Text style={{ fontSize: 11, fontWeight: '600', color: p.dim }}>{label}</Text>
    </Card>
  );
}

function MovementPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (movement: string) => void;
}) {
  const p = usePalette();
  const store = useStore();
  const [search, setSearch] = useState('');
  // The trainer's own movements are programmable the moment they exist.
  const catalogue = store.allMovements();
  const results = search
    ? catalogue.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
    : catalogue;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: metrics.screenPadding,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: p.text }}>Add exercise</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: p.accent }}>Cancel</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: metrics.screenPadding }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search movements"
            placeholderTextColor={p.dim}
            style={{
              minHeight: 40,
              paddingHorizontal: 13,
              borderRadius: metrics.controlRadius,
              backgroundColor: p.surfaceAlt,
              color: p.text,
              fontSize: 14,
            }}
          />
        </View>

        <ScrollView {...keyboardAware} contentContainerStyle={{ padding: metrics.screenPadding, gap: 8 }}>
          {/* A search that found nothing used to leave a blank list. Same
              wording as the Library's search. */}
          {results.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No match"
              message={`Nothing in the library matches "${search}".`}
            />
          ) : (
            results.map((movement) => (
              <Pressable accessibilityRole="button" key={movement} onPress={() => onPick(movement)}>
                <Card
                  radius={14}
                  style={{ paddingHorizontal: 14, minHeight: metrics.hitTarget, justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: p.text }}>{movement}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
