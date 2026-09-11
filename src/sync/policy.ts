import type { Workout } from '../models';
import { SAMPLE_CLIENT_IDS } from '../sampleData';
import type { CollectionName, Fields, OutboxEntry, SyncScope } from './types';

/**
 * What may be uploaded, by whom. firestore.rules enforces the same table on
 * the server; this copy exists so a phone never queues a change the server is
 * certain to refuse, which would only sit in the queue and then be dropped.
 */

/**
 * Kept by the server. A phone never uploads these and always takes the
 * server's value. The session count is recounted by a Cloud Function from the
 * completed workouts: the trainer's phone and the client's phone both saw the
 * session finish, and both adding one is how it would be counted twice.
 */
export const SERVER_OWNED: Readonly<Record<CollectionName, readonly string[]>> = {
  clients: ['sessionsCompleted', 'inviteCode', 'inviteAccepted', 'uid'],
  dayTypes: [],
  movements: [],
  workouts: [],
};

/**
 * Meaningful on this phone only. Never uploaded, and kept from the local copy
 * when the server's version arrives. Movement photos are files on the
 * trainer's phone until photo upload exists.
 */
export const LOCAL_ONLY: Readonly<Record<CollectionName, Readonly<Record<string, unknown>>>> = {
  clients: {},
  dayTypes: {},
  movements: { photoUris: [] },
  workouts: {},
};

/** Bookkeeping the server adds to every document. Not part of the app's models. */
export const META_FIELDS: readonly string[] = ['updatedAt', 'updatedBy', 'deleted', 'trainerId'];

/** Sample data is for trying the app out. It never leaves the phone. */
export function isSample(collection: CollectionName, entity: { id: string }): boolean {
  if (collection === 'clients') return SAMPLE_CLIENT_IDS.has(entity.id);
  if (collection === 'workouts') return SAMPLE_CLIENT_IDS.has((entity as Workout).clientId);
  return false;
}

function pick(fields: Fields, allowed: readonly string[]): Fields {
  const out: Fields = {};
  for (const key of allowed) if (key in fields) out[key] = fields[key];
  return out;
}

function omit(fields: Fields, excluded: readonly string[]): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) if (!excluded.includes(key)) out[key] = value;
  return out;
}

/**
 * Narrows a queued change to what this account may write, or null when it may
 * write none of it. `entity` is the document as the phone has it — the old
 * copy for a delete — because a workout's owner decides who can touch it.
 */
export function restrictToScope(
  scope: SyncScope,
  entry: OutboxEntry,
  entity: { id: string } | undefined
): OutboxEntry | null {
  const { collection } = entry;
  const writable = omit(entry.fields, [
    ...SERVER_OWNED[collection],
    ...Object.keys(LOCAL_ONLY[collection]),
  ]);
  const keep = (fields: Fields): OutboxEntry | null =>
    entry.op === 'upsert' && Object.keys(fields).length === 0 ? null : { ...entry, fields };

  if (scope.role === 'trainer') return keep(writable);

  // A client writes three things: their own unit, their own solo sessions,
  // and the "seen it" stamp on a session their trainer sent.
  if (collection === 'clients') {
    if (entry.id !== scope.clientId || entry.op === 'delete') return null;
    return keep(pick(writable, ['unit']));
  }
  if (collection === 'workouts') {
    const workout = entity as Workout | undefined;
    if (!workout || workout.clientId !== scope.clientId) return null;
    if (workout.loggedBy === 'client') return keep(writable);
    if (entry.op === 'delete') return null;
    return keep(pick(writable, ['seenByClientAt']));
  }
  return null;
}
