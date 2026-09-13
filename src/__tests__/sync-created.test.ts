import type { Workout } from '../models';
import { planUploads } from '../sync/diff';
import { enqueue } from '../sync/outbox';
import type { OutboxEntry, SyncScope, SyncedData } from '../sync/types';

/**
 * A workout created and deleted again before it ever reached the server —
 * both while offline, say. The queue folded the two into a delete, and a
 * delete of a document the server has never seen arrives as a bare tombstone,
 * which the rules refuse (a workout needs its client): Settings then said a
 * change "couldn't be saved". Nothing needs to go up at all. But a creation
 * already on its way must still be followed by its delete, or the server
 * keeps a copy the phone has thrown away.
 */

const coach: SyncScope = { role: 'trainer', uid: 'u-coach', trainerId: 'u-coach' };
const empty: SyncedData = { clients: [], workouts: [], dayTypes: [], customMovements: [] };
const workout: Workout = {
  id: 'w-new',
  clientId: 'c-1',
  name: 'Push Day A',
  date: '2026-09-13T18:00:00.000Z',
  exercises: [],
  coachNote: '',
  status: 'scheduled',
  loggedBy: 'trainer',
};
const remove: OutboxEntry = { collection: 'workouts', id: 'w-new', op: 'delete', fields: {}, rev: 0 };
const creation = () => planUploads(coach, empty, { ...empty, workouts: [workout] });

describe('a document the server has never seen', () => {
  it('is marked as new when first queued, and an edit is not', () => {
    expect(creation()[0]).toMatchObject({ id: 'w-new', op: 'upsert', created: true });

    const [edited] = planUploads(
      coach,
      { ...empty, workouts: [workout] },
      { ...empty, workouts: [{ ...workout, name: 'Push Day B' }] }
    );
    expect(edited.created).toBeUndefined();
  });

  it('leaves nothing to upload when deleted before it was ever sent', () => {
    const queue = enqueue([], creation());

    expect(enqueue(queue, [remove])).toEqual([]);
  });

  it('still sends its delete when its creation was already on the way', () => {
    const queue = enqueue([], creation()).map((entry) => ({ ...entry, sent: true }));

    expect(enqueue(queue, [remove])).toEqual([expect.objectContaining({ id: 'w-new', op: 'delete' })]);
  });
});
