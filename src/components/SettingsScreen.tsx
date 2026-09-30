import React, { useState } from 'react';
import Constants from 'expo-constants';
import { openHosted, openSupport } from '../legal';
import type { LegalDocId } from '../legalContent';
import { Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Appearance, useStore } from '../store';
import { metrics, tagColor, usePalette } from '../theme';
import { Avatar, Card, Eyebrow, SegmentedPicker, Title } from './ui';
import { DayType, UNITS, WeightUnit, initialsOf, plural, unitName } from '../models';
import { DayTypeEditor } from './DayTypePicker';
import { useAuth, useCoachFirstName, useCoachName } from '../auth';
import { NOTIFICATION_GROUPS, prefLabels } from '../notificationPrefs';
import type { SyncStatus } from '../sync/types';
import { confirm, notify } from '../confirm';
import { exportData } from '../exportData';
import { purchases } from '../purchases';

/** Shared by the trainer's Settings tab and the client's Profile tab. */
/**
 * Read from the manifest rather than typed in. This used to read
 * "Version 1.0.0 (build 24)" — a build number that existed nowhere, and the
 * first thing anybody checks when a bug report says which version they are on.
 */
function versionLabel(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? '1.0.0';
  // Each platform numbers its builds separately. Reading iOS's first meant an
  // Android phone showed the iOS build number whenever both were set.
  const build =
    Platform.OS === 'ios'
      ? config?.ios?.buildNumber
      : Platform.OS === 'android' && config?.android?.versionCode !== undefined
        ? String(config.android.versionCode)
        : undefined;
  return build ? `Version ${version} (build ${build})` : `Version ${version}`;
}

export default function SettingsScreen() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const client = store.currentClient();
  const auth = useAuth();
  const coachName = useCoachName();
  const coachFirstName = useCoachFirstName();
  // With accounts: the email, notification switches, password and sync rows.
  const cloud = auth.status !== 'off';
  // 'new' opens a blank editor; a DayType opens it loaded for editing.
  const [editing, setEditing] = useState<DayType | 'new' | null>(null);

  const confirmSignOut = () => {
    const waiting = cloud ? store.syncStatus.pending : 0;
    confirm({
      title: 'Sign out?',
      message:
        waiting > 0
          ? `${waiting === 1 ? "1 change hasn't" : `${waiting} changes haven't`} reached the cloud yet. If you sign out now they'll be lost.`
          : cloud
            ? 'You can sign back in any time.'
            : 'You can sign back in as either side.',
      confirmLabel: waiting > 0 ? 'Sign out anyway' : 'Sign out',
      cancelLabel: waiting > 0 ? 'Stay signed in' : 'Cancel',
      destructive: true,
      onConfirm: () => void signOut(),
    });
  };

  const signOut = async () => {
    // auth.signOut also takes this phone's push token off the account.
    if (cloud && auth.uid) await auth.signOut().catch(() => undefined);
    store.signOut();
    router.replace('/');
  };

  const changePassword = () => {
    const email = auth.email;
    if (!email) return;
    auth
      .resetPassword(email)
      .then(() =>
        notify({ title: 'Check your email', message: `We've sent a link to change your password to ${email}.` })
      )
      .catch((failure: Error) => notify({ title: 'No email was sent', message: failure.message }));
  };

  const showSync = () => notify({ title: 'Sync', message: syncDetail(store.syncStatus) });

  const labels = prefLabels(store.role === 'trainer' ? 'trainer' : 'client', coachFirstName);

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

  /**
   * Was an alert holding a three-sentence summary. It is a real document now,
   * generated from docs/privacy.md so the copy here and the copy published for
   * App Store Connect cannot drift apart.
   */
  const openLegal = async (doc: LegalDocId) => {
    if (!(await openHosted(doc))) router.push({ pathname: '/legal/[doc]', params: { doc } });
  };

  const showVisibility = () =>
    notify({
      title: store.role === 'trainer' ? 'What clients can see' : `What ${coachName} can see`,
      message:
        store.role === 'trainer'
          ? 'Clients see the workouts you program for them, every set you log, your coach notes, and their own history and records. They cannot see other clients, your roster, or anything about your subscription.'
          : `${coachName} sees the workouts they program for you, the sets logged in them, and any session you repeat on your own. Your unit preference and appearance settings are yours alone.`,
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
        <Avatar
          initials={
            client
              ? initialsOf(client.name)
              : store.role === 'trainer' && coachName
                ? initialsOf(coachName)
                : '—'
          }
          size={46}
        />
        {/* Details only, so no chevron: it promised a page that didn't exist
            (Ryan's call, 2026-09-14). */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: p.text }}>
            {store.role === 'trainer' ? coachName : (client?.name ?? 'Client')}
          </Text>
          {cloud && auth.email ? (
            <Text style={{ fontSize: 12, color: p.dim }} numberOfLines={1}>
              {auth.email}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: p.dim }}>
            {store.role === 'trainer'
              ? plural(store.clients.length, 'client')
              : `Coached by ${coachName}`}
          </Text>
        </View>
      </Card>

      {cloud && store.role ? (
        <Section title="NOTIFICATIONS">
          <Card radius={15}>
            {NOTIFICATION_GROUPS.map((group, index) => (
              <View key={group}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={{
                    minHeight: 54,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>{labels[group].title}</Text>
                    <Text style={{ fontSize: 11, color: p.dim, marginTop: 1 }}>{labels[group].detail}</Text>
                  </View>
                  <Switch
                    value={auth.profile.prefs[group]}
                    onValueChange={(on) =>
                      void auth
                        .setNotificationPref(group, on)
                        .catch((failure: Error) => notify({ title: 'Not changed', message: failure.message }))
                    }
                    trackColor={{ false: p.surfaceAlt, true: p.success }}
                    accessibilityLabel={labels[group].title}
                  />
                </View>
              </View>
            ))}
          </Card>
          <Text style={{ fontSize: 11, color: p.dim }}>
            Never between 9 PM and 7 AM. At most one motivation or recap message a day.
          </Text>
        </Section>
      ) : null}

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
                minHeight: 46,
                paddingHorizontal: 13,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                {store.subscription?.plan === 'annual'
                  ? 'Annual plan'
                  : store.subscription?.plan === 'complimentary'
                    ? 'Complimentary access'
                    : 'Monthly plan'}
              </Text>
              <Text style={{ fontSize: 12, color: p.dim }}>
                {store.subscription?.renewsAt
                  ? `${store.subscription.willRenew === false ? 'Ends' : 'Renews'} ${new Date(store.subscription.renewsAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : '—'}
              </Text>
            </View>
            {/* Apple's own screen for changing plan or cancelling. Real builds only. */}
            {purchases.manage ? (
              <>
                <Divider />
                <Pressable accessibilityRole="button" onPress={() => void purchases.manage?.()}>
                  <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                      Manage subscription
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}
            <Divider />
            <Pressable accessibilityRole="button" onPress={() => store.restorePurchase()}>
              <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>
                  Restore purchases
                </Text>
              </View>
            </Pressable>
            {/* Development only. It exists to reach the lapsed paywall without
                editing code, and a shipped build must not offer somebody a
                button that ends the subscription they are paying for. */}
            {__DEV__ && store.expireSubscriptionForDemo ? (
              <>
                <Divider />
                <Pressable accessibilityRole="button"
                  onPress={() => {
                    store.expireSubscriptionForDemo?.();
                    router.replace('/');
                  }}
                >
                  <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
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
                <Pressable accessibilityRole="button" onPress={() => setEditing(dayType)}>
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
            <Pressable accessibilityRole="button" onPress={() => setEditing('new')}>
              <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
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
      {/* Not with accounts on: it adds six phone-only demo clients to a real
          roster, and a reviewer signs in to a demo account instead (F12). */}
      {store.role === 'trainer' && !store.cloudActive ? (
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
              <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
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

      <Section title="HELP">
        <Card radius={15}>
          <NavRow label="Contact support" last onPress={() => void openSupport()} />
        </Card>
      </Section>

      <Section title="PRIVACY & DATA">
        <Card radius={15}>
          <NavRow label="Privacy Policy" onPress={() => void openLegal('privacy')} />
          <Divider />
          <NavRow label="Terms of Service" onPress={() => void openLegal('terms')} />
          <Divider />
          <NavRow
            label={
              store.role === 'trainer'
                ? 'What clients can see'
                : `What ${coachFirstName} can see`
            }
            onPress={showVisibility}
          />
          <Divider />
          <NavRow label="Export my data" last onPress={runExport} />
        </Card>
      </Section>

      <Section title="ACCOUNT">
        <Card radius={15}>
          {cloud ? (
            <>
              <NavRow label="Change password" onPress={changePassword} />
              <Divider />
              <Pressable onPress={showSync} accessibilityRole="button">
                <View
                  style={{
                    minHeight: 50,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>Sync</Text>
                    <Text style={{ fontSize: 11, color: p.dim, marginTop: 1 }}>{syncLine(store.syncStatus)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={p.dim} />
                </View>
              </Pressable>
              <Divider />
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={confirmSignOut}>
            <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: p.text }}>Sign out</Text>
            </View>
          </Pressable>
          <Divider />
          <Pressable accessibilityRole="button" onPress={() => router.push('/delete-account')}>
            <View style={{ minHeight: 46, paddingHorizontal: 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: p.danger }}>Delete account</Text>
            </View>
          </Pressable>
        </Card>
      </Section>

      <Text style={{ fontSize: 10, color: p.dim, textAlign: 'center' }}>{versionLabel()}</Text>
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

const changes = (count: number) => (count === 1 ? '1 change' : `${count} changes`);

function ago(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** One line for the Sync row: "All changes saved · just now". */
function syncLine(status: SyncStatus): string {
  if (!status.online) return status.pending > 0 ? `Offline · ${changes(status.pending)} waiting` : 'Offline';
  if (status.pending > 0) return `Saving ${changes(status.pending)}…`;
  return status.lastSyncedAt ? `All changes saved · ${ago(status.lastSyncedAt)}` : 'All changes saved';
}

function syncDetail(status: SyncStatus): string {
  const parts = [
    status.online
      ? status.pending > 0
        ? `${changes(status.pending)} uploading now.`
        : 'Everything on this phone is saved to your account.'
      : `You're offline. ${
          status.pending > 0 ? `${changes(status.pending)} will upload` : 'Changes you make will upload'
        } when the connection returns, even if you close the app.`,
  ];
  if (status.rejected > 0) {
    parts.push(`${changes(status.rejected)} couldn't be saved because your account isn't allowed to make them.`);
  }
  return parts.join('\n\n');
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
          minHeight: 46,
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
