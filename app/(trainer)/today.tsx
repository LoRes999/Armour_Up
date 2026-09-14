import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { Card, EmptyState, Numeric, Title } from '../../src/components/ui';
import { plural, totalSets } from '../../src/models';
import { SyncPill } from '../../src/components/SyncPill';

export default function TrainerToday() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();

  // Via the store, not a local re-implementation. The inline version here omitted
  // the loggedBy === 'trainer' clause, so a client's solo session appeared on this
  // tab and opened a live-log screen whose Log button silently refused to write.
  // This is also the query behind the roster's TODAY badge, so the two now agree.
  const sessions = store.clients
    .map((client) => {
      const workout = store.todayWorkoutFor(client.id);
      return workout ? { client, workout } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => new Date(a.workout.date).getTime() - new Date(b.workout.date).getTime());

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 12 }}
      >
        <Title>Today</Title>
        <SyncPill />
        {sessions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing scheduled"
          message="No sessions booked for today."
        />
      ) : (
        sessions.map(({ client, workout }) => (
          <Pressable
            key={workout.id}
            onPress={() =>
              router.push({
                pathname: '/session/[id]',
                params: { id: workout.id, clientId: client.id },
              })
            }
          >
            <Card
              radius={16}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                padding: 13,
                minHeight: 56,
              }}
            >
              <View style={{ width: 62, alignItems: 'center' }}>
                <Numeric size={14} color={p.accent}>
                  {new Date(workout.date).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Numeric>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>{client.name}</Text>
                <Text style={{ fontSize: 12, color: p.dim, marginTop: 2 }}>
                  {`${workout.name} · ${plural(totalSets(workout), 'set')}`}
                </Text>
              </View>

              {workout.status === 'inProgress' ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: p.accent,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '800', color: p.onAccent }}>LIVE</Text>
                </View>
              ) : null}

              <Ionicons name="chevron-forward" size={16} color={p.dim} />
            </Card>
          </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
