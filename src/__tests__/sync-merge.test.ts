import type { CustomMovement, Workout } from '../models';
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
