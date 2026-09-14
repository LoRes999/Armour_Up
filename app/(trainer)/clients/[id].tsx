import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { isMissedSession, useStore } from '../../../src/store';
import { metrics, usePalette } from '../../../src/theme';
import {
  Avatar,
  Card,
  EmptyState,
  Eyebrow,
  Numeric,
  Pill,
  PrimaryButton,
  SegmentedPicker,
  StatTile,
} from '../../../src/components/ui';
import {
  formatInviteCode,
  DEFAULT_UNIT,
  formatIn,
  isSolo,
  initialsOf,
  loggedSets,
  totalSets,
} from '../../../src/models';
import { confirm, notify } from '../../../src/confirm';
import { useAuth } from '../../../src/auth';

type Tab = 'program' | 'history' | 'prs';

export default function ClientDetail() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('program');

  const client = store.client(id);

  if (!client) {
    return (
      <EmptyState
        icon="person-remove-outline"
        title="Client not found"
        message="This client is no longer on your roster."
      />
    );
  }

  const unit = client.unit;
  const relativeDay = (iso: string) => {
    const date = new Date(iso);
    const today = new Date().toDateString();
    const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
    if (date.toDateString() === today) return 'Today';
    if (date.toDateString() === tomorrow) return 'Tomorrow';
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <>
      <Stack.Screen options={{ title: client.name }} />
      <ScrollView
        style={{ backgroundColor: p.background }}
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar initials={initialsOf(client.name)} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.6, color: p.text }}>
              {client.name}
            </Text>
            <Text style={{ fontSize: 12, color: p.dim, marginTop: 2 }}>
              {`${client.blockName} · week ${client.blockWeek} of ${client.blockLength} · ${unit}`}
            </Text>
          </View>
        </View>

        {/* The code is how this person gets into the app at all, so it lives
            on their profile rather than only on the screen that created it. */}
        <Card
          radius={15}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 13,
            paddingVertical: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Eyebrow>INVITE CODE</Eyebrow>
            <Text
              selectable
              style={{
                fontSize: 17,
                fontWeight: '800',
                letterSpacing: 2,
                color: p.text,
                marginTop: 2,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatInviteCode(client.inviteCode)}
            </Text>
          </View>
          <Pill
            label={client.inviteAccepted ? 'JOINED' : 'PENDING'}
            tint={client.inviteAccepted ? p.success : p.dim}
          />
          <Pressable
            onPress={() =>
              confirm({
                title: 'Issue a new code?',
                // With accounts, a new code also signs out whoever joined with
                // the old one, so a code that reached the wrong person can be
                // taken back. Wording chosen by Ryan, 2026-09-13.
                ...(store.cloudActive && client.inviteAccepted
                  ? {
                      message: `${client.name.split(' ')[0]} will be signed out and needs the new code to get back in. Their current code stops working straight away.`,
                      confirmLabel: 'Issue new code',
                    }
                  : {
                      message: `${client.name.split(' ')[0]}'s current code stops working straight away.`,
                      confirmLabel: 'New code',
                    }),
                destructive: true,
                // With accounts the server issues it, so no two coaches share a code.
                onConfirm: () => {
                  if (!store.cloudActive) {
                    store.regenerateInviteCode(client.id);
                    return;
                  }
                  auth.regenerateInviteCode(client.id).catch((failure: Error) =>
                    notify({ title: 'No new code yet', message: failure.message })
                  );
                },
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.accent }}>New code</Text>
          </Pressable>
        </Card>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatTile label="SESSIONS" value={String(client.sessionsCompleted)} />
          <StatTile label="ADHERENCE" value={`${client.adherence}%`} tint={p.success} />
          <StatTile label="WEEK SETS" value={String(store.weekSets(client.id))} />
        </View>

        <SegmentedPicker
          options={['program', 'history', 'prs'] as const}
          labels={{ program: 'Program', history: 'History', prs: 'PRs' }}
          value={tab}
          onChange={setTab}
        />

        {tab === 'program' &&
          (store.upcomingFor(client.id).length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Nothing scheduled"
              message="Build their next session below."
            />
          ) : (
            store.upcomingFor(client.id).map((workout) => (
              <Pressable
                key={workout.id}
                onPress={() =>
                  // A missed session can still be logged (Ryan's call, 2026-09-13):
                  // it used to open only the builder, so it could never be finished.
                  isMissedSession(workout)
                    ? confirm({
                        title: 'Missed session',
                        message: `${workout.name}, ${relativeDay(workout.date)}.`,
                        confirmLabel: 'Log it now',
                        cancelLabel: 'Edit',
                        onConfirm: () =>
                          router.push({
                            pathname: '/session/[id]',
                            params: { id: workout.id, clientId: client.id },
                          }),
                        onCancel: () =>
                          router.push({ pathname: '/builder/[id]', params: { id: workout.id } }),
                      })
                    : router.push({ pathname: '/builder/[id]', params: { id: workout.id } })
                }
              >
                <Row
                  title={workout.name}
                  subtitle={`${isMissedSession(workout) ? 'Missed · ' : ''}${relativeDay(workout.date)} · ${workout.exercises.length} ${
                    workout.exercises.length === 1 ? 'exercise' : 'exercises'
                  } · ${totalSets(workout)} ${totalSets(workout) === 1 ? 'set' : 'sets'}`}
                  value={new Date(workout.date).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  unit=""
                />
              </Pressable>
            ))
          ))}

        {tab === 'history' &&
          (store.historyFor(client.id).length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="No sessions yet"
              message="Logged sessions will appear here."
            />
          ) : (
            store
              .historyFor(client.id)
              .slice(0, 8)
              .map((workout) => (
                <Pressable
                  key={workout.id}
                  onPress={() =>
                    router.push({
                      pathname: '/(trainer)/clients/session/[id]',
                      params: { id: workout.id },
                    })
                  }
                >
                  <Row
                    title={workout.name}
                    subtitle={`${new Date(workout.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${loggedSets(workout)} sets · ${workout.durationMinutes ?? 0} min`}
                    value={String(loggedSets(workout))}
                    unit="SETS"
                    badge={isSolo(workout) ? 'SOLO' : undefined}
                  />
                </Pressable>
              ))
          ))}

        {tab === 'prs' &&
          (store.personalRecords(client.id).length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title="No records yet"
              message="Personal bests appear once sets are logged."
            />
          ) : (
            store
              .personalRecords(client.id)
              .slice(0, 8)
              .map((record) => (
                <Row
                  key={record.movementName}
                  title={record.movementName}
                  subtitle={
                    record.previousWeight !== undefined
                      ? `${new Date(record.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · was ${formatIn(record.previousWeight, unit)} ${unit}`
                      : `${new Date(record.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · first recorded`
                  }
                  value={formatIn(record.weight, unit)}
                  unit={`${unit.toUpperCase()} × ${record.reps}`}
                  valueTint={p.success}
                />
              ))
          ))}

        <PrimaryButton
          title="New workout"
          icon="add"
          onPress={() => {
            const workoutId = store.createWorkout(client.id);
            router.push({ pathname: '/builder/[id]', params: { id: workoutId, fresh: '1' } });
          }}
        />
      </ScrollView>
    </>
  );
}

export function Row({
  title,
  subtitle,
  value,
  unit,
  valueTint,
  badge,
}: {
  title: string;
  subtitle: string;
  value: string;
  unit: string;
  valueTint?: string;
  badge?: string;
}) {
  const p = usePalette();
  return (
    <Card
      radius={16}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        minHeight: 56,
      }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>{title}</Text>
          {badge ? <Pill label={badge} /> : null}
        </View>
        <Text style={{ fontSize: 12, color: p.dim, marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Numeric size={15} color={valueTint}>
          {value}
        </Numeric>
        {unit ? <Eyebrow>{unit}</Eyebrow> : null}
      </View>
    </Card>
  );
}
