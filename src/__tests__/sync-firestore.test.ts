import type { Firestore } from 'firebase/firestore';
import type { RemoteChange, SyncScope } from '../sync/types';

/**
 * The Firestore adapter's listener, over a fake SDK.
 *
 * Everything else in src/sync is plain functions tested against a fake server.
 * This file is the seam where Firestore's own behaviour matters, and it is the
 * one that shipped the "Session not found" flicker: a listener event was read
 * as a deletion when it was nothing of the kind.
 */

type SnapshotHandler = (snapshot: unknown) => void;

const mockListeners: { handler: SnapshotHandler; onError: (error: unknown) => void }[] = [];

jest.mock('firebase/firestore', () => {
  class FakeTimestamp {
    ms: number;
    constructor(ms: number) {
      this.ms = ms;
    }
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
    toMillis() {
      return this.ms;
    }
  }
  return {
    __esModule: true,
    Timestamp: FakeTimestamp,
    collection: () => ({ type: 'collection' }),
    doc: () => ({ type: 'document' }),
    deleteField: () => ({ type: 'deleteField' }),
    serverTimestamp: () => ({ type: 'serverTimestamp' }),
    where: (...args: unknown[]) => ({ type: 'where', args }),
    query: (...args: unknown[]) => ({ type: 'query', args }),
    writeBatch: () => ({ set: jest.fn(), commit: jest.fn() }),
    onSnapshot: (_source: unknown, handler: SnapshotHandler, onError: (error: unknown) => void) => {
      mockListeners.push({ handler, onError });
      return () => undefined;
    },
  };
});

// After the mock, so the adapter picks it up.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { firestoreAdapter } = require('../sync/firestore') as typeof import('../sync/firestore');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require('firebase/firestore') as { Timestamp: { fromMillis(ms: number): unknown } };

const COACH: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };

/** The query listeners, in the adapter's order: clients, dayTypes, movements, workouts. */
function listen() {
  const heard: RemoteChange[][] = [];
  const stop = firestoreAdapter({} as Firestore).subscribe(
    COACH,
    {},
    (_collection, changes) => heard.push(changes),
    () => undefined
  );
  return { heard, stop, workouts: mockListeners[3] };
}

/** One entry of a QuerySnapshot's docChanges(), shaped as the adapter reads it. */
function docChange(type: 'added' | 'modified' | 'removed', id: string, data: unknown, pending = false) {
  return { type, doc: { id, data: () => data, metadata: { hasPendingWrites: pending } } };
}

beforeEach(() => {
  mockListeners.length = 0;
});

describe('the listener', () => {
  it('passes on a document the server has changed', () => {
    const { heard, workouts } = listen();

    workouts.handler({
      docChanges: () => [docChange('modified', 'w-1', { name: 'Push Day', updatedAt: Timestamp.fromMillis(900) })],
    });

    expect(heard).toEqual([[{ collection: 'workouts', id: 'w-1', data: { name: 'Push Day', updatedAt: expect.anything() } }]]);
  });

  /**
   * The flicker, reported 2026-09-20. A write stamps updatedAt with a server
   * timestamp, which is unresolved on this phone until the server answers, so
   * the document stops matching the listener's own `updatedAt >= since` filter
   * and Firestore reports it as `removed`. It has not been deleted: it is
   * leaving the result set for a second. Reading that as a deletion took the
   * session off the screen mid-edit, and discarded the queued upload with it.
   */
  it('does not read a document leaving the query as a deletion', () => {
    const { heard, workouts } = listen();

    workouts.handler({
      docChanges: () => [docChange('removed', 'w-1', { name: 'Push Day', updatedAt: Timestamp.fromMillis(900) })],
    });

    expect(heard.flat()).toEqual([]);
  });

  it('hears a real deletion as the tombstone it is', () => {
    const { heard, workouts } = listen();

    workouts.handler({
      docChanges: () => [
        docChange('modified', 'w-1', { deleted: true, updatedAt: Timestamp.fromMillis(900) }),
      ],
    });

    expect(heard.flat()).toEqual([
      { collection: 'workouts', id: 'w-1', data: { deleted: true, updatedAt: expect.anything() } },
    ]);
  });

  it("ignores this phone's own write until the server confirms it", () => {
    const { heard, workouts } = listen();

    workouts.handler({
      docChanges: () => [docChange('modified', 'w-1', { name: 'Push Day' }, true)],
    });

    expect(heard.flat()).toEqual([]);
  });
});
