import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNAPSHOT_VERSION } from '../persistence';
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
 * One coach signs out and another signs in on the same phone while an upload
 * is still on its way. The upload loop kept the first account's scope and
 * went on reading whatever was queued — by then the second account's changes —
 * so they were sent under the first account (and refused, or worse). An upload
 * now stops the moment its account is no longer the one signed in.
 */

jest.setTimeout(20000);

const KEY = 'strength-coach/v1';
const coachA: SyncScope = { role: 'trainer', uid: 'u-a', trainerId: 'u-a' };
const coachB: SyncScope = { role: 'trainer', uid: 'u-b', trainerId: 'u-b' };

/** Records who each write was sent as; the first write waits until released. */
class GatedServer implements RemoteAdapter {
  written: { as: string; id: string }[] = [];
  private gate: Promise<void>;
  private open!: () => void;
  private first = true;

  constructor() {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release() {
    this.open();
  }

  async write(scope: SyncScope, entries: readonly OutboxEntry[]) {
    if (this.first) {
      this.first = false;
      await this.gate;
    }
    this.written.push(...entries.map((entry) => ({ as: scope.uid, id: entry.id })));
  }

  subscribe(
    _scope: SyncScope,
    _since: Watermarks,
    _onChanges: (collection: CollectionName, changes: RemoteChange[], serverTime: number) => void,
    _onError: (error: unknown) => void
  ) {
    return () => {};
  }
}

let session: CloudSession | null = null;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CloudContext.Provider value={session}>
    <StoreProvider>{children}</StoreProvider>
  </CloudContext.Provider>
);

function services(server: GatedServer): CloudServices {
  return {
    adapter: server,
    watchConnection: (onChange) => {
      onChange(true);
      return () => {};
    },
  };
}

const aClient = {
  id: 'client-a1',
  name: 'Alex Archer',
  email: 'alex@example.com',
  unit: 'kg',
  blockName: 'Onboarding',
  blockWeek: 1,
  blockLength: 4,
  adherence: 100,
  sessionsCompleted: 0,
  inviteCode: 'AAAAAA',
  inviteAccepted: false,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  session = null;
});

it("never sends one account's changes under another's sign-in", async () => {
  // Coach A has a change waiting to go up when the app opens.
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      version: SNAPSHOT_VERSION,
      clients: [aClient],
      workouts: [],
      dayTypes: SEED_DAY_TYPES,
      customMovements: [],
      role: 'trainer',
      signedInClientId: null,
      appearance: 'system',
      subscription: null,
      sync: {
        outbox: [{ collection: 'clients', id: aClient.id, op: 'upsert', fields: { name: aClient.name }, rev: 0 }],
        lastSyncedAt: null,
        ownerUid: 'u-a',
      },
    })
  );

  const server = new GatedServer();
  const live = services(server);
  session = { services: live, scope: coachA };
  const { result, rerender } = await renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  // A's upload has started and is waiting on the server.
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));

  // A signs out and B signs in on the same phone, then invites somebody.
  session = { services: live, scope: coachB };
  await rerender({});
  await waitFor(() => expect(result.current.clients).toEqual([]));
  let invited = '';
  await act(() => {
    invited = result.current.invite('Bea Baker', 'bea@example.com', 'lb').id;
  });

  // A's upload finally gets its answer.
  await act(() => {
    server.release();
  });

  await waitFor(() => expect(server.written.some((w) => w.id === invited)).toBe(true), { timeout: 8000 });
  expect(server.written.filter((w) => w.id === invited).map((w) => w.as)).toEqual(['u-b']);
});
