import type { Client, CustomMovement, Workout } from '../models';
import { planUploads } from '../sync/diff';
import { applyRemoteChanges } from '../sync/merge';
import { enqueue } from '../sync/outbox';
import type { RemoteChange, SyncScope, SyncedData } from '../sync/types';

const trainer: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: 'w-1',
  clientId: 'c-1',
  name: 'Push Day A',
  date: '2026-09-11T18:00:00.000Z',
  exercises: [],
  coachNote: '',
  status: 'scheduled',
  loggedBy: 'trainer',
  ...over,
});

const data = (over: Partial<SyncedData> = {}): SyncedData => ({
  clients: [],
  workouts: [],
  dayTypes: [],
  customMovements: [],
  ...over,
});

/** A workout as Firestore returns it: no id field, plus bookkeeping. */
const remoteWorkout = (over: Partial<Workout> = {}): RemoteChange => {
  const { id, ...fields } = workout(over);
  return {
    collection: 'workouts',
    id,
    data: { ...fields, updatedAt: 1757613600000, updatedBy: 'u-other', trainerId: 'u-coach' },
  };
};

/**
 * The session count belongs to the server, which works it out from completed
 * workouts — so a client brought over from before accounts, or one with
 * nothing finished yet, arrives from the server with no count at all. That copy
 * replaced the phone's, and the SESSIONS tile read "undefined" (adding one to
 * it made NaN). Until the server has a count, the phone keeps its own, or 0.
 */
describe("a client whose session count the server hasn't worked out yet", () => {
  const client = (over: Partial<Client> = {}): Client => ({
    id: 'c-1',
    name: 'Jordan Real',
    email: 'jordan@example.com',
    unit: 'kg',
    blockName: 'Onboarding',
    blockWeek: 1,
    blockLength: 4,
    adherence: 100,
    sessionsCompleted: 12,
    inviteCode: 'ABCDEF',
    inviteAccepted: false,
    ...over,
  });

  /** The client as the server holds it: no id, no count, plus bookkeeping. */
  const fromServer = (over: Record<string, unknown> = {}): RemoteChange => {
    const { id, sessionsCompleted: _count, ...fields } = client();
    return {
      collection: 'clients',
      id,
      data: { ...fields, updatedAt: 1757613600000, updatedBy: 'server', ...over },
    };
  };

  it("keeps this phone's count", () => {
    const { data: next } = applyRemoteChanges(
      data({ clients: [client()] }),
      [fromServer({ name: 'Jordan R.' })],
      []
    );
    expect(next.clients[0]).toMatchObject({ name: 'Jordan R.', sessionsCompleted: 12 });
  });

  it('starts from 0 when this phone has none either', () => {
    const { data: next } = applyRemoteChanges(data(), [fromServer()], []);
    expect(next.clients[0].sessionsCompleted).toBe(0);
  });

  it("takes the server's count once it has one", () => {
    const { data: next } = applyRemoteChanges(
      data({ clients: [client()] }),
      [fromServer({ sessionsCompleted: 5 })],
      []
    );
    expect(next.clients[0].sessionsCompleted).toBe(5);
  });

  /**
   * The same hole, two fields wider. A coach who used the app before accounts
   * signs in, their roster is uploaded with the server-owned fields stripped,
   * and those documents echo straight back. inviteCode and inviteAccepted are
   * server-owned but had no fallback, so they came back undefined:
   * formatInviteCode read `undefined.length` and took the client's page down
   * to the error screen, and every adopted client showed PENDING for ever.
   */
  it("keeps this phone's invite code until the server has written one", () => {
    const { id: _id, inviteCode: _code, inviteAccepted: _accepted, ...fields } = client({
      inviteAccepted: true,
    });
    const echo: RemoteChange = {
      collection: 'clients',
      id: 'c-1',
      data: { ...fields, updatedAt: 1757613600000, updatedBy: 'server' },
    };

    const { data: next } = applyRemoteChanges(data({ clients: [client({ inviteAccepted: true })] }), [echo], []);

    expect(next.clients[0]).toMatchObject({ inviteCode: 'ABCDEF', inviteAccepted: true });
  });

  it('has something to show for a client it has never seen', () => {
    const { id: _id, inviteCode: _code, inviteAccepted: _accepted, ...fields } = client();
    const { data: next } = applyRemoteChanges(
      data(),
      [{ collection: 'clients', id: 'c-1', data: { ...fields, updatedAt: 1757613600000 } }],
      []
    );

    expect(next.clients[0].inviteCode).toBe('');
    expect(next.clients[0].inviteAccepted).toBe(false);
  });
});

describe('changes arriving from the server', () => {
  it('adds a new document, without the server bookkeeping', () => {
    const { data: next } = applyRemoteChanges(data(), [remoteWorkout()], []);
    expect(next.workouts).toEqual([workout()]);
  });

  it('replaces the local copy with the newer one', () => {
    const { data: next } = applyRemoteChanges(
      data({ workouts: [workout()] }),
      [remoteWorkout({ name: 'Push Day B', coachNote: 'Pause the reps' })],
      []
    );
    expect(next.workouts[0]).toMatchObject({ name: 'Push Day B', coachNote: 'Pause the reps' });
  });

  it('keeps a local edit that has not uploaded yet, and takes the rest', () => {
    const local = workout({ name: 'Renamed here' });
    const outbox = enqueue([], [
      { collection: 'workouts', id: 'w-1', op: 'upsert', fields: { name: 'Renamed here' }, rev: 0 },
    ]);
    const { data: next } = applyRemoteChanges(
      data({ workouts: [local] }),
      [remoteWorkout({ name: 'Renamed there', coachNote: 'From the coach' })],
      outbox
    );
    expect(next.workouts[0]).toMatchObject({ name: 'Renamed here', coachNote: 'From the coach' });
  });

  it('keeps a document deleted here until the delete has gone up', () => {
    const outbox = enqueue([], [{ collection: 'workouts', id: 'w-1', op: 'delete', fields: {}, rev: 0 }]);
    const { data: next } = applyRemoteChanges(data(), [remoteWorkout()], outbox);
    expect(next.workouts).toEqual([]);
  });

  it('lets a delete from the server win over local edits', () => {
    const outbox = enqueue([], [
      { collection: 'workouts', id: 'w-1', op: 'upsert', fields: { seenByClientAt: 'now' }, rev: 0 },
    ]);
    const softDeleted: RemoteChange = { ...remoteWorkout(), data: { deleted: true } };

    const result = applyRemoteChanges(data({ workouts: [workout()] }), [softDeleted], outbox);
    expect(result.data.workouts).toEqual([]);
    expect(result.outbox).toEqual([]);

    const hardDeleted = applyRemoteChanges(data({ workouts: [workout()] }), [{ ...softDeleted, data: null }], []);
    expect(hardDeleted.data.workouts).toEqual([]);
  });

  it("keeps a movement's photos, which only exist on this phone", () => {
    const movement: CustomMovement = {
      id: 'mv-1',
      name: 'Landmine Press',
      description: 'Old',
      cues: [],
      muscles: [],
      photoUris: ['file:///photos/1.jpg'],
    };
    const change: RemoteChange = {
      collection: 'movements',
      id: 'mv-1',
      data: { name: 'Landmine Press', description: 'New', cues: [], muscles: [] },
    };
    const { data: next } = applyRemoteChanges(data({ customMovements: [movement] }), [change], []);
    expect(next.customMovements[0]).toMatchObject({ description: 'New', photoUris: ['file:///photos/1.jpg'] });

    const fresh = applyRemoteChanges(data(), [{ ...change, id: 'mv-2' }], []);
    expect(fresh.data.customMovements[0].photoUris).toEqual([]);
  });

  it('takes the photos the coach has uploaded, which is what a client can see', () => {
    const change: RemoteChange = {
      collection: 'movements',
      id: 'mv-3',
      data: { name: 'Landmine Press', description: '', cues: [], muscles: [], photos: ['1.jpg'] },
    };

    const { data: next } = applyRemoteChanges(data(), [change], []);

    // Nothing of this phone's own: a client has no copy of the coach's files.
    expect(next.customMovements[0]).toMatchObject({ photos: ['1.jpg'], photoUris: [] });
  });

  it('keeps the same object when nothing actually changed', () => {
    const local = workout();
    const before = data({ workouts: [local] });
    const { data: next } = applyRemoteChanges(before, [remoteWorkout()], []);
    expect(next.workouts[0]).toBe(local);
  });

  // The echo the whole design has to avoid: a change arrives, is applied,
  // and the comparison mistakes it for a local edit and uploads it back.
  it('never queues a change that came from the server for upload', () => {
    const shadow = data({ workouts: [workout()] });
    const state = shadow;
    const incoming = [remoteWorkout({ name: 'From elsewhere' })];

    const nextShadow = applyRemoteChanges(shadow, incoming, []).data;
    const nextState = applyRemoteChanges(state, incoming, []).data;
    expect(planUploads(trainer, nextShadow, nextState)).toEqual([]);
  });
});
