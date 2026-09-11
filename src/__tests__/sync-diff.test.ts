import { buildSeed } from '../sampleData';
import type { Client, CustomMovement, Workout } from '../models';
import { planUploads, sameValue } from '../sync/diff';
import type { SyncScope, SyncedData } from '../sync/types';

/**
 * What a change to the store queues for upload. The comparison replaces
 * wiring every store mutation to the cloud, so these tests are what stands
 * between an edit and it silently never syncing.
 */

const trainer: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };
const jordan: SyncScope = { role: 'client', uid: 'u-jordan', trainerId: 'u-coach', clientId: 'c-1' };

const client = (over: Partial<Client> = {}): Client => ({
  id: 'c-1',
  name: 'Jordan Real',
  email: 'jordan@example.com',
  unit: 'kg',
  blockName: 'Onboarding',
  blockWeek: 1,
  blockLength: 4,
  adherence: 100,
  sessionsCompleted: 3,
  inviteCode: 'ABCDEF',
  inviteAccepted: true,
  ...over,
});

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: 'w-1',
  clientId: 'c-1',
  name: 'Push Day A',
  date: '2026-09-11T18:00:00.000Z',
  exercises: [
    {
      id: 'ex-1',
      movementName: 'Barbell Bench Press',
      sets: [{ id: 's-1', targetWeight: 80, targetReps: 8 }],
    },
  ],
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

/** A copy of a workout with one set logged, made the way the store makes it. */
const withLoggedSet = (source: Workout): Workout => ({
  ...source,
  exercises: source.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set, loggedWeight: 82.5, loggedReps: 8 })),
  })),
});

describe('a trainer phone', () => {
  it('uploads a new client without the fields the server keeps', () => {
    const [entry, ...rest] = planUploads(trainer, data(), data({ clients: [client()] }));

    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({ collection: 'clients', id: 'c-1', op: 'upsert' });
    expect(entry.fields).toMatchObject({ name: 'Jordan Real', unit: 'kg', adherence: 100 });
    for (const serverOwned of ['sessionsCompleted', 'inviteCode', 'inviteAccepted', 'id']) {
      expect(entry.fields).not.toHaveProperty(serverOwned);
    }
  });

  it('sends only the field that changed', () => {
    const before = workout();
    const [entry] = planUploads(
      trainer,
      data({ workouts: [before] }),
      data({ workouts: [{ ...before, name: 'Push Day B' }] })
    );
    expect(entry.fields).toEqual({ name: 'Push Day B' });
  });

  it('sends the exercises when a set is logged', () => {
    const before = workout();
    const after = withLoggedSet(before);
    const [entry] = planUploads(trainer, data({ workouts: [before] }), data({ workouts: [after] }));
    expect(Object.keys(entry.fields)).toEqual(['exercises']);
    expect(entry.fields.exercises).toEqual(after.exercises);
  });

  it('removes a cleared field from the cloud copy as well', () => {
    const before = workout({ dayTypeId: 'day-push' });
    const [entry] = planUploads(
      trainer,
      data({ workouts: [before] }),
      data({ workouts: [{ ...before, dayTypeId: undefined }] })
    );
    expect(entry.fields).toEqual({ dayTypeId: null });
  });

  it('queues a delete for a removed workout', () => {
    const [entry] = planUploads(trainer, data({ workouts: [workout()] }), data());
    expect(entry).toMatchObject({ collection: 'workouts', id: 'w-1', op: 'delete', fields: {} });
  });

  it('queues nothing when nothing changed, even for an equal copy', () => {
    const same = workout();
    expect(planUploads(trainer, data({ workouts: [same] }), data({ workouts: [same] }))).toEqual([]);
    expect(
      planUploads(trainer, data({ workouts: [same] }), data({ workouts: [JSON.parse(JSON.stringify(same))] }))
    ).toEqual([]);
  });

  it('never uploads sample data', () => {
    const seed = buildSeed();
    expect(
      planUploads(trainer, data(), data({ clients: seed.clients, workouts: seed.workouts }))
    ).toEqual([]);
  });

  it('keeps movement photos, which are files on this phone, out of the upload', () => {
    const movement: CustomMovement = {
      id: 'mv-1',
      name: 'Landmine Press',
      description: '',
      cues: [],
      muscles: [],
      photoUris: ['file:///photos/1.jpg'],
    };
    const [entry] = planUploads(trainer, data(), data({ customMovements: [movement] }));
    expect(entry.collection).toBe('movements');
    expect(entry.fields).not.toHaveProperty('photoUris');

    const withPhotoOnly = { ...movement, photoUris: [...movement.photoUris, 'file:///photos/2.jpg'] };
    expect(
      planUploads(trainer, data({ customMovements: [movement] }), data({ customMovements: [withPhotoOnly] }))
    ).toEqual([]);
  });
});

describe('a client phone', () => {
  it('uploads their unit and nothing else of their record', () => {
    const before = client();
    const [entry, ...rest] = planUploads(
      jordan,
      data({ clients: [before] }),
      data({ clients: [{ ...before, unit: 'lb', name: 'Jordan R', sessionsCompleted: 4 }] })
    );
    expect(rest).toHaveLength(0);
    expect(entry.fields).toEqual({ unit: 'lb' });
  });

  it("never uploads another client's record", () => {
    const other = client({ id: 'c-2' });
    expect(
      planUploads(jordan, data({ clients: [other] }), data({ clients: [{ ...other, unit: 'lb' }] }))
    ).toEqual([]);
  });

  it("marks a trainer's session as seen, and changes nothing else in it", () => {
    const before = workout();
    const after = { ...withLoggedSet(before), seenByClientAt: '2026-09-11T08:00:00.000Z' };
    const [entry, ...rest] = planUploads(jordan, data({ workouts: [before] }), data({ workouts: [after] }));
    expect(rest).toHaveLength(0);
    expect(entry.fields).toEqual({ seenByClientAt: '2026-09-11T08:00:00.000Z' });

    expect(planUploads(jordan, data({ workouts: [before] }), data())).toEqual([]);
  });

  it('owns their solo sessions: create, log and delete', () => {
    const solo = workout({ id: 'w-solo', loggedBy: 'client' });
    const [created] = planUploads(jordan, data(), data({ workouts: [solo] }));
    expect(created).toMatchObject({ id: 'w-solo', op: 'upsert' });
    expect(created.fields).toHaveProperty('exercises');

    const [logged] = planUploads(jordan, data({ workouts: [solo] }), data({ workouts: [withLoggedSet(solo)] }));
    expect(Object.keys(logged.fields)).toEqual(['exercises']);

    const [removed] = planUploads(jordan, data({ workouts: [solo] }), data());
    expect(removed.op).toBe('delete');
  });

  it("never uploads someone else's solo session", () => {
    const theirs = workout({ id: 'w-other', clientId: 'c-2', loggedBy: 'client' });
    expect(planUploads(jordan, data(), data({ workouts: [theirs] }))).toEqual([]);
  });

  it("never uploads the trainer's day types or movements", () => {
    expect(
      planUploads(
        jordan,
        data(),
        data({ dayTypes: [{ id: 'day-x', name: 'Arms', shortLabel: 'ARMS', colorIndex: 1 }] })
      )
    ).toEqual([]);
  });
});

describe('sameValue', () => {
  it('compares structure, not identity', () => {
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(sameValue([], {})).toBe(false);
  });
});
