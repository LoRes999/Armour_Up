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
