import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_SYNC, SNAPSHOT_VERSION } from '../persistence';
import { StoreProvider, useStore } from '../store';
import { SEED_DAY_TYPES } from '../sampleData';
import { CloudContext, type CloudServices, type CloudSession } from '../sync/context';
import type { OutboxEntry, RemoteAdapter, RemoteChange, SyncScope } from '../sync/types';

/**
 * On a real phone the store is read back first and the signed-in account is
 * restored a moment later. Found in the end-to-end run on the Android
 * emulator: a client who had already joined relaunched, the saved store
 * already said "client", so nothing in the store changed when the account
 * arrived — and sync never started. They sat on "Getting your programme…"
 * with their record readable on the server and no error anywhere.
 */

// A retried listener waits a couple of seconds before starting again.
jest.setTimeout(15000);

const KEY = 'strength-coach/v1';
const jordan: SyncScope = { role: 'client', uid: 'u-jordan', trainerId: 'u-sam', clientId: 'c-jordan' };

const jordanRecord = {
  name: 'Jordan Lee',
  email: 'jordan@example.com',
  unit: 'lb',
  blockName: 'Onboarding',
  blockWeek: 1,
  blockLength: 4,
  adherence: 100,
  sessionsCompleted: 0,
  inviteCode: 'JDC897',
  inviteAccepted: true,
};

class FakeServer implements RemoteAdapter {
  subscriptions = 0;
  /** Errors to hand to the next subscribers, in order, instead of listening. */
  failures: unknown[] = [];
  private listener?: (changes: RemoteChange[], serverTime: number) => void;

  async write(_scope: SyncScope, _entries: readonly OutboxEntry[]) {}

  subscribe(
    _scope: SyncScope,
    _since: number,
    onChanges: (changes: RemoteChange[], serverTime: number) => void,
    onError: (error: unknown) => void
  ) {
    this.subscriptions += 1;
    const failure = this.failures.shift();
    if (failure) {
      setTimeout(() => onError(failure), 0);
      return () => {};
    }
    this.listener = onChanges;
    return () => {
      this.listener = undefined;
    };
  }

  deliverJordan() {
    this.listener?.([{ collection: 'clients', id: 'c-jordan', data: jordanRecord }], 1757613600000);
  }
}

let session: CloudSession | null = null;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CloudContext.Provider value={session}>
    <StoreProvider>{children}</StoreProvider>
  </CloudContext.Provider>
);

/** What an earlier launch that had already joined left on the phone. */
const savedAsJoinedClient = () =>
  AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      version: SNAPSHOT_VERSION,
      clients: [],
      workouts: [],
      dayTypes: SEED_DAY_TYPES,
      customMovements: [],
      role: 'client',
      signedInClientId: 'c-jordan',
      appearance: 'system',
      subscription: null,
      sync: { ...EMPTY_SYNC, ownerUid: 'u-jordan' },
    })
  );

function services(server: FakeServer): CloudServices {
  return {
    adapter: server,
    watchConnection: (onChange) => {
      onChange(true);
      return () => {};
    },
  };
}

afterEach(() => {
  session = null;
});

describe('a client phone whose account is restored after the store', () => {
  it('starts syncing when the account arrives, even though nothing in the store changes', async () => {
    await savedAsJoinedClient();
    const server = new FakeServer();
    const live = services(server);

    session = { services: live, scope: null }; // the account is still being restored
    const { result, rerender } = await renderHook(() => useStore(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(server.subscriptions).toBe(0);

    session = { services: live, scope: jordan }; // …and now it is
    await rerender({});

    await waitFor(() => expect(server.subscriptions).toBe(1), { timeout: 3000 });
    await act(() => {
      server.deliverJordan();
    });
    await waitFor(() => expect(result.current.canUseClientApp()).toBe(true));
  });
});

describe('a listener the server stops', () => {
  it('is started again rather than left stopped for good', async () => {
    const server = new FakeServer();
    server.failures.push(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      session = { services: services(server), scope: jordan };
      const { result } = await renderHook(() => useStore(), { wrapper });
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      // The first listener fails; a second one is started after a short wait.
      await waitFor(() => expect(server.subscriptions).toBe(2), { timeout: 5000 });
      // And the failure was reported, so it can be found in the device log.
      expect(warn).toHaveBeenCalled();

      await act(() => {
        server.deliverJordan();
      });
      await waitFor(() => expect(result.current.clients.map((c) => c.id)).toContain('c-jordan'));
    } finally {
      warn.mockRestore();
    }
  });
});
