import { BATCH_LIMIT, flushOutbox, retryDelayMs } from '../sync/engine';
import { enqueue } from '../sync/outbox';
import {
  type Outbox,
  type OutboxEntry,
  type RemoteAdapter,
  RemoteWriteError,
  type SyncScope,
} from '../sync/types';

const scope: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };

const entry = (id: string): OutboxEntry => ({
  collection: 'workouts',
  id,
  op: 'upsert',
  fields: { name: id },
  rev: 0,
});

/** Stands in for Firestore: records batches, and can be told to fail. */
class FakeServer implements RemoteAdapter {
  batches: string[][] = [];
  offline = false;
  refused = new Set<string>();
  onWrite?: () => void;

  async write(_scope: SyncScope, entries: readonly OutboxEntry[]) {
    this.onWrite?.();
    if (this.offline) throw new RemoteWriteError('unavailable', true);
    if (entries.some((e) => this.refused.has(e.id))) throw new RemoteWriteError('permission-denied', false);
    this.batches.push(entries.map((e) => e.id));
  }

  subscribe() {
    return () => {};
  }
}

function setup(ids: string[]) {
  const server = new FakeServer();
  let outbox: Outbox = enqueue([], ids.map(entry));
  const deps = {
    adapter: server,
    scope,
    readOutbox: () => outbox,
    updateOutbox: (change: (o: Outbox) => Outbox) => {
      outbox = change(outbox);
    },
  };
  return {
    server,
    deps,
    queue: () => outbox,
    edit: (id: string) => {
      outbox = enqueue(outbox, [{ ...entry(id), fields: { coachNote: 'edited' } }]);
    },
  };
}

/**
 * Straight after a coach creates their account the server has given them the
 * role, but the token on the phone is a moment older and doesn't carry it yet,
 * so the first upload is refused. Treating that as final dropped every change
 * in it — the whole roster the phone had from before accounts. A refused
 * upload now refreshes the sign-in and tries once more before dropping anything.
 */
describe('an upload refused because the sign-in is a moment behind', () => {
  class RoleArrivingServer implements RemoteAdapter {
    tokenFresh = false;
    batches: string[][] = [];

    async write(_scope: SyncScope, entries: readonly OutboxEntry[]) {
      if (!this.tokenFresh) throw new RemoteWriteError('permission-denied', false);
      this.batches.push(entries.map((e) => e.id));
    }

    subscribe() {
      return () => {};
    }
  }

  function withServer(server: RemoteAdapter, ids: string[], refreshToken: () => Promise<void>) {
    let outbox: Outbox = enqueue([], ids.map(entry));
    return {
      deps: {
        adapter: server,
        scope,
        readOutbox: () => outbox,
        updateOutbox: (change: (o: Outbox) => Outbox) => {
          outbox = change(outbox);
        },
        refreshToken,
      },
      queue: () => outbox,
    };
  }

  it('refreshes the sign-in and sends everything, dropping nothing', async () => {
    const server = new RoleArrivingServer();
    const refreshToken = jest.fn(async () => {
      server.tokenFresh = true;
    });
    const { deps, queue } = withServer(server, ['a', 'b', 'c'], refreshToken);

    const result = await flushOutbox(deps);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 3, rejected: 0, interrupted: false });
    expect(server.batches.flat()).toEqual(['a', 'b', 'c']);
    expect(queue()).toEqual([]);
  });

  it('still drops what is refused after a fresh sign-in, and refreshes only once', async () => {
    const server = new RoleArrivingServer();
    // The account really has no role for this.
    const refreshToken = jest.fn(async () => {});
    const { deps } = withServer(server, ['a', 'b'], refreshToken);

    const result = await flushOutbox(deps);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, rejected: 2, interrupted: false });
  });

  it('keeps everything queued when the sign-in cannot be refreshed right now', async () => {
    const server = new RoleArrivingServer();
    const refreshToken = jest.fn(() => Promise.reject(new Error('offline')));
    const { deps, queue } = withServer(server, ['a', 'b'], refreshToken);

    const result = await flushOutbox(deps);

    expect(result).toEqual({ sent: 0, rejected: 0, interrupted: true });
    expect(queue().map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('an upload for an account that is no longer signed in', () => {
  it('stops before the next batch and leaves the rest queued', async () => {
    const ids = Array.from({ length: BATCH_LIMIT + 5 }, (_, i) => `w${i}`);
    const { server, deps, queue } = setup(ids);
    // Still this account for the first batch; somebody else's after it.
    let checks = 0;

    const result = await flushOutbox({ ...deps, stillCurrent: () => (checks += 1) === 1 });

    expect(result.interrupted).toBe(true);
    expect(server.batches).toHaveLength(1);
    expect(queue()).toHaveLength(5);
  });
});

describe('uploading the queue', () => {
  it('sends everything and empties the queue', async () => {
    const { server, deps, queue } = setup(['a', 'b', 'c']);
    const result = await flushOutbox(deps);
    expect(result).toEqual({ sent: 3, rejected: 0, interrupted: false });
    expect(server.batches).toEqual([['a', 'b', 'c']]);
    expect(queue()).toEqual([]);
  });

  it('keeps every change when there is no connection', async () => {
    const { server, deps, queue } = setup(['a', 'b']);
    server.offline = true;
    const result = await flushOutbox(deps);
    expect(result.interrupted).toBe(true);
    expect(queue().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops a change the server refuses, and still sends the rest', async () => {
    const { server, deps, queue } = setup(['a', 'bad', 'c']);
    server.refused.add('bad');
    const result = await flushOutbox(deps);
    expect(result).toEqual({ sent: 2, rejected: 1, interrupted: false });
    expect(server.batches.flat()).toEqual(['a', 'c']);
    expect(queue()).toEqual([]);
  });

  it('splits a long queue into batches Firestore accepts', async () => {
    const ids = Array.from({ length: BATCH_LIMIT + 10 }, (_, i) => `w${i}`);
    const { server, deps } = setup(ids);
    await flushOutbox(deps);
    expect(server.batches.map((batch) => batch.length)).toEqual([BATCH_LIMIT, 10]);
  });

  it('sends an entry again if it changed while it was being uploaded', async () => {
    const { server, deps, queue, edit } = setup(['a']);
    let first = true;
    server.onWrite = () => {
      if (first) edit('a');
      first = false;
    };
    await flushOutbox(deps);
    expect(server.batches).toEqual([['a'], ['a']]);
    expect(queue()).toEqual([]);
  });

  it('waits longer after each interruption, up to a minute', () => {
    expect([1, 2, 3, 6, 10].map(retryDelayMs)).toEqual([2000, 4000, 8000, 60000, 60000]);
  });
});
