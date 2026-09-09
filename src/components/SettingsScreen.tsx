import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Appearance, useStore } from '../store';
import { metrics, tagColor, usePalette } from '../theme';
import { Avatar, Card, Eyebrow, SegmentedPicker, Title } from './ui';
import { DayType, UNITS, WeightUnit, initialsOf, unitName } from '../models';
import { DayTypeEditor } from './DayTypePicker';
import { TRAINER_NAME } from '../sampleData';
import { confirm, notify } from '../confirm';
import { exportData } from '../exportData';

/** Shared by the trainer's Settings tab and the client's Profile tab. */
export default function SettingsScreen() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const client = store.currentClient();
  // 'new' opens a blank editor; a DayType opens it loaded for editing.
  const [editing, setEditing] = useState<DayType | 'new' | null>(null);

  const confirmSignOut = () =>
    confirm({
      title: 'Sign out?',
      message: 'You can sign back in as either side.',
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: () => {
        store.signOut();
        router.replace('/');
      },
    });

  /** A trainer exports the roster; a client exports only themselves. */
  const runExport = () => {
    const mine = client ? [client] : store.clients;
    void exportData({
      role: store.role === 'trainer' ? 'trainer' : 'client',
      clients: mine,
      workouts: store.workouts.filter((w) => mine.some((c) => c.id === w.clientId)),
      dayTypes: store.dayTypes,
    });
  };

  const showPrivacy = () =>
    notify({
      title: 'Privacy Policy',
      message:
        'This app stores your training data on this device only. There is no server, no account database and no analytics, so nothing is transmitted anywhere. Deleting your account from this screen removes the data immediately and permanently.',
    });

  const showVisibility = () =>
    notify({
      title: store.role === 'trainer' ? 'What clients can see' : `What ${TRAINER_NAME} can see`,
      message:
        store.role === 'trainer'
          ? 'Clients see the sessions you programme for them, every set you log, your coach notes, and their own history and records. They cannot see other clients, your roster, or anything about your subscription.'
          : `${TRAINER_NAME} sees the sessions they programme for you, the sets logged in them, and any session you repeat on your own. Your unit preference and appearance settings are yours alone.`,
    });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 14 }}
      >
        <Title>{store.role === 'trainer' ? 'Settings' : 'Profile'}</Title>
      <Card
        radius={17}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, minHeight: 56 }}
      >
        <Avatar initials={client ? initialsOf(client.name) : '—'} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: p.text }}>
            {store.role === 'trainer' ? TRAINER_NAME : (client?.name ?? 'Client')}
          </Text>
          <Text style={{ fontSize: 12, color: p.dim }}>
            {store.role === 'trainer'
              ? `${store.clients.length} clients`
              : `Coached by ${TRAINER_NAME}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={p.dim} />
      </Card>

      {/* Units are a per-client preference, and a trainer has no client record
          of their own — the control was previously rendered for them too, pinned
          to one value with every tap swallowed by the `client &&` guard. */}
      {client ? (
        <Section title="UNITS">
          <SegmentedPicker
            options={UNITS}
            labels={{ kg: unitName('kg'), lb: unitName('lb') }}
            value={client.unit}
            onChange={(next) => store.setClientUnit(client.id, next)}
            height={38}
          />
        </Section>
      ) : null}

      <Section title="APPEARANCE">
        <SegmentedPicker
          options={['light', 'dark', 'system'] as const}
          labels={{ light: 'Light', dark: 'Dark', system: 'System' }}
          value={store.appearance as Appearance}
          onChange={store.setAppearance}
          height={38}
        />
      </Section>

      {store.role === 'trainer' ? (
        <Section title="SUBSCRIPTION">
          <Card radius={15}>
            <View
              style={{
                height: 46,
                paddingHorizontal: 13,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                {store.subscription?.plan === 'annual' ? 'Annual plan' : 'Monthly plan'}
              </Text>
              <Text style={{ fontSize: 12, color: p.dim }}>
                {store.subscription
                  ? `Renews ${new Date(store.subscription.renewsAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : '—'}
              </Text>
            </View>
            <Divider />
            <Pressable onPress={() => store.restorePurchase()}>
              <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                  Restore purchases
                </Text>
              </View>
            </Pressable>
            {/* Only exists while purchases are mocked. Without it there is no
                way to reach the lapsed paywall without editing code. */}
            {store.expireSubscriptionForDemo ? (
              <>
                <Divider />
                <Pressable
                  onPress={() => {
                    store.expireSubscriptionForDemo?.();
                    router.replace('/');
                  }}
                >
                  <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: p.dim }}>
                      End subscription (demo)
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {store.role === 'trainer' ? (
        <Section title="WORKOUT DAY TYPES">
          <Card radius={15}>
            {store.dayTypes.map((dayType, index) => (
              <View key={dayType.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable onPress={() => setEditing(dayType)}>
                  <View
                    style={{
                      minHeight: 46,
                      paddingHorizontal: 13,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 11,
                    }}
                  >
                    <View
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 3,
                        backgroundColor: tagColor(p, dayType.colorIndex),
                      }}
                    />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: p.text }}>
                      {dayType.name}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: p.dim }}>
                      {dayType.shortLabel}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={p.dim} />
                  </View>
                </Pressable>
              </View>
            ))}
            {store.dayTypes.length ? <Divider /> : null}
            <Pressable onPress={() => setEditing('new')}>
              <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>
                  Add day type
                </Text>
              </View>
            </Pressable>
          </Card>
          <Text style={{ fontSize: 11, color: p.dim }}>
            These label and colour the days on your clients' calendars.
          </Text>
        </Section>
      ) : null}

      {/* A fresh install is empty, which is correct but leaves nothing to look
          at — and no invite code, so the client side is unreachable. This is
          how a reviewer populates the app, and how it gets emptied again. */}
      {store.role === 'trainer' ? (
        <Section title="SAMPLE DATA">
          <Card radius={15}>
            <Pressable
              onPress={
                store.hasSampleData
                  ? () =>
                      confirm({
                        title: 'Remove sample data?',
                        message: 'The six demo clients and their history are deleted.',
                        confirmLabel: 'Remove',
                        destructive: true,
                        onConfirm: store.clearSampleData,
                      })
                  : store.loadSampleData
              }
              accessibilityRole="button"
            >
              <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                  {store.hasSampleData ? 'Remove sample data' : 'Load sample data'}
                </Text>
              </View>
            </Pressable>
          </Card>
          <Text style={{ fontSize: 11, color: p.dim }}>
            Six invented clients with training history, for trying the app out.
          </Text>
        </Section>
      ) : null}

      <Section title="PRIVACY & DATA">
        <Card radius={15}>
          <NavRow label="Privacy Policy" onPress={showPrivacy} />
          <Divider />
          <NavRow
            label={
              store.role === 'trainer'
                ? 'What clients can see'
                : `What ${TRAINER_NAME.split(' ')[0]} can see`
            }
            onPress={showVisibility}
          />
          <Divider />
          <NavRow label="Export my data" last onPress={runExport} />
        </Card>
      </Section>

      <Section title="ACCOUNT">
        <Card radius={15}>
          <Pressable onPress={confirmSignOut}>
            <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>Sign out</Text>
            </View>
          </Pressable>
          <Divider />
          <Pressable onPress={() => router.push('/delete-account')}>
            <View style={{ height: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: p.danger }}>Delete account</Text>
            </View>
          </Pressable>
        </Card>
      </Section>

      <Text style={{ fontSize: 10, color: p.dim, textAlign: 'center' }}>Version 1.0.0 (build 24)</Text>
      </ScrollView>

      <DayTypeEditor
        visible={editing !== null}
        initial={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onDelete={
          editing && editing !== 'new'
            ? () => {
                const target = editing;
                confirm({
                  title: 'Delete day type?',
                  message: `"${target.name}" will be removed.`,
                  confirmLabel: 'Delete',
                  destructive: true,
                  onConfirm: () => {
                    store.removeDayType(target.id);
                    setEditing(null);
                  },
                });
              }
            : undefined
        }
        onSave={(name, shortLabel, colorIndex) => {
          if (editing && editing !== 'new') {
            store.updateDayType(editing.id, { name, shortLabel, colorIndex });
          } else {
            store.addDayType(name, shortLabel, colorIndex);
          }
          setEditing(null);
        }}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function NavRow({
  label,
  last,
  onPress,
}: {
  label: string;
  last?: boolean;
  onPress?: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View
        style={{
          height: 46,
          paddingHorizontal: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>{label}</Text>
        <Ionicons name="chevron-forward" size={14} color={p.dim} />
      </View>
    </Pressable>
  );
}

function Divider() {
  const p = usePalette();
  return <View style={{ height: 1, backgroundColor: p.border }} />;
}
