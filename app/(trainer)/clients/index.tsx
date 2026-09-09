import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../../src/store';
import { metrics, usePalette } from '../../../src/theme';
import {
  Avatar,
  Card,
  EmptyState,
  PrimaryButton,
  SegmentedPicker,
} from '../../../src/components/ui';
import { Client, initialsOf } from '../../../src/models';

type Filter = 'today' | 'all' | 'flagged';

export default function Roster() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const [filter, setFilter] = useState<Filter>('today');
  const [search, setSearch] = useState('');

  const base =
    filter === 'today'
      ? store.clientsWithSessionToday()
      : filter === 'flagged'
        ? store.lapsedClients()
        : store.clients;

  const visible = search
    ? base.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : base;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: p.background }}
      contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            height: 40,
            paddingHorizontal: 13,
            borderRadius: metrics.controlRadius,
            backgroundColor: p.surfaceAlt,
          }}
        >
          <Ionicons name="search" size={16} color={p.dim} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search clients"
            placeholderTextColor={p.dim}
            style={{ flex: 1, fontSize: 14, color: p.text }}
          />
        </View>
        <Pressable
          onPress={() => router.push('/invite')}
          accessibilityRole="button"
          accessibilityLabel="Invite a client"
          style={{
            width: metrics.hitTarget,
            height: metrics.hitTarget,
            borderRadius: metrics.controlRadius,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: p.accentSoft,
          }}
        >
          <Ionicons name="add" size={22} color={p.accent} />
        </Pressable>
      </View>

      <SegmentedPicker
        options={['today', 'all', 'flagged'] as const}
        labels={{ today: 'Today', all: 'All', flagged: 'Flagged' }}
        value={filter}
        onChange={setFilter}
      />

      {/* An empty roster is not the same as an empty filter. A trainer who has
          just subscribed used to be told "Nobody matches this filter" and left
          to find the unlabelled + on their own. */}
      {store.clients.length === 0 ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <EmptyState
            icon="person-add-outline"
            title="No clients yet"
            message="Invite someone and they get a six-character code. They join free, and their programme is waiting when they do."
          />
          <PrimaryButton
            title="Invite your first client"
            icon="add"
            onPress={() => router.push('/invite')}
          />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No clients here"
          message={
            search
              ? 'Nobody matches that search.'
              : filter === 'today'
                ? 'Nobody is scheduled today.'
                : 'Nobody matches this filter.'
          }
        />
      ) : (
        visible.map((client) => <ClientRow key={client.id} client={client} />)
      )}
    </ScrollView>
  );
}

function ClientRow({ client }: { client: Client }) {
  const p = usePalette();
  const store = useStore();

  const next = store.upcomingFor(client.id)[0];
  const last = store.historyFor(client.id)[0];
  const lapsed = store.lapsedClients().some((c) => c.id === client.id);
  const today = store.clientsWithSessionToday().some((c) => c.id === client.id);

  let subtitle = 'No sessions yet';
  if (next) {
    const when = new Date(next.date);
    const isToday = when.toDateString() === new Date().toDateString();
    subtitle = isToday
      ? `${next.name} · today ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : `${next.name} · ${when.toLocaleDateString(undefined, { weekday: 'short' })}`;
  } else if (last) {
    // Calendar days, not raw milliseconds rounded: a session finished this
    // morning used to read "in 0 days", and one from last night "in 1 days".
    const startOfDay = (input: Date) =>
      new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
    const days = Math.max(
      0,
      Math.round((startOfDay(new Date()) - startOfDay(new Date(last.date))) / 86_400_000)
    );
    subtitle =
      days === 0
        ? 'Last session today'
        : `No session logged in ${days} day${days === 1 ? '' : 's'}`;
  }

  const badge = lapsed
    ? { text: 'LAPSED', bg: p.accentSoft, fg: p.coral }
    : today
      ? { text: 'TODAY', bg: p.accentSoft, fg: p.accent }
      : { text: 'ON TRACK', bg: p.surfaceAlt, fg: p.dim };

  return (
    <Link href={{ pathname: '/(trainer)/clients/[id]', params: { id: client.id } }} asChild>
      <Pressable>
        <Card
          radius={16}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 13,
            paddingVertical: 11,
            minHeight: 56,
          }}
        >
          <Avatar initials={initialsOf(client.name)} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>{client.name}</Text>
            <Text style={{ fontSize: 12, color: p.dim, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: badge.bg,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: badge.fg }}>
              {badge.text}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={p.dim} />
        </Card>
      </Pressable>
    </Link>
  );
}
