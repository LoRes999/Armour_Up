import { sameValue } from './diff';
import { discard, pendingFor } from './outbox';
import { LOCAL_ONLY, META_FIELDS, SERVER_FALLBACKS } from './policy';
import {
  type CollectionName,
  type Fields,
  type Outbox,
  type RemoteChange,
  type SyncedData,
  listOf,
  withList,
} from './types';

/**
 * Brings changes from the server into the store.
 *
 * Two rules decide every conflict:
 * - A change still waiting on this phone wins, field by field, until it has
 *   been uploaded. The server's copy of those fields is about to be replaced
 *   anyway, and showing the old value in between would look like the edit was
 *   lost.
 * - A delete from the server wins over local edits. Uploading them would bring
 *   back a half-document nobody can see or remove.
 */

/** The server's document as a store entity. */
export function fromRemote(
  collection: CollectionName,
  id: string,
  remote: Fields,
  local: Fields | undefined
): Fields {
  const entity: Fields = {};
  for (const [key, value] of Object.entries(remote)) {
    if (META_FIELDS.includes(key) || value === null || value === undefined) continue;
    entity[key] = value;
  }
  for (const [key, fallback] of Object.entries(LOCAL_ONLY[collection])) {
    entity[key] = local && key in local ? local[key] : fallback;
  }
  // Kept by the server, which may not have worked it out yet. Until it has,
  // keep this phone's value, or the starting one: a missing field reached the
  // screen as "undefined".
  for (const [key, fallback] of Object.entries(SERVER_FALLBACKS[collection])) {
    if (key in entity) continue;
    entity[key] = local && typeof local[key] === typeof fallback ? local[key] : fallback;
  }
  entity.id = id;
  return entity;
}

function overlay(entity: Fields, pending: Fields): Fields {
  const out = { ...entity };
  for (const [key, value] of Object.entries(pending)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

export function applyRemoteChanges(
  data: SyncedData,
  changes: readonly RemoteChange[],
  outbox: Outbox
): { data: SyncedData; outbox: Outbox } {
  let nextData = data;
  let nextOutbox = outbox;

  for (const change of changes) {
    const list = listOf(nextData, change.collection) as unknown as readonly Fields[];
    const index = list.findIndex((entity) => entity.id === change.id);
    const local = index >= 0 ? list[index] : undefined;
    const pending = pendingFor(nextOutbox, change.collection, change.id);
    const removed = change.data === null || change.data.deleted === true;

    if (removed) {
      nextOutbox = discard(nextOutbox, change.collection, change.id);
      if (index >= 0) {
        nextData = withList(
          nextData,
          change.collection,
          list.filter((_, i) => i !== index) as unknown as { id: string }[]
        );
      }
      continue;
    }

    // Deleted here, not yet uploaded: the delete is on its way.
    if (pending?.op === 'delete') continue;

    let entity = fromRemote(change.collection, change.id, change.data as Fields, local);
    if (pending) entity = overlay(entity, pending.fields);
    // Unchanged: keep the very object the screens already hold, so nothing
    // re-renders and the next comparison can skip it by reference.
    if (local && sameValue(local, entity)) continue;

    const nextList =
      index >= 0 ? list.map((item, i) => (i === index ? entity : item)) : [...list, entity];
    nextData = withList(nextData, change.collection, nextList as unknown as { id: string }[]);
  }

  return { data: nextData, outbox: nextOutbox };
}
