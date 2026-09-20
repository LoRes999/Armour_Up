import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_SYNC, SNAPSHOT_VERSION } from '../persistence';
import { StoreProvider, useStore } from '../store';
import { SEED_DAY_TYPES } from '../sampleData';
import { CloudContext, type CloudServices, type CloudSession } from '../sync/context';
import type {
  CollectionName,
  OutboxEntry,
  RemoteAdapter,
  RemoteChange,
  SyncScope,
  Watermarks,
} from '../sync/types';

/**
 * The first coach to sign in on a phone adopts what is already on it. Every
 * install starts with the six starter day types, and adopting compared them
 * against nothing — so a coach signing in on a new or reinstalled phone
 * uploaded the untouched starters over their own: renamed day types went back
 * to "Push Day", on every device. The server creates the starters itself when
 * the account is made, so a phone only ever needs to send what it changed.
 */

jest.setTimeout(15000);

const KEY = 'strength-coach/v1';
const coach: SyncScope = { role: 'trainer', uid: 'u-sam', trainerId: 'u-sam' };

class RecordingServer implements RemoteAdapter {
  written: OutboxEntry[] = [];
  subscriptions = 0;

  async write(_scope: SyncScope, entries: readonly OutboxEntry[]) {
    this.written.push(...entries);
  }

  subscribe(
    _scope: SyncScope,
    _since: Watermarks,
    _onChanges: (collection: CollectionName, changes: RemoteChange[], serverTime: number) => void,
    _onError: (error: unknown) => void
  ) {
    this.subscriptions += 1;
    return () => {};
  }

  dayTypes() {
    return this.written.filter((entry) => entry.collection === 'dayTypes');
  }
}

let session: CloudSession | null = null;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CloudContext.Provider value={session}>
    <StoreProvider>{children}</StoreProvider>
  </CloudContext.Provider>
);

function services(server: RecordingServer): CloudServices {
  return {
    adapter: server,
    watchConnection: (onChange) => {
      onChange(true);
      return () => {};
    },
  };
}

/** Long enough for the upload delay to pass and any upload to be made. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 1500)));

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  session = null;
});

describe('a coach signing in on a phone', () => {
  it('does not upload the starter day types from a new install', async () => {
    const server = new RecordingServer();
    session = { services: services(server), scope: coach };
    const { result } = await renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await waitFor(() => expect(server.subscriptions).toBe(1));

    await settle();

    expect(server.dayTypes()).toEqual([]);
  });

  it('uploads only the day types changed before accounts existed', async () => {
    const [first, ...rest] = SEED_DAY_TYPES;
    const custom = { ...first, id: 'day-arms', name: 'Arms', shortLabel: 'ARMS' };
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        version: SNAPSHOT_VERSION,
        clients: [],
        workouts: [],
        dayTypes: [{ ...first, name: 'Chest' }, ...rest, custom],
        customMovements: [],
        role: 'trainer',
        signedInClientId: null,
        appearance: 'system',
        subscription: null,
        sync: EMPTY_SYNC,
      })
    );

    const server = new RecordingServer();
    session = { services: services(server), scope: coach };
    const { result } = await renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await waitFor(() => expect(server.dayTypes().length).toBeGreaterThan(0), { timeout: 3000 });
    await settle();

    const sent = server.dayTypes();
    expect(sent.map((entry) => entry.id).sort()).toEqual([custom.id, first.id].sort());
    expect(sent.find((entry) => entry.id === first.id)?.fields).toEqual({ name: 'Chest' });
  });
});
