import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_SYNC, SNAPSHOT_VERSION, flushSnapshot } from '../persistence';
import { StoreProvider, useStore } from '../store';
import { SAMPLE_CLIENT_IDS, SEED_DAY_TYPES } from '../sampleData';
import { CloudContext, type CloudSession } from '../sync/context';
import {
  type OutboxEntry,
  type RemoteAdapter,
  type RemoteChange,
  RemoteWriteError,
  type SyncScope,
} from '../sync/types';

/**
 * The real store, wired to a fake server. These are the behaviours the plan
 * promised: a change made here reaches the server, a change made elsewhere
 * shows up here and is not sent back, and nothing made offline is lost.
 */

const KEY = 'strength-coach/v1';
const coach: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };

class FakeServer implements RemoteAdapter {
  writes: OutboxEntry[] = [];
  offline = false;
  subscribedSince: number | undefined;
  private listener?: (changes: RemoteChange[], serverTime: number) => void;

  async write(_scope: SyncScope, entries: readonly OutboxEntry[]) {
    if (this.offline) throw new RemoteWriteError('unavailable', true);
    this.writes.push(...entries);
  }

  subscribe(_scope: SyncScope, since: number, onChanges: (c: RemoteChange[], t: number) => void) {
    this.subscribedSince = since;
    this.listener = onChanges;
    return () => {
      this.listener = undefined;
    };
  }

  get listening() {
    return this.listener !== undefined;
  }

  deliver(changes: RemoteChange[]) {
    this.listener?.(changes, 1757613600000);
  }

  wrote(collection: string) {
    return this.writes.filter((entry) => entry.collection === collection);
  }
}

class FakeConnection {
  online = true;
  private listeners = new Set<(online: boolean) => void>();
  watch = (listener: (online: boolean) => void) => {
    this.listeners.add(listener);
    listener(this.online);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(online: boolean) {
    this.online = online;
    this.listeners.forEach((listener) => listener(online));
  }
}

function mount(scope: SyncScope | null = coach) {
  const server = new FakeServer();
  const connection = new FakeConnection();
  const session: CloudSession = {
    services: { adapter: server, watchConnection: connection.watch },
    scope,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CloudContext.Provider value={session}>
      <StoreProvider>{children}</StoreProvider>
    </CloudContext.Provider>
  );
  return { server, connection, rendered: renderHook(() => useStore(), { wrapper }) };
}

const hydrated = async (result: { current: { hydrated: boolean } | null }) => {
  await waitFor(() => expect(result.current?.hydrated).toBe(true));
};

const slowly = { timeout: 4000 };

const savedSync = async () => {
  await flushSnapshot();
  return JSON.parse((await AsyncStorage.getItem(KEY)) as string).sync;
};

const realClient = {
  id: 'client-real',
  name: 'Jordan Real',
  email: 'jordan@example.com',
  unit: 'kg',
  blockName: 'Onboarding',
  blockWeek: 1,
  blockLength: 4,
  adherence: 100,
  sessionsCompleted: 0,
  inviteCode: 'ABCDEF',
  inviteAccepted: false,
};

const savedStore = (over: Record<string, unknown>) => ({
  version: SNAPSHOT_VERSION,
  clients: [realClient],
  workouts: [],
  dayTypes: SEED_DAY_TYPES,
  customMovements: [],
  role: 'trainer',
  signedInClientId: null,
  appearance: 'system',
  subscription: null,
  sync: EMPTY_SYNC,
  ...over,
});

describe('a coach phone with cloud sync', () => {
  it('uploads a change made here', async () => {
    const { server, rendered } = mount();
    const { result } = await rendered;
    await hydrated(result);

    await act(() => {
      result.current.invite('Jordan Real', 'jordan@example.com', 'kg');
    });

    await waitFor(() => expect(server.wrote('clients')).toHaveLength(1), slowly);
    expect(server.wrote('clients')[0].fields).toMatchObject({ name: 'Jordan Real', unit: 'kg' });
    await waitFor(() => expect(result.current.syncStatus.pending).toBe(0), slowly);
  });

  it('shows a change made on another phone, and does not send it back', async () => {
    const { server, rendered } = mount();
    const { result } = await rendered;
    await hydrated(result);
    await waitFor(() => expect(server.listening).toBe(true));
    const before = server.writes.length;

    await act(() => {
      server.deliver([
        {
          collection: 'clients',
          id: 'client-elsewhere',
          data: { ...realClient, id: undefined, name: 'Priya Elsewhere', updatedAt: 1757613600000 },
        },
      ]);
    });

    await waitFor(() =>
      expect(result.current.clients.map((c) => c.name)).toContain('Priya Elsewhere')
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(server.writes.slice(before).filter((w) => w.id === 'client-elsewhere')).toEqual([]);
  });

  it('keeps changes made offline across a restart, then sends them', async () => {
    const first = mount();
    first.connection.online = false;
    const { result, unmount } = await first.rendered;
    await hydrated(result);

    await act(() => {
      result.current.invite('Offline Olly', 'olly@example.com', 'lb');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(first.server.wrote('clients')).toEqual([]);
    const queued = (await savedSync()).outbox as OutboxEntry[];
    expect(queued.some((entry) => entry.collection === 'clients' && entry.fields.name === 'Offline Olly')).toBe(true);
    await unmount();

    // Relaunch with a connection: the queue saved on the phone goes up.
    const second = mount();
    const { result: again } = await second.rendered;
    await hydrated(again);
    await waitFor(
      () => expect(second.server.wrote('clients').map((w) => w.fields.name)).toContain('Offline Olly'),
      slowly
    );
  });

  it('uploads data saved before accounts existed to the first coach who signs in', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(savedStore({ version: 1, sync: undefined })));
    const { server, rendered } = mount();
    const { result } = await rendered;
    await hydrated(result);

    await waitFor(() => expect(server.wrote('clients').map((w) => w.id)).toEqual(['client-real']), slowly);
    expect(result.current.clients.map((c) => c.id)).toEqual(['client-real']);
    expect((await savedSync()).ownerUid).toBe('u-coach');
  });

  it("starts clean, uploading nothing, when this phone holds another account's data", async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(savedStore({ sync: { ...EMPTY_SYNC, ownerUid: 'u-somebody-else' } }))
    );
    const { server, rendered } = mount();
    const { result } = await rendered;
    await hydrated(result);

    await waitFor(() => expect(result.current.clients).toEqual([]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(server.wrote('clients')).toEqual([]);
    // Asks the server for everything, not just changes since the other account's last sync.
    expect(server.subscribedSince).toBe(0);
  });

  it('keeps sample data on the phone', async () => {
    const { server, rendered } = mount();
    const { result } = await rendered;
    await hydrated(result);

    await act(() => {
      result.current.loadSampleData();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(server.writes.filter((w) => SAMPLE_CLIENT_IDS.has(w.id))).toEqual([]);
    expect(server.wrote('workouts')).toEqual([]);
  });
});

/**
 * With accounts, a phone holds one account's data, and deleting the account has
 * to leave a fresh install behind. It used to keep the day types and — on a
 * client's phone — the coach's own movements, then write them straight back
 * after clearing storage. The next coach to sign up on that phone adopted them
 * and uploaded somebody else's day types and movements into their own account.
 */
describe('deleting the account on a phone with cloud sync', () => {
  const jordan: SyncScope = { role: 'client', uid: 'u-jordan', trainerId: 'u-coach', clientId: 'client-real' };
  const [firstDayType, ...otherDayTypes] = SEED_DAY_TYPES;
  const renamedDayTypes = [{ ...firstDayType, name: 'Chest' }, ...otherDayTypes];
  const coachesMovement = {
    id: 'mv-landmine',
    name: 'Landmine Press',
    description: "Sam's own cue sheet.",
    cues: ['Brace first'],
    muscles: ['Shoulders'],
    photoUris: [],
  };

  /** What is left in storage once any save still pending has been written. */
  const leftOnPhone = async () => {
    await flushSnapshot();
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null') as {
      clients: unknown[];
      workouts: unknown[];
      customMovements: unknown[];
      dayTypes: unknown[];
    } | null;
  };

  const expectFreshInstall = (saved: Awaited<ReturnType<typeof leftOnPhone>>) => {
    if (saved === null) return;
    expect(saved.clients).toEqual([]);
    expect(saved.workouts).toEqual([]);
    expect(saved.customMovements).toEqual([]);
    expect(saved.dayTypes).toEqual(SEED_DAY_TYPES);
  };

  it("leaves nothing of the coach's on a client's phone", async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(
        savedStore({
          role: 'client',
          signedInClientId: 'client-real',
          dayTypes: renamedDayTypes,
          customMovements: [coachesMovement],
          sync: { ...EMPTY_SYNC, ownerUid: 'u-jordan' },
        })
      )
    );
    const { rendered } = mount(jordan);
    const { result } = await rendered;
    await hydrated(result);
    await waitFor(() => expect(result.current.customMovements).toHaveLength(1));

    await act(() => {
      result.current.deleteAccount();
    });

    expect(result.current.customMovements).toEqual([]);
    expect(result.current.dayTypes).toEqual(SEED_DAY_TYPES);
    expectFreshInstall(await leftOnPhone());
  });

  it("puts a coach's phone back to a fresh install", async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(
        savedStore({
          dayTypes: renamedDayTypes,
          customMovements: [coachesMovement],
          sync: { ...EMPTY_SYNC, ownerUid: 'u-coach' },
        })
      )
    );
    const { rendered } = mount(coach);
    const { result } = await rendered;
    await hydrated(result);

    await act(() => {
      result.current.deleteAccount();
    });

    expect(result.current.dayTypes).toEqual(SEED_DAY_TYPES);
    expectFreshInstall(await leftOnPhone());
  });
});

describe('without cloud sync', () => {
  it('queues nothing, exactly as before accounts', async () => {
    const { server, rendered } = mount(null);
    const { result } = await rendered;
    await hydrated(result);

    await act(() => {
      result.current.invite('Jordan Real', 'jordan@example.com', 'kg');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    expect(server.writes).toEqual([]);
    expect((await savedSync()).outbox).toEqual([]);
    expect(result.current.cloudActive).toBe(false);
  });
});
