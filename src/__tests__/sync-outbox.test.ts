import { acknowledge, discard, enqueue, pendingFor } from '../sync/outbox';
import type { OutboxEntry } from '../sync/types';

const upsert = (id: string, fields: Record<string, unknown>): OutboxEntry => ({
  collection: 'workouts',
  id,
  op: 'upsert',
  fields,
  rev: 0,
});
const remove = (id: string): OutboxEntry => ({ collection: 'workouts', id, op: 'delete', fields: {}, rev: 0 });

describe('the upload queue', () => {
  it('folds repeated changes to one document into one entry, in its first place', () => {
    let queue = enqueue([], [upsert('w-1', { name: 'A' }), upsert('w-2', { name: 'B' })]);
    queue = enqueue(queue, [upsert('w-1', { name: 'A2', coachNote: 'Brace hard' })]);

    expect(queue.map((entry) => entry.id)).toEqual(['w-1', 'w-2']);
    expect(queue[0].fields).toEqual({ name: 'A2', coachNote: 'Brace hard' });
    expect(queue[0].rev).toBe(1);
  });

  it('lets a delete replace waiting edits, and a re-creation replace the delete', () => {
    let queue = enqueue([], [upsert('w-1', { name: 'A' })]);
    queue = enqueue(queue, [remove('w-1')]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ op: 'delete', fields: {} });

    queue = enqueue(queue, [upsert('w-1', { name: 'Fresh', status: 'scheduled' })]);
    expect(queue[0]).toMatchObject({ op: 'upsert', fields: { name: 'Fresh', status: 'scheduled' } });
  });

  it('removes what the server confirmed', () => {
    const queue = enqueue([], [upsert('w-1', { name: 'A' }), upsert('w-2', { name: 'B' })]);
    expect(acknowledge(queue, [queue[0]]).map((entry) => entry.id)).toEqual(['w-2']);
  });

  // The race this protects against: an upload is in flight, the coach logs
  // another set, and the confirmation for the old version arrives.
  it('keeps an entry that changed while its upload was in flight', () => {
    const queue = enqueue([], [upsert('w-1', { name: 'A' })]);
    const inFlight = [...queue];
    const edited = enqueue(queue, [upsert('w-1', { coachNote: 'New note' })]);

    const after = acknowledge(edited, inFlight);
    expect(after).toHaveLength(1);
    expect(after[0].fields).toEqual({ name: 'A', coachNote: 'New note' });
  });

  it('survives being saved and read back, removals included', () => {
    const queue = enqueue([], [upsert('w-1', { dayTypeId: null, name: 'A' }), remove('w-2')]);
    expect(JSON.parse(JSON.stringify(queue))).toEqual(queue);
  });

  it('finds and discards what is waiting for one document', () => {
    const queue = enqueue([], [upsert('w-1', { name: 'A' }), upsert('w-2', { name: 'B' })]);
    expect(pendingFor(queue, 'workouts', 'w-2')?.fields).toEqual({ name: 'B' });
    expect(pendingFor(queue, 'clients', 'w-2')).toBeUndefined();
    expect(discard(queue, 'workouts', 'w-1').map((entry) => entry.id)).toEqual(['w-2']);
    expect(discard(queue, 'workouts', 'nope')).toBe(queue);
  });
});
